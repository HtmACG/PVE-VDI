import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  CloneVmInput,
  ConsoleOpenRequest,
  CreateVmInput,
  DesktopApi,
  LoginInput,
  PreferencesPatch,
  VmAction,
  VmRef,
  WindowState
} from '@shared/types'

const api: DesktopApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  login: (input: LoginInput) => ipcRenderer.invoke(IPC.login, input),
  logout: (clearSaved = false) => ipcRenderer.invoke(IPC.logout, clearSaved),
  updatePreferences: (patch: PreferencesPatch) => ipcRenderer.invoke(IPC.updatePreferences, patch),
  forgetCredentials: () => ipcRenderer.invoke(IPC.forgetCredentials),
  dashboard: () => ipcRenderer.invoke(IPC.dashboard),
  liveMetrics: () => ipcRenderer.invoke(IPC.liveMetrics),
  vmDetail: (ref: VmRef) => ipcRenderer.invoke(IPC.vmDetail, ref),
  vmAction: (ref: VmRef & { action: VmAction }) => ipcRenderer.invoke(IPC.vmAction, ref),
  createOptions: (node: string) => ipcRenderer.invoke(IPC.createOptions, node),
  createVm: (input: CreateVmInput) => ipcRenderer.invoke(IPC.createVm, input),
  cloneVm: (input: CloneVmInput) => ipcRenderer.invoke(IPC.cloneVm, input),
  taskLog: (node: string, upid: string) => ipcRenderer.invoke(IPC.taskLog, node, upid),
  taskStatus: (node: string, upid: string) => ipcRenderer.invoke(IPC.taskStatus, node, upid),
  openConsoleWindow: (input: ConsoleOpenRequest) => ipcRenderer.invoke(IPC.consoleWindowOpen, input),
  consoleWindowBootstrap: () => ipcRenderer.invoke(IPC.consoleWindowBootstrap),
  consoleOpen: (input: ConsoleOpenRequest) => ipcRenderer.invoke(IPC.consoleOpen, input),
  consoleClose: (sessionId: string) => ipcRenderer.invoke(IPC.consoleClose, sessionId),
  windowMinimize: () => ipcRenderer.send(IPC.windowMinimize),
  windowToggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
  windowClose: () => ipcRenderer.send(IPC.windowClose),
  getWindowState: () => ipcRenderer.invoke(IPC.windowGetState),
  onWindowState: (callback: (state: WindowState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WindowState): void => callback(state)
    ipcRenderer.on(IPC.windowStateEvent, listener)
    return () => {
      ipcRenderer.removeListener(IPC.windowStateEvent, listener)
    }
  }
}

contextBridge.exposeInMainWorld('pvevdi', api)
