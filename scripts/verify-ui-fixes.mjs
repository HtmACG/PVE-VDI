/**
 * 界面改动的可视化验证：用系统 Edge + 本地静态服务渲染 out/renderer，
 * 通过 addInitScript 注入 window.pvevdi 假数据（无 preload 干扰），截图并断言关键样式。
 *
 * 运行：node scripts/verify-ui-fixes.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'screenshots', 'verify')
fs.mkdirSync(outDir, { recursive: true })

const rendererDir = path.join(root, 'out', 'renderer')
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  const filePath = path.join(rendererDir, urlPath === '/' ? 'index.html' : urlPath)
  if (!filePath.startsWith(rendererDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const GB = 1024 ** 3
const now = Date.now()

const makeSettings = (theme) => ({
  serverUrl: 'https://pve.example.com:8006',
  username: 'root@pam',
  allowSelfSigned: true,
  rememberPassword: false,
  hasSavedPassword: false,
  credentialStorageAvailable: true,
  theme,
  refreshInterval: 8,
  uiFont: 'inter',
  customFont: '',
  accentColor: '#0078d4',
  networkView: 'cards',
  launchAtLogin: false,
  appearanceVersion: 2,
  appBackground: ''
})

const node = (name, cpu) => ({
  node: name,
  status: 'online',
  uptime: 86400 * 12,
  cpu,
  maxcpu: 16,
  mem: 20 * GB,
  maxmem: 64 * GB,
  disk: 200 * GB,
  maxdisk: 2000 * GB,
  level: '',
  sslFingerprint: '',
  loadavg: [0.4, 0.5, 0.6],
  pveVersion: '8.2.4',
  cpuModel: 'Intel Xeon Gold 6338',
  sockets: 2,
  cores: 16,
  memAvailable: 40 * GB,
  kernelVersion: '6.8.12-2-pve',
  metrics: [{ time: now - 60000, cpu, mem: 0.3 }]
})

const dashboard = {
  fetchedAt: now,
  latencyMs: 24,
  version: { version: '8.2.4', release: '8.2', repoid: '9bf1d1d4' },
  cluster: {
    name: 'pve-cluster',
    quorate: true,
    nodeCount: 3,
    version: 8,
    ha: [{ id: 'ha/node/pve', type: 'node', node: 'pve', status: 'online' }],
    keyboard: 'en-us',
    allowedTags: []
  },
  nodes: [node('pve', 0.083), node('pve2', 0.12), node('pve3', 0.05)],
  vms: [
    {
      node: 'pve',
      type: 'qemu',
      vmid: 204,
      name: 'DBI-Business-Server',
      id: 'qemu/204',
      status: 'running',
      template: false,
      cpu: 0.037,
      maxcpu: 8,
      mem: 8 * GB,
      maxmem: 16 * GB,
      uptime: 3600 * 72,
      tags: ['dbi'],
      ostype: 'l26',
      os: { family: 'linux', name: 'Linux', version: '10.1.2', source: 'agent' },
      haManaged: false,
      cpus: 4,
      disk: 132 * GB,
      maxdisk: 200 * GB,
      netin: 21.3 * GB,
      netout: 1.2 * GB,
      diskread: 1.2 * GB,
      diskwrite: 0.4 * GB,
      pid: 2211,
      lock: null
    },
    {
      node: 'pve',
      type: 'lxc',
      vmid: 118,
      name: 'cert-hub',
      id: 'lxc/118',
      status: 'running',
      template: false,
      cpu: 0.01,
      maxcpu: 2,
      mem: 0.5 * GB,
      maxmem: 2 * GB,
      uptime: 3600 * 20,
      tags: [],
      ostype: 'debian',
      os: { family: 'linux', name: 'Debian', version: '12', source: 'ostype' },
      haManaged: false,
      cpus: 2,
      disk: 8 * GB,
      maxdisk: 20 * GB,
      netin: 1 * GB,
      netout: 0.3 * GB,
      diskread: 0.2 * GB,
      diskwrite: 0.1 * GB,
      pid: 912,
      lock: null
    }
  ],
  storages: [],
  tasks: []
}

const detail = {
  ref: { node: 'pve', type: 'qemu', vmid: 204 },
  name: 'DBI-Business-Server',
  os: { family: 'linux', name: 'Linux', version: '10.1.2', source: 'agent' },
  config: {
    cores: 4,
    sockets: 1,
    memory: 16384,
    ostype: 'l26',
    agent: 1,
    bios: 'seabios',
    scsihw: 'virtio-scsi-pci',
    net0: 'virtio=BC:24:11:98:15:8E,bridge=vmbr0,tag=120,firewall=1',
    net1: 'virtio=BC:24:11:6E:E1:AE,bridge=vmbr1',
    scsi0: 'local-lvm:vm-204-disk-0,size=32G',
    scsi1: 'local-lvm:vm-204-disk-1,size=100G,backup=0'
  },
  runtime: {
    status: 'running',
    cpus: 4,
    cpu: 0.037,
    mem: 8.6 * GB,
    maxmem: 16 * GB,
    memhost: 9 * GB,
    balloon: 16 * GB,
    uptime: 259200,
    pid: 2211,
    qmpStatus: 'running',
    runningMachine: 'pc-q35-8.1',
    runningQemu: '8.1.5',
    tags: ['dbi', 'production'],
    haManaged: false,
    agentEnabled: true,
    pressureCpu: 1.4,
    pressureIo: 0.2,
    pressureMemory: 0.4,
    netin: 21.3 * GB,
    netout: 1.2 * GB,
    diskread: 1.2 * GB,
    diskwrite: 0.4 * GB
  },
  metrics: Array.from({ length: 40 }, (_, i) => ({
    time: now - (40 - i) * 90000,
    cpu: 0.02 + Math.random() * 0.06,
    mem: 7.5 * GB,
    maxmem: 16 * GB
  })),
  disks: [
    { key: 'scsi0', volume: 'local-lvm:vm-204-disk-0', size: 32 * GB, format: 'raw', options: [], isCdrom: false },
    { key: 'scsi1', volume: 'local-lvm:vm-204-disk-1', size: 100 * GB, format: 'raw', options: ['backup=0'], isCdrom: false }
  ],
  snapshots: [{ name: 'before-upgrade', snaptime: 1761700000, vmstate: false, description: '升级前基线' }],
  tasks: [
    {
      upid: 'UPID:mock:1',
      type: 'qmstart',
      status: 'ok',
      node: 'pve',
      user: 'root@pam',
      startTime: 1761700000,
      endTime: 1761700010,
      duration: 10,
      id: '204'
    }
  ],
  agentInterfaces: [
    {
      name: 'lo',
      mac: '00:00:00:00:00:00',
      ips: [
        { type: 'ipv4', address: '127.0.0.1', prefix: 8 },
        { type: 'ipv6', address: '::1', prefix: 128 }
      ],
      rxBytes: 167772160,
      txBytes: 167772160
    },
    {
      name: 'ens18',
      mac: 'bc:24:11:9b:15:8e',
      ips: [
        { type: 'ipv4', address: '10.10.12.120', prefix: 24 },
        { type: 'ipv6', address: 'fe80::be24:11ff:fe9b:158e', prefix: 64 }
      ],
      rxBytes: 342 * GB,
      txBytes: 21.3 * GB
    },
    {
      name: 'ens19',
      mac: 'bc:24:11:6e:e1:ae',
      ips: [{ type: 'ipv6', address: 'fe80::be24:11ff:fe6e:e1ae', prefix: 64 }],
      rxBytes: 883 * 1024 ** 2,
      txBytes: 866 * 1024 ** 2
    }
  ]
}

const imagesData = {
  images: [
    {
      node: 'pve',
      storage: 'local',
      volid: 'local:iso/debian-12.5.0-amd64-netinst.iso',
      name: 'debian-12.5.0-amd64-netinst.iso',
      size: 629 * 1024 ** 2,
      format: 'iso',
      ctime: 1761700000
    }
  ],
  storages: [{ node: 'pve', storage: 'local', content: 'iso', total: 1, used: 0, avail: 1, active: true }]
}

/** 主窗口 mock：页面脚本执行前注入 window.pvevdi */
function mainMock(payload) {
  // addInitScript 会序列化函数体，数据通过第二个参数（payload）注入
  const { theme, dashboard, detail, imagesData } = payload
  const ok = (data) => Promise.resolve({ ok: true, data })
  const listeners = new Set()
  let current = { serverUrl: 'https://pve.example.com:8006', username: 'root@pam', allowSelfSigned: true, rememberPassword: false, hasSavedPassword: false, credentialStorageAvailable: true, theme: theme, refreshInterval: 8, uiFont: 'inter', customFont: '', accentColor: '#0078d4', networkView: 'cards', launchAtLogin: false, appearanceVersion: 2, appBackground: '' }
  Object.defineProperty(window, 'pvevdi', {
    configurable: true,
    writable: true,
    value: {
      bootstrap: () =>
        ok({
          appVersion: '1.7.0',
          settings: current,
          backgrounds: {},
          session: {
            serverUrl: 'https://pve.example.com:8006',
            username: 'root@pam',
            clusterName: 'pve-cluster',
            connectedAt: Date.now()
          },
          autoLoginError: null
        }),
      dashboard: () => ok(dashboard),
      liveMetrics: () => ok({ fetchedAt: Date.now(), nodes: [] }),
      vmDetail: () => ok(detail),
      isoImages: () => ok(imagesData),
      updatePreferences: (patch) => {
        current = { ...current, ...patch }
        for (const fn of listeners) fn(current)
        return ok(current)
      },
      onSettingsChanged: (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
      getWindowState: () => Promise.resolve({ maximized: false }),
      onWindowState: () => () => {},
      windowMinimize: () => {},
      windowHide: () => {},
      windowToggleMaximize: () => {},
      windowClose: () => {},
      openConsoleWindow: () => ok(null),
      openExternal: () => ok(null)
    }
  })
}

/** 控制台窗口 mock */
function consoleMock(payload) {
  const { theme } = payload
  const ok = (data) => Promise.resolve({ ok: true, data })
  const listeners = new Set()
  let current = { theme, accentColor: '#4cc2ff', uiFont: 'inter', customFont: '' }
  Object.defineProperty(window, 'pvevdi', {
    configurable: true,
    writable: true,
    value: {
      bootstrap: () => ok({ settings: current }),
      consoleWindowBootstrap: () =>
        ok({
          request: { kind: 'vm', node: 'pve', type: 'qemu', vmid: 300, name: 'DevOps-Server' },
          settings: current
        }),
      consoleOpen: () =>
        ok({
          sessionId: 'mock',
          mode: 'novnc',
          wsUrl: 'ws://127.0.0.1:1/none',
          vncPassword: '',
          title: 'DevOps-Server',
          subtitle: 'pve · QEMU 300 · noVNC',
          username: 'root@pam'
        }),
      consoleClose: () => ok(null),
      updatePreferences: (patch) => {
        current = { ...current, ...patch }
        for (const fn of listeners) fn(current)
        return ok(current)
      },
      onSettingsChanged: (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
      getWindowState: () => Promise.resolve({ maximized: false }),
      onWindowState: () => () => {},
      windowMinimize: () => {},
      windowToggleMaximize: () => {},
      windowClose: () => {}
    }
  })
}

const results = []
const check = (name, pass, extra = '') => results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
const shot = async (page, name) => {
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, name) })
}

const browser = await chromium.launch({ executablePath: edgePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 })
const logs = []

try {
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') logs.push(`[console] ${m.text()}`)
  })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.addInitScript(mainMock, { theme: 'light', dashboard, detail, imagesData })
  await page.goto(`http://127.0.0.1:${port}/index.html`)
  try {
    await page.waitForSelector('text=DBI-Business-Server', { timeout: 25_000 })
  } catch (error) {
    console.log('RENDER_LOGS://n' + logs.slice(0, 12).join('\n'))
    console.log('BODY://n' + (await page.evaluate(() => document.body.innerText)).slice(0, 600))
    await page.screenshot({ path: path.join(outDir, 'diag.png') })
    throw error
  }
  await page.waitForTimeout(1300)
  await shot(page, '02-overview-light.png')

  const themeClass = await page.evaluate(() => document.documentElement.className)
  check('主界面应用浅色主题', themeClass.includes('light'), `className=${themeClass}`)

  // 镜像页：刷新 / 从 URL 导入 必须是实底白
  await page.getByRole('button', { name: /^镜像/ }).first().click()
  await page.waitForTimeout(1200)
  const buttonStyles = await page.evaluate(() => {
    const pick = (text) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
      if (!btn) return null
      const cs = getComputedStyle(btn)
      return { bg: cs.backgroundColor, color: cs.color }
    }
    return { refresh: pick('刷新'), url: pick('从 URL 导入'), upload: pick('上传 ISO') }
  })
  check('“刷新”按钮为实底白', buttonStyles.refresh?.bg === 'rgb(255, 255, 255)', JSON.stringify(buttonStyles.refresh))
  check('“从 URL 导入”按钮为实底白', buttonStyles.url?.bg === 'rgb(255, 255, 255)', JSON.stringify(buttonStyles.url))
  await shot(page, '03-images-light.png')

  // 虚拟机抽屉
  await page.getByRole('button', { name: /^虚拟机/ }).first().click()
  await page.waitForTimeout(900)
  await page.locator('tbody tr', { hasText: 'DBI-Business-Server' }).first().click()
  await page.waitForSelector('text=性能遥测', { timeout: 20_000 })
  await shot(page, '04-drawer-light-overview.png')

  await page.getByRole('tab', { name: '网络' }).click()
  await shot(page, '05-drawer-light-network.png')

  await page.getByRole('tab', { name: '硬件' }).click()
  await shot(page, '06-drawer-light-hardware.png')

  const layout = await page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')
    if (!sheet) return null
    const r = sheet.getBoundingClientRect()
    const scroller = sheet.querySelector('.overflow-y-auto')
    return {
      width: Math.round(r.width),
      scrollW: scroller ? scroller.scrollWidth : 0,
      clientW: scroller ? scroller.clientWidth : 0
    }
  })
  check('抽屉宽度适中（≤780px）', Boolean(layout) && layout.width <= 780, JSON.stringify(layout))
  check('抽屉内容无横向溢出', Boolean(layout) && layout.scrollW <= layout.clientW + 1, JSON.stringify(layout))

  // 深色模式
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await page.evaluate(async () => window.pvevdi.updatePreferences({ theme: 'dark' }))
  await page.waitForTimeout(900)
  await shot(page, '07-list-dark.png')

  await page.locator('tbody tr', { hasText: 'DBI-Business-Server' }).first().click()
  await page.waitForSelector('text=性能遥测', { timeout: 20_000 })
  await shot(page, '08-drawer-dark-overview.png')
  await page.getByRole('tab', { name: '网络' }).click()
  await shot(page, '09-drawer-dark-network.png')
  await page.keyboard.press('Escape')

  // 控制台窗口
  const consolePage = await context.newPage()
  consolePage.on('pageerror', (e) => logs.push(`[console-window] ${e.message}`))
  await consolePage.addInitScript(consoleMock, { theme: 'dark' })
  await consolePage.setViewportSize({ width: 1280, height: 780 })
  await consolePage.goto(`http://127.0.0.1:${port}/index.html?console=1`)
  await consolePage.waitForSelector('[data-console-root]', { timeout: 20_000 })
  await consolePage.waitForTimeout(1800)
  await consolePage.screenshot({ path: path.join(outDir, '10-console-dark.png') })

  const consoleMetrics = await consolePage.evaluate(() => {
    const rootEl = document.querySelector('[data-console-root]')
    const header = rootEl.querySelector('header')
    const canvas = rootEl.querySelector('.relative.min-h-0.flex-1')
    const hasFooterText = rootEl.textContent.includes('本地回环桥')
    return {
      rootH: Math.round(rootEl.getBoundingClientRect().height),
      headerH: Math.round(header.getBoundingClientRect().height),
      canvasH: Math.round(canvas.getBoundingClientRect().height),
      hasFooterText,
      scrollH: document.documentElement.scrollHeight
    }
  })
  check('控制台无底部状态条', !consoleMetrics.hasFooterText, JSON.stringify(consoleMetrics))
  check(
    '控制台画布顶到窗口底部',
    consoleMetrics.canvasH >= consoleMetrics.rootH - consoleMetrics.headerH - 1,
    JSON.stringify(consoleMetrics)
  )
  check('控制台无纵向溢出', consoleMetrics.scrollH <= 780, `scrollH=${consoleMetrics.scrollH}`)

  await consolePage.evaluate(async () => window.pvevdi.updatePreferences({ theme: 'light' }))
  await consolePage.waitForTimeout(1000)
  const consoleLight = await consolePage.evaluate(() => ({
    cls: document.documentElement.className,
    headerBg: getComputedStyle(document.querySelector('[data-console-root] header')).backgroundColor,
    canvasBg: getComputedStyle(document.querySelector('[data-console-root] .relative.min-h-0.flex-1')).backgroundColor
  }))
  check('控制台跟随日夜切换', consoleLight.cls.includes('light'), JSON.stringify(consoleLight))
  await consolePage.screenshot({ path: path.join(outDir, '11-console-light.png') })
} catch (err) {
  results.push(`FAIL  脚本异常 — ${err.message}`)
  console.error(err)
} finally {
  console.log(results.join('\n'))
  if (logs.length) console.log('\nrenderer 错误日志:\n' + logs.slice(0, 15).join('\n'))
  await browser.close().catch(() => {})
  server.close()
}
