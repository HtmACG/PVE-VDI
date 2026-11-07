import { app, BrowserWindow, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { SshShellSession, SshWindowBootstrap, SshWindowOpenRequest } from '@shared/types'
import type { ShellManager } from './shell'
import type { SettingsStore } from '../settings'
import { logRuntimeError } from '../diagnostics'

/**
 * 独立 SSH 窗口管理。
 *
 * 用户明确要求 SSH 不要塞在主窗口里——一个窗口就是一组终端标签 + 文件面板，
 * 可以并排、可以挪到第二块屏幕。窗口关掉时把该窗口开的 PTY 一起收掉，
 * 否则主进程会攒下一堆没人读的 shell。
 */

interface SshWindowOptions {
  store: SettingsStore
  shell: ShellManager
  preloadPath: string
  rendererFile: string
  iconPath: () => string | undefined
  /** PVE 当前是否存在可用会话 */
  hasSession: () => boolean
  /** 关闭虚拟机控制台桥（由 ipc 层注入，SSH 模块不依赖 ipc） */
  closeVmConsole?: (sessionId: string) => void
}

const MAX_TABS = 6

/** 从节点 Shell / 虚拟机终端入口进来时，标题带对象名，方便多个窗口分得清 */
function windowTitle(request: SshWindowOpenRequest): string {
  if (request.vm) return `PVE VDI 终端 · ${request.vm.name || `#${request.vm.vmid}`}`
  return request.node ? `PVE VDI SSH · ${request.node}` : 'PVE VDI SSH'
}

export class SshWindowManager {
  private readonly windows = new Map<number, BrowserWindow>()
  private readonly bootstraps = new Map<number, SshWindowBootstrap>()
  private readonly sessions = new Map<number, Set<string>>()
  /** 级联偏移，避免新窗口完全盖住旧窗口 */
  private cascade = 0
  private options: SshWindowOptions

  constructor(options: SshWindowOptions) {
    this.options = options
  }

  open(input: SshWindowOpenRequest = {}): void {
    if (!this.options.hasSession()) throw new Error('请先连接 PVE 再打开 SSH 终端。')

    const tabs = Math.min(MAX_TABS, Math.max(1, Math.floor(Number(input.tabs) || 1)))
    const offset = (this.cascade % 6) * 28
    this.cascade += 1

    const win = new BrowserWindow({
      width: 1180,
      height: 780,
      x: undefined,
      minWidth: 720,
      minHeight: 460,
      show: false,
      frame: false,
      backgroundColor: '#050608',
      title: windowTitle(input),
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

    if (offset > 0) {
      const [x, y] = win.getPosition()
      win.setPosition(x + offset, y + offset)
    }

    const contentsId = win.webContents.id
    this.windows.set(contentsId, win)
    this.bootstraps.set(contentsId, {
      request: { ...input, tabs },
      settings: this.options.store.get()
    })

    const sendWindowState = (maximized: boolean): void => {
      if (win.isDestroyed()) return
      win.webContents.send(IPC.windowStateEvent, { maximized })
    }
    win.on('maximize', () => sendWindowState(true))
    win.on('unmaximize', () => sendWindowState(false))
    win.on('unresponsive', () => {
      logRuntimeError('ssh-window-unresponsive', `window=${contentsId}`)
    })
    win.webContents.on('render-process-gone', (_event, details) => {
      logRuntimeError(
        'ssh-renderer-gone',
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
      // 先收 VM 控制台桥，再收 SSH PTY（vm 会话走 bridge，shell.close 对它无副作用）
      const closeVm = this.options.closeVmConsole
      const tracked = this.sessions.get(contentsId)
      if (tracked) {
        for (const sessionId of tracked) {
          closeVm?.(sessionId)
          this.options.shell.close(sessionId)
        }
      }
      this.sessions.delete(contentsId)
      this.bootstraps.delete(contentsId)
      this.windows.delete(contentsId)
    })

    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    if (rendererUrl) {
      const target = new URL(rendererUrl)
      target.searchParams.set('ssh', '1')
      void win.loadURL(target.toString())
    } else {
      void win.loadFile(this.options.rendererFile, { query: { ssh: '1' } })
    }
  }

  bootstrap(contentsId: number): SshWindowBootstrap {
    const bootstrap = this.bootstraps.get(contentsId)
    if (!bootstrap) throw new Error('SSH 窗口已失效，请重新打开。')
    return bootstrap
  }

  /** 记录该窗口开了哪些 PTY，窗口关闭时统一回收 */
  bindSession(contentsId: number, sessionId: string): void {
    if (!this.windows.has(contentsId)) return
    const tracked = this.sessions.get(contentsId) ?? new Set<string>()
    tracked.add(sessionId)
    this.sessions.set(contentsId, tracked)
  }

  unbindSession(contentsId: number, sessionId: string): void {
    this.sessions.get(contentsId)?.delete(sessionId)
  }

  /** 由 SSH 聚合层注入：关窗时收虚拟机控制台桥 */
  setVmConsoleCloser(closer: (sessionId: string) => void): void {
    this.options.closeVmConsole = closer
  }

  /** 供 SSH 事件转发：某个会话属于哪个窗口 */
  sessionsOf(contentsId: number): readonly string[] {
    return [...(this.sessions.get(contentsId) ?? [])]
  }

  has(contentsId: number): boolean {
    return this.windows.has(contentsId)
  }

  list(): SshShellSession[] {
    return this.options.shell.list()
  }

  closeAll(): void {
    for (const win of [...this.windows.values()]) {
      if (!win.isDestroyed()) win.close()
    }
  }
}
