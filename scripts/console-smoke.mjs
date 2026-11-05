import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const screenshotDir = process.env.SCREENSHOT_DIR
  ? path.resolve(root, process.env.SCREENSHOT_DIR)
  : path.join(root, 'docs', 'screenshots')
fs.mkdirSync(screenshotDir, { recursive: true })

const password = process.env.PVE_PASSWORD
const serverUrl = process.env.PVE_SERVER_URL
const username = process.env.PVE_USERNAME || 'root@pam'
const consoleVmName = process.env.PVE_CONSOLE_VM_NAME
if (!password || !serverUrl || !consoleVmName) {
  console.error('PVE_PASSWORD, PVE_SERVER_URL and PVE_CONSOLE_VM_NAME environment variables are required')
  process.exit(1)
}

const packagedExe = process.env.PACKAGED_EXE
const localElectron = path.join(root, 'node_modules', 'electron', 'dist')
let executablePath = packagedExe || process.env.ELECTRON_EXECUTABLE
if (!executablePath) {
  const tempRoot = path.join(process.env.LOCALAPPDATA || 'C:\\Temp', 'pve-vdi-electron')
  const installedPath = path.join(tempRoot, 'electron.exe')
  if (!fs.existsSync(installedPath)) {
    fs.cpSync(localElectron, tempRoot, { recursive: true })
  }
  executablePath = installedPath
}

const electronApp = await electron.launch({
  executablePath,
  args: [
    ...(packagedExe ? [] : [root]),
    ...(process.env.PVE_TEST_USER_DATA ? [`--user-data-dir=${process.env.PVE_TEST_USER_DATA}`] : [])
  ],
  cwd: packagedExe ? path.dirname(packagedExe) : root,
  env: (() => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    return { ...env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  })(),
  timeout: 45_000
})

const errors = []
const attachedPages = new WeakSet()
const attachErrors = (page) => {
  if (attachedPages.has(page)) return
  attachedPages.add(page)
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console] ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`))
}
electronApp.on('window', attachErrors)

let win
try {
  win = await electronApp.firstWindow({ timeout: 45_000 })
  attachErrors(win)

  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1000)
  await win.locator('#server-url').fill(serverUrl)
  await win.locator('#username').fill(username)
  await win.locator('#password').fill(password)
  await win.getByRole('button', { name: '建立连接' }).click()
  await win.waitForSelector('text=运行概览', { timeout: 45_000 })

  await win.getByRole('button', { name: /^虚拟机/ }).first().click()
  await win.waitForTimeout(900)
  await win.locator('tbody tr', { hasText: consoleVmName }).first().click()
  await win.waitForSelector('text=性能遥测', { timeout: 20_000 })
  const vncWindowPromise = electronApp.waitForEvent('window', { timeout: 30_000 })
  await win.getByRole('button', { name: '控制台', exact: true }).click()
  const vncWindow = await vncWindowPromise
  await vncWindow.waitForLoadState('domcontentloaded')
  await vncWindow.getByText('已连接', { exact: true }).first().waitFor({ timeout: 45_000 })
  await vncWindow.waitForTimeout(2500)
  console.log('windows after opening noVNC:', electronApp.windows().length)
  await vncWindow.screenshot({ path: path.join(screenshotDir, 'novnc.png') })
  console.log('noVNC connected in independent window, screenshot written')
  await vncWindow.getByRole('button', { name: '关闭' }).click({ noWaitAfter: true }).catch(() => {})
  await win.waitForTimeout(700)
  await win.keyboard.press('Escape')
  await win.waitForTimeout(700)

  await win.getByRole('button', { name: /^节点/ }).first().click()
  await win.waitForSelector('text=节点健康', { timeout: 15_000 }).catch(() => {})
  const shellWindowPromise = electronApp.waitForEvent('window', { timeout: 30_000 })
  await win.getByRole('button', { name: '终端', exact: true }).first().click()
  const shellWindow = await shellWindowPromise
  await shellWindow.waitForLoadState('domcontentloaded')
  await shellWindow.locator('.xterm-helper-textarea').waitFor({ timeout: 30_000 })
  await shellWindow.waitForTimeout(1500)
  await shellWindow.locator('.xterm-screen').click()
  await shellWindow.keyboard.type('echo PVE_VDI_XTERM_OK')
  await shellWindow.keyboard.press('Enter')
  await shellWindow.waitForFunction(
    () =>
      document.body.innerText.includes('PVE_VDI_XTERM_OK') ||
      [...document.querySelectorAll('.xterm-rows')].some((node) =>
        (node.textContent || '').includes('PVE_VDI_XTERM_OK')
      ),
    { timeout: 20_000 }
  )
  await shellWindow.waitForTimeout(500)
  console.log('windows after opening xterm:', electronApp.windows().length)
  await shellWindow.screenshot({ path: path.join(screenshotDir, 'xterm-shell.png') })
  console.log('xterm shell command verified in independent window, screenshot written')
  await shellWindow.getByRole('button', { name: '关闭' }).click({ noWaitAfter: true }).catch(() => {})
  await win.waitForTimeout(500)

  if (errors.length) {
    console.log('renderer errors:')
    for (const error of errors) console.log(error.slice(0, 1200))
    process.exitCode = 1
  } else {
    console.log('console smoke test passed without renderer errors')
  }
} catch (error) {
  console.error('Console smoke test failed:', error)
  process.exitCode = 1
} finally {
  try {
    await electronApp.close()
  } catch (error) {
    console.error('Failed to close Electron:', error)
  }
}
