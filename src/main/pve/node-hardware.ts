import { randomBytes } from 'node:crypto'
import { WebSocket, type RawData } from 'ws'
import type { NodeTemperatureReading } from '@shared/types'
import { PveError, type PveClient } from './client'

type Raw = Record<string, unknown>

const PROBE_TIMEOUT_MS = 15_000
const SCRIPT_DELAY_MS = 650

export interface NodeProbeResult {
  manufacturer?: string
  productName?: string
  productVersion?: string
  boardName?: string
  temperatures: NodeTemperatureReading[]
  cpuTemperature?: number
  cpuTemperatureMax?: number
  cpuTemperatureCritical?: number
  warnings: string[]
}

function isRaw(value: unknown): value is Raw {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanDmi(value: string): string | undefined {
  const cleaned = value.replace(/\0/g, '').trim()
  if (!cleaned) return undefined
  if (
    /^(to be filled by o\.e\.m\.?|default string|not specified|not available|none|unknown|system manufacturer|system product name|system version|base board manufacturer|base board product name)$/i.test(
      cleaned
    )
  ) {
    return undefined
  }
  return cleaned.slice(0, 120)
}

function normalizeTemperature(input: unknown): number | undefined {
  const value = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(value)) return undefined
  let celsius = value
  if (Math.abs(celsius) > 1000) celsius /= 1000
  if (celsius < -40 || celsius > 200) return undefined
  return Math.round(celsius * 10) / 10
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\r/g, '')
}

function parseSensorJson(jsonText: string): NodeTemperatureReading[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return []
  }
  if (!isRaw(parsed)) return []

  const readings: NodeTemperatureReading[] = []
  for (const [chip, chipValue] of Object.entries(parsed)) {
    if (!isRaw(chipValue)) continue
    for (const [label, groupValue] of Object.entries(chipValue)) {
      if (!isRaw(groupValue)) continue
      for (const [key, rawValue] of Object.entries(groupValue)) {
        const match = /^temp(\d+)_input$/.exec(key)
        if (!match) continue
        const value = normalizeTemperature(rawValue)
        if (value === undefined) continue
        const max = normalizeTemperature(groupValue[`temp${match[1]}_max`])
        const critical = normalizeTemperature(groupValue[`temp${match[1]}_crit`])
        readings.push({ label: label.slice(0, 80), source: chip.slice(0, 80), value, max, critical })
      }
    }
  }
  return readings
}

function parseHwmonLines(text: string): NodeTemperatureReading[] {
  const readings: NodeTemperatureReading[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('HWMON|')) continue
    const parts = line.split('|')
    if (parts.length < 4) continue
    const source = parts[1].trim().slice(0, 80)
    const label = parts[2].trim().slice(0, 80)
    const value = normalizeTemperature(parts[3].trim())
    if (value === undefined) continue
    readings.push({ source, label: label || source || '温度', value })
  }
  return readings
}

function dedupeReadings(readings: NodeTemperatureReading[]): NodeTemperatureReading[] {
  const result: NodeTemperatureReading[] = []
  for (const reading of readings) {
    const label = reading.label.trim().toLowerCase()
    const duplicate = result.some(
      (existing) =>
        existing.label.trim().toLowerCase() === label && Math.abs(existing.value - reading.value) < 1
    )
    if (!duplicate) result.push(reading)
  }
  return result
}

function cpuScore(reading: NodeTemperatureReading): number {
  const label = `${reading.source ?? ''} ${reading.label}`.toLowerCase()
  if (!/coretemp|k10temp|zenpower|cpu_thermal|cpu|package|tctl|tdie|core/.test(label)) return 0
  if (/nvme|drivetemp|pch|board|ambient|gpu|acpitz/.test(label)) return 0
  if (/package id 0|package|tctl|tdie|cpu temp|cpu temperature|物理 id 0/.test(label)) return 100
  if (/core/.test(label)) return 80
  return 60
}

function chooseCpuReading(readings: NodeTemperatureReading[]): NodeTemperatureReading | undefined {
  let best: NodeTemperatureReading | undefined
  let bestScore = 0
  for (const reading of readings) {
    const score = cpuScore(reading)
    if (score > bestScore) {
      best = reading
      bestScore = score
    }
  }
  return best
}

function parseDmiLines(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (!line.startsWith('DMI|')) continue
    const first = line.indexOf('|')
    const second = line.indexOf('|', first + 1)
    if (first < 0 || second < 0) continue
    const key = line.slice(first + 1, second).trim()
    const value = cleanDmi(line.slice(second + 1))
    if (key && value) values[key] = value
  }
  return values
}

function parseProbeOutput(raw: string, markers: ProbeMarkers): NodeProbeResult {
  const clean = stripAnsi(raw)
  const warnings: string[] = []
  const endAt = clean.lastIndexOf(markers.end)
  const beginAt = endAt < 0 ? -1 : clean.lastIndexOf(markers.begin, endAt)
  if (beginAt < 0 || endAt < 0) {
    return { temperatures: [], warnings: ['节点传感器输出不完整，请稍后重试。'] }
  }
  const body = clean.slice(beginAt + markers.begin.length, endAt)

  const dmi = parseDmiLines(body)
  const sensorsStart = body.indexOf(markers.sensorsBegin)
  const sensorsEnd = body.indexOf(markers.sensorsEnd)
  let sensorReadings: NodeTemperatureReading[] = []
  if (sensorsStart >= 0 && sensorsEnd > sensorsStart) {
    const jsonText = body.slice(sensorsStart + markers.sensorsBegin.length, sensorsEnd)
    sensorReadings = parseSensorJson(jsonText)
    if (sensorReadings.length === 0 && jsonText.trim()) {
      warnings.push('lm-sensors 输出无法解析，已改用内核 hwmon 数据。')
    }
  }
  const hwmonReadings = parseHwmonLines(body)
  const temperatures = dedupeReadings([...sensorReadings, ...hwmonReadings]).sort((a, b) => b.value - a.value)

  const cpu = chooseCpuReading(temperatures)
  if (temperatures.length === 0) {
    warnings.push('节点未提供可读取的温度传感器。')
  }
  return {
    manufacturer: dmi.sys_vendor,
    productName: dmi.product_name,
    productVersion: dmi.product_version,
    boardName: dmi.board_name,
    temperatures,
    cpuTemperature: cpu?.value,
    cpuTemperatureMax: cpu?.max,
    cpuTemperatureCritical: cpu?.critical,
    warnings
  }
}

interface ProbeMarkers {
  begin: string
  sensorsBegin: string
  sensorsEnd: string
  end: string
}

function buildProbeScript(markers: ProbeMarkers): string {
  return [
    'stty -echo 2>/dev/null',
    'export LC_ALL=C',
    `printf '\\n${markers.begin}\\n'`,
    'for f in sys_vendor product_name product_version board_vendor board_name; do',
    '  printf "DMI|%s|%s\\n" "$f" "$(cat /sys/class/dmi/id/$f 2>/dev/null)"',
    'done',
    'if command -v sensors >/dev/null 2>&1; then',
    `  printf '${markers.sensorsBegin}\\n'`,
    '  sensors -j 2>/dev/null',
    `  printf '\\n${markers.sensorsEnd}\\n'`,
    'fi',
    'for h in /sys/class/hwmon/hwmon*; do',
    '  [ -d "$h" ] || continue',
    '  n=$(cat "$h/name" 2>/dev/null)',
    '  for t in "$h"/temp*_input; do',
    '    [ -f "$t" ] || continue',
    '    l=$(cat "${t%_input}_label" 2>/dev/null)',
    '    printf "HWMON|%s|%s|%s\\n" "$n" "$l" "$(cat "$t" 2>/dev/null)"',
    '  done',
    'done',
    `printf '\\n${markers.end}\\n'`,
    'stty echo 2>/dev/null',
    'exit'
  ].join('\n') + '\n'
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data as ArrayBuffer).toString('utf8')
}

/**
 * Opens a short-lived root shell through PVE's termproxy endpoint, prints a
 * fixed read-only sensor script, and closes the session again. This is the
 * only way to read DMI product data and hwmon temperatures; PVE does not
 * expose them through its regular JSON API.
 */
export async function probeNodeHardware(client: PveClient, node: string): Promise<NodeProbeResult> {
  if (client.username !== 'root@pam') {
    throw new PveError('FORBIDDEN', '读取服务器型号与 CPU 温度需要 root@pam 终端权限。')
  }

  const term = await client.request<{ port: number | string; ticket: string; user?: string }>(
    `/nodes/${encodeURIComponent(node)}/termproxy`,
    { method: 'POST', timeoutMs: 12_000 }
  )
  if (!term?.ticket || term.port === undefined) {
    throw new PveError('PROBE_ERROR', 'PVE 没有返回节点终端凭据。')
  }

  const markers: ProbeMarkers = {
    begin: `__PVEVDI_BEGIN_${randomBytes(6).toString('hex')}__`,
    sensorsBegin: `__PVEVDI_SENSORS_${randomBytes(6).toString('hex')}__`,
    sensorsEnd: `__PVEVDI_SENSORS_END_${randomBytes(6).toString('hex')}__`,
    end: `__PVEVDI_END_${randomBytes(6).toString('hex')}__`
  }
  const script = buildProbeScript(markers)

  const url = new URL(client.serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/api2/json/nodes/${encodeURIComponent(node)}/vncwebsocket`
  url.search = ''
  url.searchParams.set('port', String(term.port))
  url.searchParams.set('vncticket', term.ticket)

  return new Promise<NodeProbeResult>((resolve, reject) => {
    const socket = new WebSocket(url.toString(), ['binary'], {
      agent: client.tlsAgent,
      rejectUnauthorized: !client.allowSelfSigned,
      headers: {
        Cookie: client.authCookieHeader,
        'User-Agent': 'PVE-VDI/1.5'
      },
      handshakeTimeout: 12_000,
      perMessageDeflate: false,
      maxPayload: 2 * 1024 * 1024
    })

    let settled = false
    let authenticated = false
    let buffer = ''
    let scriptTimer: NodeJS.Timeout | undefined
    let echoTimer: NodeJS.Timeout | undefined
    let finishTimer: NodeJS.Timeout | undefined
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      if (scriptTimer) clearTimeout(scriptTimer)
      if (echoTimer) clearTimeout(echoTimer)
      if (finishTimer) clearTimeout(finishTimer)
      try {
        socket.close()
      } catch {
        // The socket may already be closed.
      }
      if (buffer.includes(markers.begin)) {
        const partial = parseProbeOutput(buffer, markers)
        partial.warnings.push('读取传感器超时，结果可能不完整。')
        resolve(partial)
      } else {
        reject(new PveError('PROBE_TIMEOUT', '读取节点传感器超时。'))
      }
    }, PROBE_TIMEOUT_MS)

    const finish = (result: NodeProbeResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (scriptTimer) clearTimeout(scriptTimer)
      if (echoTimer) clearTimeout(echoTimer)
      if (finishTimer) clearTimeout(finishTimer)
      try {
        socket.close()
      } catch {
        // The socket may already be closed.
      }
      resolve(result)
    }

    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (scriptTimer) clearTimeout(scriptTimer)
      if (echoTimer) clearTimeout(echoTimer)
      if (finishTimer) clearTimeout(finishTimer)
      try {
        socket.close()
      } catch {
        // The socket may already be closed.
      }
      reject(error)
    }

    socket.on('open', () => {
      socket.send(`${term.user || client.username}:${term.ticket}\n`)
    })

    socket.on('message', (data) => {
      if (settled) return
      const text = rawToString(data)
      if (!authenticated) {
        if (!text.startsWith('OK')) {
          fail(new PveError('PROBE_ERROR', '节点终端认证被 PVE 拒绝。'))
          return
        }
        authenticated = true
        buffer += text.slice(2)
        scriptTimer = setTimeout(() => {
          if (settled || socket.readyState !== WebSocket.OPEN) return
          const disableEcho = 'stty -echo 2>/dev/null\n'
          socket.send(`0:${Buffer.byteLength(disableEcho)}:${disableEcho}`)
          echoTimer = setTimeout(() => {
            if (settled || socket.readyState !== WebSocket.OPEN) return
            socket.send(`0:${Buffer.byteLength(script)}:${script}`)
          }, 140)
        }, SCRIPT_DELAY_MS)
        return
      }
      buffer += text
      if (buffer.includes(markers.end) && !finishTimer) {
        // Give the pty a moment to flush the real output after any echoed
        // script lines; the parser uses the last marker pair.
        finishTimer = setTimeout(() => {
          if (settled) return
          finish(parseProbeOutput(buffer, markers))
        }, 300)
      }
    })

    socket.on('error', () => {
      fail(new PveError('PROBE_ERROR', '无法连接节点终端以读取传感器。'))
    })

    socket.on('close', () => {
      if (settled) return
      if (buffer.includes(markers.end)) {
        finish(parseProbeOutput(buffer, markers))
        return
      }
      fail(new PveError('PROBE_ERROR', '节点终端在返回传感器数据前关闭。'))
    })
  })
}
