import { app, BrowserWindow, Menu, session, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { IPC } from '@shared/ipc'
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

  function createWindow(): void {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1180,
      minHeight: 720,
      show: false,
      frame: false,
      backgroundColor: '#09090b',
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
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler(() => false)

    manager = new PveManager()
    const store = new SettingsStore()
    const consoleWindows = new ConsoleWindowManager({
      manager,
      store,
      preloadPath: path.join(__dirname, '../preload/index.js'),
      rendererFile: path.join(__dirname, '../renderer/index.html'),
      iconPath
    })

    registerIpc({
      manager,
      store,
      consoleWindows,
      getWindow: () => mainWindow
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    manager?.logout()
  })
}
