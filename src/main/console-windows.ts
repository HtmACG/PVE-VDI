import { app, BrowserWindow, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { ConsoleOpenRequest, ConsoleWindowBootstrap } from '@shared/types'
import type { PveManager } from './pve/service'
import type { SettingsStore } from './settings'
import type { SshWindowManager } from './ssh/windows'
import { logRuntimeError } from './diagnostics'

interface ConsoleWindowOptions {
  manager: PveManager
  store: SettingsStore
  preloadPath: string
  rendererFile: string
  iconPath: () => string | undefined
  /** 可选的 SSH 窗口管理器：能识别成节点的目标走 SSH 终端窗口 */
  sshWindows?: (() => SshWindowManager | null) | null
}

export class ConsoleWindowManager {
  private readonly windows = new Map<number, BrowserWindow>()
  private readonly bootstraps = new Map<number, ConsoleWindowBootstrap>()
  private readonly sessions = new Map<number, Set<string>>()

  constructor(private readonly options: ConsoleWindowOptions) {}

  open(request: ConsoleOpenRequest): void {
    // 节点 Shell 本身就是 xterm 终端，统一走 SSH 窗口：多标签 + 文件面板 + 终端原生体验
    if (request.kind === 'node') {
      const sshWindows = this.options.sshWindows?.() ?? null
      if (sshWindows) {
        sshWindows.open({ node: request.node, tabs: 1 })
        return
      }
    }

    // 虚拟机选了 xterm.js：也走 SSH 窗口，复用同一套多标签 + 文件面板
    if (request.kind === 'vm' && request.mode === 'xterm' && request.vmid) {
      const sshWindows = this.options.sshWindows?.() ?? null
      if (sshWindows) {
        sshWindows.open({
          node: request.node,
          vm: { node: request.node, vmid: request.vmid, type: request.type ?? 'qemu', name: request.name },
          tabs: 1
        })
        return
      }
    }

    const win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 760,
      minHeight: 500,
      show: false,
      frame: false,
      backgroundColor: '#050608',
      title: `PVE VDI 控制台${request.name ? ` · ${request.name}` : ''}`,
      icon: this.options.iconPath(),
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        devTools: !app.isPackaged
      }
    })

    const contentsId = win.webContents.id
    this.windows.set(contentsId, win)
    this.bootstraps.set(contentsId, {
      request,
      settings: this.options.store.get()
    })

    const sendWindowState = (maximized: boolean): void => {
      if (win.isDestroyed()) return
      win.webContents.send(IPC.windowStateEvent, { maximized })
    }
    win.on('maximize', () => sendWindowState(true))
    win.on('unmaximize', () => sendWindowState(false))
    win.on('unresponsive', () => {
      logRuntimeError('console-window-unresponsive', `window=${contentsId}`)
    })
    win.webContents.on('render-process-gone', (_event, details) => {
      logRuntimeError(
        'console-renderer-gone',
        `window=${contentsId} reason=${details.reason} exitCode=${details.exitCode}`
      )
    })
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, url) => {
      const current = win.webContents.getURL()
      if (current && url !== current) event.preventDefault()
    })

    win.on('closed', () => {
      const tracked = this.sessions.get(contentsId)
      if (tracked) {
        for (const sessionId of tracked) this.options.manager.closeConsole(sessionId)
      }
      this.sessions.delete(contentsId)
      this.bootstraps.delete(contentsId)
      this.windows.delete(contentsId)
    })

    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    if (rendererUrl) {
      const target = new URL(rendererUrl)
      target.searchParams.set('console', '1')
      void win.loadURL(target.toString())
    } else {
      void win.loadFile(this.options.rendererFile, { query: { console: '1' } })
    }
  }

  bootstrap(contentsId: number): ConsoleWindowBootstrap {
    const bootstrap = this.bootstraps.get(contentsId)
    if (!bootstrap) throw new Error('控制台窗口已失效，请从主窗口重新打开。')
    return bootstrap
  }

  bindSession(contentsId: number, sessionId: string): void {
    if (!this.windows.has(contentsId)) return
    const tracked = this.sessions.get(contentsId) ?? new Set<string>()
    tracked.add(sessionId)
    this.sessions.set(contentsId, tracked)
  }

  unbindSession(contentsId: number, sessionId: string): void {
    this.sessions.get(contentsId)?.delete(sessionId)
  }

  closeAll(): void {
    for (const win of [...this.windows.values()]) {
      if (!win.isDestroyed()) win.close()
    }
  }
}
