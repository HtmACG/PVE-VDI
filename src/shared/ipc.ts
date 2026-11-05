import type { VmAction } from './types'

export const IPC = {
  bootstrap: 'app:bootstrap',
  login: 'auth:login',
  logout: 'auth:logout',
  updatePreferences: 'settings:update-preferences',
  forgetCredentials: 'settings:forget-credentials',
  pickBackground: 'settings:pick-background',
  clearBackground: 'settings:clear-background',
  dashboard: 'pve:dashboard',
  liveMetrics: 'pve:live-metrics',
  nodeSettings: 'pve:node-settings',
  nodeHardware: 'pve:node-hardware',
  isoImages: 'pve:iso-images',
  pickIsoFile: 'pve:iso-pick-file',
  uploadIso: 'pve:iso-upload',
  importIsoUrl: 'pve:iso-import-url',
  deleteIso: 'pve:iso-delete',
  nodeNetworkSave: 'pve:node-network-save',
  nodeNetworkDelete: 'pve:node-network-delete',
  nodeNetworkApply: 'pve:node-network-apply',
  nodeNetworkRevert: 'pve:node-network-revert',
  nodeDnsUpdate: 'pve:node-dns-update',
  nodeTimeUpdate: 'pve:node-time-update',
  nodeOptionsUpdate: 'pve:node-options-update',
  nodeLogs: 'pve:node-logs',
  checkUpdates: 'app:check-updates',
  openExternal: 'app:open-external',
  vmDetail: 'pve:vm-detail',
  vmAction: 'pve:vm-action',
  vmConfigUpdate: 'pve:vm-config-update',
  vmDiskAdd: 'pve:vm-disk-add',
  vmDiskResize: 'pve:vm-disk-resize',
  vmDiskRemove: 'pve:vm-disk-remove',
  createOptions: 'pve:create-options',
  createVm: 'pve:create-vm',
  cloneVm: 'pve:clone-vm',
  taskLog: 'pve:task-log',
  taskStatus: 'pve:task-status',
  consoleOpen: 'console:open',
  consoleClose: 'console:close',
  consoleWindowOpen: 'console:window-open',
  consoleWindowBootstrap: 'console:window-bootstrap',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowGetState: 'window:get-state',
  windowStateEvent: 'window:state'
} as const

export const DEFAULT_SERVER_URL = ''
export const DEFAULT_USERNAME = ''
export const MIN_REFRESH_INTERVAL = 5
export const MAX_REFRESH_INTERVAL = 60

export const GUEST_TYPES = [
  { value: 'l26', label: 'Linux 6.x / 内核 2.6+' },
  { value: 'l24', label: 'Linux 2.4 内核' },
  { value: 'win11', label: 'Windows 11 / Server 2022' },
  { value: 'win10', label: 'Windows 10 / Server 2016-2019' },
  { value: 'win8', label: 'Windows 8 / Server 2012' },
  { value: 'win7', label: 'Windows 7 / Server 2008 R2' },
  { value: 'winxp', label: 'Windows XP' },
  { value: 'other', label: '其他 / 未指定' }
] as const

export const VM_ACTION_LABELS: Record<VmAction, string> = {
  start: '启动',
  shutdown: '关机',
  stop: '强制停止',
  reboot: '重启',
  reset: '重置',
  suspend: '挂起',
  resume: '恢复'
}

export const TASK_TYPE_LABELS: Record<string, string> = {
  qmstart: '启动虚拟机',
  qmstop: '停止虚拟机',
  qmshutdown: '关闭虚拟机',
  qmreboot: '重启虚拟机',
  qmreset: '重置虚拟机',
  qmsuspend: '挂起虚拟机',
  qmresume: '恢复虚拟机',
  qmsnapshot: '创建快照',
  qmdelsnapshot: '删除快照',
  qmrollback: '回滚快照',
  qmcreate: '创建虚拟机',
  qmclone: '克隆虚拟机',
  qmigrate: '迁移虚拟机',
  vncproxy: '打开控制台',
  vncshell: '节点终端',
  aptupdate: '更新软件源',
  pveupdate: '系统更新',
  pvedaily: '日常维护',
  startall: '批量启动',
  stopall: '批量停止',
  imgcopy: '复制磁盘',
  move_disk: '移动磁盘',
  resize_disk: '调整磁盘',
  download: '下载文件',
  vzstart: '启动容器',
  vzstop: '停止容器',
  vzshutdown: '关闭容器',
  vzcreate: '创建容器',
  vzclone: '克隆容器'
}
