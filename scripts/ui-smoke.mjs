import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const screenshotDir = path.join(root, 'screenshots')
fs.mkdirSync(screenshotDir, { recursive: true })

const password = process.env.PVE_PASSWORD
const serverUrl = process.env.PVE_SERVER_URL
const username = process.env.PVE_USERNAME || 'root@pam'
if (!password || !serverUrl) {
  console.error('PVE_PASSWORD and PVE_SERVER_URL environment variables are required')
  process.exit(1)
}

// Chromium child processes can be blocked when launched from this workspace
// drive. Keep a copy of the Electron runtime on the system drive for UI tests.
const localElectron = path.join(root, 'node_modules', 'electron', 'dist')
let executablePath = process.env.ELECTRON_EXECUTABLE
if (!executablePath) {
  const tempRoot = path.join(process.env.LOCALAPPDATA || 'C:\\Temp', 'pve-vdi-electron')
  const installedPath = path.join(tempRoot, 'electron.exe')
  if (!fs.existsSync(installedPath)) {
    fs.cpSync(localElectron, tempRoot, { recursive: true })
  }
  executablePath = installedPath
}
if (!fs.existsSync(executablePath)) {
  console.error(`Electron executable not found: ${executablePath}`)
  process.exit(1)
}

const electronApp = await electron.launch({
  executablePath,
  args: [root, ...(process.env.PVE_TEST_USER_DATA ? [`--user-data-dir=${process.env.PVE_TEST_USER_DATA}`] : [])],
  cwd: root,
  env: (() => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    return {
      ...env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  })(),
  timeout: 45_000
})

const errors = []
let win
try {
  win = await electronApp.firstWindow({ timeout: 45_000 })
  win.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console] ${message.text()}`)
  })
  win.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`))

  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1200)
  await win.screenshot({ path: path.join(screenshotDir, '01-login.png') })
  console.log('login screen:', await win.title())

  const bodyText = await win.locator('body').innerText()
  if (!bodyText.includes('连接集群')) {
    console.log('initial body:', bodyText.slice(0, 2000))
  }

  await win.locator('#server-url').fill(serverUrl)
  await win.locator('#username').fill(username)
  await win.locator('#password').fill(password)
  await win.getByRole('button', { name: '建立连接' }).click()

  try {
    await win.waitForSelector('text=运行概览', { timeout: 45_000 })
  } catch (error) {
    await win.screenshot({ path: path.join(screenshotDir, '02-login-failed.png') })
    console.error('Login/dashboard did not load:', (await win.locator('body').innerText()).slice(0, 3000))
    throw error
  }

  await win.waitForTimeout(2500)
  const mainScrollTop = await win.evaluate(() => document.querySelector('main')?.scrollTop ?? -1)
  console.log('overview scrollTop:', mainScrollTop)
  const liveBefore = await win.locator('text=/更新于 \\d{2}\\/\\d{2} \\d{2}:\\d{2}:\\d{2}/').first().innerText().catch(() => '')
  await win.waitForTimeout(3000)
  const liveAfter = await win.locator('text=/更新于 \\d{2}\\/\\d{2} \\d{2}:\\d{2}:\\d{2}/').first().innerText().catch(() => '')
  console.log('live timestamp changed:', liveBefore !== liveAfter, liveBefore, liveAfter)
  await win.evaluate(() => document.querySelector('main')?.scrollTo(0, 0))
  await win.waitForTimeout(350)
  await win.screenshot({ path: path.join(screenshotDir, '02-overview.png') })
  console.log('overview loaded')

  // Open a VM detail sheet from the overview table.
  await win.locator('tbody tr').first().click()
  await win.waitForSelector('text=性能遥测', { timeout: 20_000 })
  await win.waitForTimeout(1300)
  await win.screenshot({ path: path.join(screenshotDir, '03-vm-detail.png') })

  await win.getByRole('tab', { name: '网络' }).click()
  await win.waitForTimeout(700)
  await win.screenshot({ path: path.join(screenshotDir, '04-vm-network.png') })

  await win.keyboard.press('Escape')
  await win.waitForTimeout(500)

  // Navigate to all VMs and open the create dialog.
  await win.getByRole('button', { name: /^虚拟机/ }).first().click()
  await win.waitForTimeout(700)
  const osLabels = await win.locator('[aria-label]').evaluateAll((nodes) =>
    [...new Set(
      nodes
        .map((node) => node.getAttribute('aria-label') || '')
        .filter((label) => /^(Windows|Ubuntu|Debian|Arch Linux|Alpine Linux|Fedora|Rocky Linux|AlmaLinux|CentOS|openSUSE|Red Hat Enterprise Linux|Kali Linux|NixOS|Gentoo|FreeBSD|Linux)/.test(label))
    )]
  )
  console.log('OS icon labels:', osLabels.join(' | '))
  await win.screenshot({ path: path.join(screenshotDir, '05-vms.png') })

  await win.getByRole('button', { name: '新建虚拟机' }).first().click()
  await win.waitForSelector('text=创建虚拟机', { timeout: 10000 })
  try {
    await win.waitForFunction(
      () => {
        const dialog = document.querySelector('[role="dialog"]')
        if (!dialog) return false
        const text = dialog.textContent || ''
        return !text.includes('正在从 PVE 读取') && !text.includes('加载存储…') && !text.includes('加载网桥…')
      },
      { timeout: 30_000 }
    )
  } catch (error) {
    console.log('create dialog options did not finish:', (await win.locator('body').innerText()).slice(0, 2500))
    throw error
  }
  await win.waitForTimeout(500)
  const createButton = win.getByRole('button', { name: /创建虚拟机/ }).last()
  console.log('create button enabled:', await createButton.isEnabled())
  await win.screenshot({ path: path.join(screenshotDir, '06-create-vm.png') })
  await createButton.click()
  await win.waitForSelector('text=请输入虚拟机名称。', { timeout: 5000 })
  console.log('create dialog validation: ok')
  await win.screenshot({ path: path.join(screenshotDir, '06b-create-validation.png') })
  await win.keyboard.press('Escape')

  await win.getByRole('button', { name: /^节点/ }).first().click()
  await win.waitForTimeout(700)
  await win.screenshot({ path: path.join(screenshotDir, '07-nodes.png') })

  await win.getByRole('button', { name: /^集群/ }).first().click()
  await win.waitForTimeout(700)
  await win.screenshot({ path: path.join(screenshotDir, '08-cluster.png') })

  await win.getByRole('button', { name: /^任务/ }).first().click()
  await win.waitForTimeout(700)
  await win.screenshot({ path: path.join(screenshotDir, '09-tasks.png') })

  await win.locator('tbody tr').first().click()
  await win.waitForSelector('text=任务日志', { timeout: 15000 })
  await win.waitForTimeout(1800)
  await win.screenshot({ path: path.join(screenshotDir, '10-task-log.png') })
  await win.keyboard.press('Escape')
  await win.waitForTimeout(400)

  await win.getByRole('button', { name: /^总览/ }).first().click()
  await win.waitForSelector('text=运行概览', { timeout: 15_000 })
  await win.waitForTimeout(500)
  await win.getByRole('button', { name: '切换主题' }).click()
  await win.waitForFunction(() => document.documentElement.classList.contains('light'), { timeout: 10_000 })
  await win.waitForTimeout(4500)
  await win.waitForSelector('text=运行概览', { timeout: 10_000 })
  await win.screenshot({ path: path.join(screenshotDir, '11-overview-light.png') })
  await win.getByRole('button', { name: '切换主题' }).click()
  await win.waitForFunction(() => !document.documentElement.classList.contains('light'), { timeout: 10_000 })
  await win.waitForTimeout(4500)

  await win.getByRole('button', { name: /^设置/ }).first().click()
  await win.waitForSelector('text=界面字体', { timeout: 15_000 })
  await win.waitForTimeout(4500)
  await win.screenshot({ path: path.join(screenshotDir, '12-settings.png') })

  console.log('screenshots written:', fs.readdirSync(screenshotDir).join(', '))
  if (errors.length) {
    console.log('renderer errors:')
    for (const error of errors) console.log(error.slice(0, 1500))
  } else {
    console.log('no renderer console/page errors')
  }
} catch (error) {
  console.error('UI smoke test failed:', error)
  process.exitCode = 1
} finally {
  try {
    await electronApp.close()
  } catch (error) {
    console.error('Failed to close Electron:', error)
  }
}
