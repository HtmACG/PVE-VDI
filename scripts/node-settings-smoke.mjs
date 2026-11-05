import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const screenshotDir = process.env.SCREENSHOT_DIR
  ? path.resolve(root, process.env.SCREENSHOT_DIR)
  : path.join(root, 'screenshots')
fs.mkdirSync(screenshotDir, { recursive: true })

const password = process.env.PVE_PASSWORD
const serverUrl = process.env.PVE_SERVER_URL
const username = process.env.PVE_USERNAME || 'root@pam'
if (!password || !serverUrl) {
  console.error('PVE_PASSWORD and PVE_SERVER_URL environment variables are required')
  process.exit(1)
}

const localElectron = path.join(root, 'node_modules', 'electron', 'dist')
const tempRoot = path.join(process.env.LOCALAPPDATA || 'C:\\Temp', 'pve-vdi-electron')
const executablePath = process.env.PACKAGED_EXE || path.join(tempRoot, 'electron.exe')
if (!process.env.PACKAGED_EXE && !fs.existsSync(executablePath)) {
  fs.cpSync(localElectron, tempRoot, { recursive: true })
}

const electronApp = await electron.launch({
  executablePath,
  args: [
    ...(process.env.PACKAGED_EXE ? [] : [root]),
    ...(process.env.PVE_TEST_USER_DATA ? [`--user-data-dir=${process.env.PVE_TEST_USER_DATA}`] : [])
  ],
  cwd: process.env.PACKAGED_EXE ? path.dirname(process.env.PACKAGED_EXE) : root,
  env: (() => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    return { ...env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  })(),
  timeout: 45_000
})

const errors = []
const attached = new WeakSet()
const attach = (page) => {
  if (attached.has(page)) return
  attached.add(page)
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console] ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`))
}
electronApp.on('window', attach)

try {
  const win = await electronApp.firstWindow({ timeout: 45_000 })
  attach(win)
  await win.waitForLoadState('domcontentloaded')
  await win.locator('#server-url').fill(serverUrl)
  await win.locator('#username').fill(username)
  await win.locator('#password').fill(password)
  await win.getByRole('button', { name: '建立连接' }).click()
  await win.waitForSelector('text=运行概览', { timeout: 45_000 })

  await win.getByRole('button', { name: /^节点/ }).first().click()
  await win.waitForTimeout(700)
  await win.getByRole('button', { name: '设置', exact: true }).last().click()
  await win.waitForSelector('text=节点设置', { timeout: 20_000 })
  await win.waitForSelector('text=应用配置', { timeout: 30_000 })
  await win.waitForTimeout(700)
  const networkRows = await win.locator('tbody tr').count()
  console.log('network rows:', networkRows)
  await win.screenshot({ path: path.join(screenshotDir, 'node-network.png'), fullPage: true })

  await win.getByRole('button', { name: '添加接口' }).click()
  await win.waitForSelector('text=添加网络接口', { timeout: 10_000 })
  await win.getByRole('button', { name: '取消', exact: true }).click()
  await win.waitForTimeout(300)

  for (const section of [
    'dns',
    'time',
    'certificates',
    'hostname',
    'options',
    'repositories',
    'firewall-options',
    'lvm',
    'lvmthin',
    'directory',
    'zfs'
  ]) {
    await win.locator(`[data-section="${section}"]`).click()
    await win.waitForTimeout(450)
    console.log('opened', section)
  }

  await win.locator('[data-section="syslog"]').click()
  await win.waitForSelector('text=系统日志', { timeout: 10_000 })
  await win.waitForTimeout(2500)
  console.log('opened syslog')

  await win.locator('[data-section="firewall-log"]').click()
  await win.waitForSelector('text=防火墙日志', { timeout: 10_000 })
  await win.waitForTimeout(1200)
  console.log('opened firewall-log')

  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('node settings smoke passed without renderer errors')
  }
} finally {
  await electronApp.close().catch(() => {})
}
