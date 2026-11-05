import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const password = process.env.PVE_PASSWORD
const serverUrl = process.env.PVE_SERVER_URL
const username = process.env.PVE_USERNAME || 'root@pam'
if (!password || !serverUrl) {
  console.error('PVE_PASSWORD and PVE_SERVER_URL environment variables are required')
  process.exit(1)
}

const localElectron = path.join(root, 'node_modules', 'electron', 'dist')
const tempRoot = path.join(process.env.LOCALAPPDATA || 'C:\\Temp', 'pve-vdi-electron')
const installedPath = path.join(tempRoot, 'electron.exe')
if (!fs.existsSync(installedPath)) fs.cpSync(localElectron, tempRoot, { recursive: true })

const app = await electron.launch({
  executablePath: installedPath,
  args: [root, ...(process.env.PVE_TEST_USER_DATA ? [`--user-data-dir=${process.env.PVE_TEST_USER_DATA}`] : [])],
  cwd: root,
  env: (() => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    return { ...env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  })(),
  timeout: 45_000
})

const errors = []
let win
let originalSettings = null
try {
  win = await app.firstWindow({ timeout: 45_000 })
  win.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console] ${message.text()}`)
  })
  win.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`))
  await win.waitForLoadState('domcontentloaded')

  const loginVisible = await win.locator('#server-url').isVisible().catch(() => false)
  if (loginVisible) {
    await win.locator('#server-url').fill(serverUrl)
    await win.locator('#username').fill(username)
    await win.locator('#password').fill(password)
    await win.getByRole('button', { name: '建立连接' }).click()
  }
  await win.waitForSelector('text=运行概览', { timeout: 45_000 })

  const boot = await win.evaluate(async () => {
    const result = await window.pvevdi.bootstrap()
    return result.ok ? result.data.settings : null
  })
  if (!boot) throw new Error('Could not read the original settings')
  originalSettings = boot

  await win.getByRole('button', { name: /^设置/ }).first().click()
  await win.waitForSelector('text=界面字体', { timeout: 15_000 })

  await win.getByRole('button', { name: '使用信号蓝强调色' }).click()
  await win.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase() === '#3b82f6',
    { timeout: 10_000 }
  )
  console.log('accent color applies:', true)

  const fontSelect = win.getByRole('combobox', { name: '界面字体' })
  await fontSelect.click()
  await win.getByRole('option', { name: /^系统字体/ }).click()
  await win.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--ui-font').includes('system-ui'),
    { timeout: 10_000 }
  )
  console.log('font preset applies:', true)

  await fontSelect.click()
  await win.getByRole('option', { name: /^自定义/ }).click()
  await win.getByRole('textbox', { name: '自定义字体族' }).fill('"Microsoft YaHei", sans-serif')
  await win.getByRole('button', { name: '应用字体' }).click()
  await win.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--ui-font').includes('Microsoft YaHei'),
    { timeout: 10_000 }
  )
  console.log('custom font applies:', true)

  await win.getByRole('textbox', { name: '强调色十六进制值' }).fill('#e11d48')
  await win.getByRole('button', { name: '应用颜色' }).click()
  await win.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase() === '#e11d48',
    { timeout: 10_000 }
  )
  const persisted = await win.evaluate(async () => {
    const result = await window.pvevdi.bootstrap()
    return result.ok ? result.data.settings : null
  })
  console.log('persisted appearance:', {
    uiFont: persisted?.uiFont,
    customFont: persisted?.customFont,
    accentColor: persisted?.accentColor
  })

  if (errors.length) {
    console.log('renderer errors:')
    errors.forEach((error) => console.log(error.slice(0, 1200)))
    process.exitCode = 1
  } else {
    console.log('appearance smoke test passed')
  }
} catch (error) {
  console.error('Appearance smoke test failed:', error)
  process.exitCode = 1
} finally {
  try {
    if (win && originalSettings) {
      await win.evaluate(async (settings) => {
        await window.pvevdi.updatePreferences({
          theme: settings.theme,
          uiFont: settings.uiFont,
          customFont: settings.customFont,
          accentColor: settings.accentColor
        })
      }, originalSettings)
    }
  } catch (error) {
    console.error('Failed to restore settings:', error)
  }
  try {
    await app.close()
  } catch (error) {
    console.error('Failed to close Electron:', error)
  }
}
