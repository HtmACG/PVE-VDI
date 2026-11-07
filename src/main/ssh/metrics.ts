import type { SshPool, SshTarget } from './client'

/**
 * 从 /proc/stat 采按线程 CPU 占用。
 *
 * PVE 的 rrddata 只暴露聚合 cpu，不返回 cpuN，所以按核负载只能到节点上读。
 * /proc/stat 的 cpuN 行是自开机以来的累计 jiffies，必须两次采样做差分才能得到
 * 瞬时占用率——单次读取只能算平均，反映不出当前负载。
 *
 * 字段顺序（kernel 2.6 以后稳定）：
 *   cpuN user nice system idle iowait irq softirq steal guest guest_nice
 * 其中 idle 与 iowait 都算"空闲"，其余算"忙"。
 */

interface StatSnapshot {
  at: number
  /** 索引即线程号，值是该线程的累计忙/总 jiffies */
  cores: Array<{ busy: number; total: number }>
}

const SLEEP_SECONDS = 0.45

function parseStat(raw: string): StatSnapshot | null {
  const cores: Array<{ busy: number; total: number }> = []
  for (const line of raw.split('\n')) {
    // 只取 cpu0 / cpu1 … 的行，跳过聚合的 cpu 行
    const match = /^cpu(\d+)\s+(.+)$/.exec(line.trim())
    if (!match) continue
    const index = Number(match[1])
    const fields = match[2].trim().split(/\s+/).map((value) => Number(value) || 0)
    if (fields.length < 5) continue
    const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = fields
    const idleTotal = idle + iowait
    const busy = user + nice + system + irq + softirq + steal
    cores[index] = { busy, total: busy + idleTotal }
  }
  if (cores.length === 0) return null
  // 索引可能因线程数变化出现空洞，过滤掉
  return { at: Date.now(), cores: cores.filter(Boolean) }
}

/** 两次采样做差分，得出每个线程 0~1 的占用率 */
function diff(before: StatSnapshot, after: StatSnapshot): number[] {
  const length = Math.min(before.cores.length, after.cores.length)
  const result: number[] = []
  for (let index = 0; index < length; index += 1) {
    const prev = before.cores[index]
    const next = after.cores[index]
    const totalDelta = next.total - prev.total
    if (totalDelta <= 0) {
      result.push(0)
      continue
    }
    const busyDelta = next.busy - prev.busy
    // 计数器回绕或热插拔会导致差值为负，夹到 0
    result.push(Math.min(1, Math.max(0, busyDelta / totalDelta)))
  }
  return result
}

/**
 * 采样一次按核负载。用一条命令取两次快照，避免两次 SSH 往返的时间差干扰差分
 * （往返间隔有几十毫秒抖动，两次采样之间线程数变化也会错位）。
 */
export async function sampleCoreLoads(pool: SshPool, target: SshTarget): Promise<number[] | undefined> {
  try {
    const result = await pool.exec(
      target,
      `cat /proc/stat; sleep ${SLEEP_SECONDS}; echo '__SPLIT__'; cat /proc/stat`
    )
    const [rawBefore, rawAfter] = result.stdout.split('__SPLIT__')
    if (!rawBefore || !rawAfter) return undefined
    const before = parseStat(rawBefore)
    const after = parseStat(rawAfter)
    if (!before || !after) return undefined
    const loads = diff(before, after)
    return loads.length > 0 ? loads : undefined
  } catch {
    // 采样失败不该拖垮整个 dashboard：返回 undefined，前端退回占位显示
    return undefined
  }
}

/** 探测节点 SSH 是否可用，用于设置页的状态提示 */
export async function probeSsh(pool: SshPool, target: SshTarget): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await pool.exec(target, 'grep -c ^processor /proc/cpuinfo')
    if (result.code !== 0) {
      return { ok: false, message: result.stderr.trim() || `退出码 ${result.code}` }
    }
    const threads = Number(result.stdout.trim())
    return { ok: true, message: `SSH 可用，检测到 ${Number.isFinite(threads) ? threads : '?'} 个线程` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
