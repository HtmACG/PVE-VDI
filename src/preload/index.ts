import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  BackgroundKind,
  CloneVmInput,
  ConsoleOpenRequest,
  CreateVmInput,
  DesktopApi,
  IsoUploadInput,
  IsoUrlInput,
  LoginInput,
  NodeDnsSettings,
  NodeNetworkInput,
  PreferencesPatch,
  VmAction,
  VmConfigPatchInput,
  VmDiskAddInput,
  VmDiskRemoveInput,
  VmDiskResizeInput,
  VmRef,
  WindowState
} from '@shared/types'

const api: DesktopApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  login: (input: LoginInput) => ipcRenderer.invoke(IPC.login, input),
  logout: (clearSaved = false) => ipcRenderer.invoke(IPC.logout, clearSaved),
  updatePreferences: (patch: PreferencesPatch) => ipcRenderer.invoke(IPC.updatePreferences, patch),
  forgetCredentials: () => ipcRenderer.invoke(IPC.forgetCredentials),
  pickBackground: (kind: BackgroundKind) => ipcRenderer.invoke(IPC.pickBackground, kind),
  clearBackground: (kind: BackgroundKind) => ipcRenderer.invoke(IPC.clearBackground, kind),
  dashboard: () => ipcRenderer.invoke(IPC.dashboard),
  liveMetrics: () => ipcRenderer.invoke(IPC.liveMetrics),
  nodeSettings: (node: string) => ipcRenderer.invoke(IPC.nodeSettings, node),
  nodeHardware: (node: string, refresh?: boolean) => ipcRenderer.invoke(IPC.nodeHardware, node, refresh),
  isoImages: (node: string) => ipcRenderer.invoke(IPC.isoImages, node),
  pickIsoFile: () => ipcRenderer.invoke(IPC.pickIsoFile),
  uploadIso: (input: IsoUploadInput) => ipcRenderer.invoke(IPC.uploadIso, input),
  importIsoUrl: (input: IsoUrlInput) => ipcRenderer.invoke(IPC.importIsoUrl, input),
  deleteIso: (node: string, storage: string, volid: string) => ipcRenderer.invoke(IPC.deleteIso, node, storage, volid),
  nodeNetworkSave: (input: NodeNetworkInput) => ipcRenderer.invoke(IPC.nodeNetworkSave, input),
  nodeNetworkDelete: (node: string, iface: string) => ipcRenderer.invoke(IPC.nodeNetworkDelete, node, iface),
  nodeNetworkApply: (node: string) => ipcRenderer.invoke(IPC.nodeNetworkApply, node),
  nodeNetworkRevert: (node: string) => ipcRenderer.invoke(IPC.nodeNetworkRevert, node),
  nodeDnsUpdate: (node: string, settings: NodeDnsSettings) => ipcRenderer.invoke(IPC.nodeDnsUpdate, node, settings),
  nodeTimeUpdate: (node: string, timezone: string) => ipcRenderer.invoke(IPC.nodeTimeUpdate, node, timezone),
  nodeOptionsUpdate: (node: string, description: string) => ipcRenderer.invoke(IPC.nodeOptionsUpdate, node, description),
  nodeLogs: (node: string, kind: 'syslog' | 'firewall') => ipcRenderer.invoke(IPC.nodeLogs, node, kind),
  checkUpdates: () => ipcRenderer.invoke(IPC.checkUpdates),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url),
  vmDetail: (ref: VmRef) => ipcRenderer.invoke(IPC.vmDetail, ref),
  vmAction: (ref: VmRef & { action: VmAction }) => ipcRenderer.invoke(IPC.vmAction, ref),
  vmConfigUpdate: (input: VmConfigPatchInput) => ipcRenderer.invoke(IPC.vmConfigUpdate, input),
  vmDiskAdd: (input: VmDiskAddInput) => ipcRenderer.invoke(IPC.vmDiskAdd, input),
  vmDiskResize: (input: VmDiskResizeInput) => ipcRenderer.invoke(IPC.vmDiskResize, input),
  vmDiskRemove: (input: VmDiskRemoveInput) => ipcRenderer.invoke(IPC.vmDiskRemove, input),
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
  windowHide: () => ipcRenderer.send(IPC.windowHide),
  windowToggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
  windowClose: () => ipcRenderer.send(IPC.windowClose),
  getWindowState: () => ipcRenderer.invoke(IPC.windowGetState),
  onWindowState: (callback: (state: WindowState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WindowState): void => callback(state)
    ipcRenderer.on(IPC.windowStateEvent, listener)
    return () => {
      ipcRenderer.removeListener(IPC.windowStateEvent, listener)
    }
  },
  onSettingsChanged: (callback: (settings: AppSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: AppSettings): void => callback(settings)
    ipcRenderer.on(IPC.settingsChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.settingsChanged, listener)
    }
  }
}

contextBridge.exposeInMainWorld('pvevdi', api)
