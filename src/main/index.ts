import { app, BrowserWindow, Menu, nativeImage, nativeTheme, session, shell, Tray } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { IPC } from '@shared/ipc'
import type { AppSettings, Theme } from '@shared/types'
import { PveManager } from './pve/service'
import { SettingsStore } from './settings'
import { ConsoleWindowManager } from './console-windows'
import { registerIpc } from './ipc'

app.setName('PVE VDI')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.pvevdi.desktop')
}

app.commandLine.appendSwitch('force-color-profile', 'srgb')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let manager: PveManager | null = null
  let store: SettingsStore | null = null
  let consoleWindows: ConsoleWindowManager | null = null
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

    const settingsStore = store
    consoleWindows = new ConsoleWindowManager({
      manager,
      store: settingsStore,
      preloadPath: path.join(__dirname, '../preload/index.js'),
      rendererFile: path.join(__dirname, '../renderer/index.html'),
      iconPath
    })

    registerIpc({
      manager,
      store,
      consoleWindows,
      getWindow: () => mainWindow,
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
    tray?.destroy()
    tray = null
  })
}
