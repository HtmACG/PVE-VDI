import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ApiResult,
  BootstrapData,
  CloneVmInput,
  ConsoleOpenRequest,
  CreateVmInput,
  LoginInput,
  PreferencesPatch,
  VmAction,
  VmRef
} from '@shared/types'
import { toApiError } from './pve/client'
import { PveManager } from './pve/service'
import { SettingsStore } from './settings'
import type { ConsoleWindowManager } from './console-windows'

function wrap<T>(operation: () => Promise<T>): Promise<ApiResult<T>> {
  return operation()
    .then((data) => ({ ok: true as const, data }))
    .catch((error) => {
      console.error('IPC operation failed:', error)
      return { ok: false as const, error: toApiError(error) }
    })
}

function asObject<T>(value: unknown): T {
  if (!value || typeof value !== 'object') {
    throw new Error('请求参数无效。')
  }
  return value as T
}

function asConsoleRequest(raw: unknown): ConsoleOpenRequest {
  const input = asObject<ConsoleOpenRequest>(raw)
  if (typeof input.node !== 'string' || !input.node || (input.kind !== 'vm' && input.kind !== 'node')) {
    throw new Error('控制台参数无效。')
  }
  return input
}

export function registerIpc(options: {
  manager: PveManager
  store: SettingsStore
  consoleWindows: ConsoleWindowManager
  getWindow: () => BrowserWindow | null
}): void {
  const { manager, store, consoleWindows, getWindow } = options

  ipcMain.handle(IPC.bootstrap, async (): Promise<ApiResult<BootstrapData>> => {
    return wrap(async () => {
      let autoLoginError
      if (!manager.session) {
        const saved = store.get()
        const password = store.getSavedPassword()
        if (saved.rememberPassword && password) {
          try {
            await manager.login({
              serverUrl: saved.serverUrl,
              username: saved.username,
              password,
              rememberPassword: saved.rememberPassword,
              allowSelfSigned: saved.allowSelfSigned
            })
          } catch (error) {
            autoLoginError = toApiError(error)
          }
        }
      }
      return {
        settings: store.get(),
        session: manager.session,
        autoLoginError,
        appVersion: app.getVersion(),
        platform: process.platform,
        electronVersion: process.versions.electron
      }
    })
  })

  ipcMain.handle(IPC.login, async (_event, raw: unknown) => {
    return wrap(async () => {
      const input = asObject<LoginInput>(raw)
      if (
        typeof input.serverUrl !== 'string' ||
        typeof input.username !== 'string' ||
        typeof input.password !== 'string' ||
        typeof input.rememberPassword !== 'boolean' ||
        typeof input.allowSelfSigned !== 'boolean'
      ) {
        throw new Error('登录参数无效。')
      }
      const session = await manager.login(input)
      store.recordLogin(input, session)
      return { session, settings: store.get() }
    })
  })

  ipcMain.handle(IPC.logout, async (_event, rawClearSaved: unknown) => {
    return wrap(async () => {
      consoleWindows.closeAll()
      manager.logout()
      if (rawClearSaved === true) store.forgetCredentials()
      return store.get()
    })
  })

  ipcMain.handle(IPC.updatePreferences, async (_event, rawPatch: unknown) => {
    return wrap(async () => {
      const patch = asObject<PreferencesPatch>(rawPatch)
      return store.updatePreferences(patch)
    })
  })

  ipcMain.handle(IPC.forgetCredentials, async () => {
    return wrap(async () => store.forgetCredentials())
  })

  ipcMain.handle(IPC.dashboard, async () => {
    return wrap(async () => manager.getDashboard())
  })

  ipcMain.handle(IPC.liveMetrics, async () => {
    return wrap(async () => manager.getLiveMetrics())
  })

  ipcMain.handle(IPC.vmDetail, async (_event, rawRef: unknown) => {
    return wrap(async () => manager.getVmDetail(asObject<VmRef>(rawRef)))
  })

  ipcMain.handle(IPC.vmAction, async (_event, rawRef: unknown) => {
    return wrap(async () => {
      const ref = asObject<VmRef & { action: VmAction }>(rawRef)
      return manager.vmAction(ref)
    })
  })

  ipcMain.handle(IPC.createOptions, async (_event, rawNode: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || !rawNode) throw new Error('请选择节点。')
      return manager.getCreateOptions(rawNode)
    })
  })

  ipcMain.handle(IPC.createVm, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.createVm(asObject<CreateVmInput>(rawInput)))
  })

  ipcMain.handle(IPC.cloneVm, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.cloneVm(asObject<CloneVmInput>(rawInput)))
  })

  ipcMain.handle(IPC.taskLog, async (_event, rawNode: unknown, rawUpid: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawUpid !== 'string') {
        throw new Error('任务参数无效。')
      }
      return manager.taskLog(rawNode, rawUpid)
    })
  })

  ipcMain.handle(IPC.taskStatus, async (_event, rawNode: unknown, rawUpid: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawUpid !== 'string') {
        throw new Error('任务参数无效。')
      }
      return manager.taskStatus(rawNode, rawUpid)
    })
  })

  ipcMain.handle(IPC.consoleWindowOpen, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      if (!manager.session) throw new Error('请先连接 PVE。')
      consoleWindows.open(asConsoleRequest(rawInput))
    })
  })

  ipcMain.handle(IPC.consoleWindowBootstrap, async (event) => {
    return wrap(async () => consoleWindows.bootstrap(event.sender.id))
  })

  ipcMain.handle(IPC.consoleOpen, async (event, rawInput: unknown) => {
    return wrap(async () => {
      const session = await manager.openConsole(asConsoleRequest(rawInput))
      consoleWindows.bindSession(event.sender.id, session.sessionId)
      return session
    })
  })

  ipcMain.handle(IPC.consoleClose, async (event, rawSessionId: unknown) => {
    return wrap(async () => {
      if (typeof rawSessionId !== 'string' || !rawSessionId) {
        throw new Error('控制台会话无效。')
      }
      manager.closeConsole(rawSessionId)
      consoleWindows.unbindSession(event.sender.id, rawSessionId)
    })
  })

  ipcMain.on(IPC.windowMinimize, (event) => {
    ;(BrowserWindow.fromWebContents(event.sender) ?? getWindow())?.minimize()
  })

  ipcMain.on(IPC.windowToggleMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on(IPC.windowClose, (event) => {
    ;(BrowserWindow.fromWebContents(event.sender) ?? getWindow())?.close()
  })

  ipcMain.handle(IPC.windowGetState, (event) => {
    return { maximized: (BrowserWindow.fromWebContents(event.sender) ?? getWindow())?.isMaximized() ?? false }
  })
}
