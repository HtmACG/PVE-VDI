import { app, BrowserWindow, Menu, nativeImage, nativeTheme, session, shell, Tray } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { IPC } from '@shared/ipc'
import type { AppSettings, Theme } from '@shared/types'
import { PveManager } from './pve/service'
import { SettingsStore } from './settings'
import { ConsoleWindowManager } from './console-windows'
import { createSshServers } from './ssh'
import { SshWindowManager } from './ssh/windows'
import { registerIpc } from './ipc'
import { DashboardNotifier } from './notifications'
import { logRuntimeError } from './diagnostics'

app.setName('PVE VDI')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.pvevdi.desktop')
}

/**
 * 兜住主进程里漏网的异常。
 * 没有处理器时 Electron 会弹一个阻塞式的 JS 错误框，窗口表现为「未响应」；
 * 这里改成记日志并继续运行，至少让用户还能关窗口或重试。
 */
process.on('uncaughtException', (error) => {
  logRuntimeError('uncaughtException', error)
})
process.on('unhandledRejection', (reason) => {
  logRuntimeError('unhandledRejection', reason)
})

app.commandLine.appendSwitch('force-color-profile', 'srgb')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let manager: PveManager | null = null
  let store: SettingsStore | null = null
  let consoleWindows: ConsoleWindowManager | null = null
  let sshServers: ReturnType<typeof createSshServers> | null = null
  let tray: Tray | null = null
  let quitting = false

  const hasIcon = (() => {
    const devIcon = path.join(__dirname, '../../build/icon.png')
    const packagedIcon = path.join(process.resourcesPath, 'icon.png')
    return app.isPackaged ? fs.existsSync(packagedIcon) : fs.existsSync(devIcon)
  })()

  function iconPath(): string | undefined {
    if (!hasIcon) return undefined
    return app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '../../build/icon.png')
  }

  function windowBackgroundColor(): string {
    return nativeTheme.shouldUseDarkColors ? '#1f1f1f' : '#f3f3f3'
  }

  function applyNativeTheme(theme: Theme): void {
    nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
  }

  function broadcastSettings(settings: AppSettings): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.settingsChanged, settings)
    }
  }

  function showMainWindow(): void {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }

  function quitApp(): void {
    quitting = true
    app.quit()
  }

  function createTray(): void {
    if (tray) return
    const image = iconPath()
    tray = new Tray(image ? nativeImage.createFromPath(image).resize({ width: 16, height: 16 }) : nativeImage.createEmpty())
    tray.setToolTip('PVE VDI')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开主窗口', click: () => showMainWindow() },
        { type: 'separator' },
        { label: '退出 PVE VDI', click: () => quitApp() }
      ])
    )
    tray.on('click', () => showMainWindow())
    tray.on('double-click', () => showMainWindow())
  }

  function createWindow(): void {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1180,
      minHeight: 720,
      show: false,
      frame: false,
      backgroundColor: windowBackgroundColor(),
      title: 'PVE VDI',
      icon: iconPath(),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        // 主窗口常驻托盘时仍按刷新间隔轮询，避免后台节流把通知延迟到一分钟级
        backgroundThrottling: false,
        devTools: !app.isPackaged
      }
    })

    mainWindow.once('ready-to-show', () => {
      mainWindow?.show()
    })

    const sendWindowState = (): void => {
      if (!mainWindow) return
      mainWindow.webContents.send(IPC.windowStateEvent, {
        maximized: mainWindow.isMaximized()
      })
    }

    mainWindow.on('maximize', sendWindowState)
    mainWindow.on('unmaximize', sendWindowState)
    mainWindow.on('unresponsive', () => {
      logRuntimeError('main-window-unresponsive', '主窗口停止响应')
    })
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      logRuntimeError(
        'main-renderer-gone',
        `reason=${details.reason} exitCode=${details.exitCode}`
      )
    })
    mainWindow.on('close', (event) => {
      // 关闭按钮只收起窗口，应用继续常驻托盘与后台。
      if (quitting) return
      event.preventDefault()
      mainWindow?.hide()
    })
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })

    mainWindow.webContents.on('will-navigate', (event, url) => {
      const current = mainWindow?.webContents.getURL()
      if (current && url !== current) event.preventDefault()
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
  }

  app.on('second-instance', () => {
    showMainWindow()
  })

  app.on('child-process-gone', (_event, details) => {
    logRuntimeError(
      'child-process-gone',
      `${details.type} reason=${details.reason} exitCode=${details.exitCode}`
    )
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler(() => false)

    manager = new PveManager()
    store = new SettingsStore()
    store.syncLaunchAtLogin()
    applyNativeTheme(store.get().theme)

    const notifier = new DashboardNotifier(
      () => store!.get(),
      () => showMainWindow(),
      () => iconPath()
    )

    sshServers = createSshServers(store, manager)

    const settingsStore = store
    const sshServerRef = sshServers
    sshServerRef.attachWindows(
      new SshWindowManager({
        store: settingsStore,
        shell: sshServerRef.shell,
        preloadPath: path.join(__dirname, '../preload/index.js'),
        rendererFile: path.join(__dirname, '../renderer/index.html'),
        iconPath,
        hasSession: () => Boolean(manager?.session)
      })
    )

    consoleWindows = new ConsoleWindowManager({
      manager,
      store: settingsStore,
      preloadPath: path.join(__dirname, '../preload/index.js'),
      rendererFile: path.join(__dirname, '../renderer/index.html'),
      iconPath,
      // 虚拟机选了 xterm.js 时，控制台窗口转成 SSH 终端窗口
      sshWindows: () => sshServerRef.windows
    })

    registerIpc({
      manager,
      store,
      consoleWindows,
      servers: sshServers,
      notifier,
      getWindow: () => mainWindow,
      onVmConsoleCloser: (closer) => sshServers?.setVmConsoleCloser(closer),
      onSettingsChanged: (settings) => {
        applyNativeTheme(settings.theme)
        broadcastSettings(settings)
      }
    })

    createWindow()
    createTray()

    app.on('activate', () => {
      showMainWindow()
    })
  })

  // 窗口全部关闭时不退出：托盘常驻并保持后台服务继续运行。
  app.on('window-all-closed', () => {
    // Intentionally left empty.
  })

  app.on('before-quit', () => {
    quitting = true
    manager?.logout()
    consoleWindows?.closeAll()
    sshServers?.windows?.closeAll()
    tray?.destroy()
    tray = null
  })
}
