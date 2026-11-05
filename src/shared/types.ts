/**
 * Shared contracts between the Electron main process, the preload bridge and
 * the renderer. Everything in this file must stay serialisable over IPC.
 */

export type Theme = 'dark' | 'light'
export type UiFont = 'inter' | 'system' | 'mono' | 'custom'

export type VmType = 'qemu' | 'lxc'

export type OsFamily =
  | 'windows'
  | 'ubuntu'
  | 'debian'
  | 'arch'
  | 'alpine'
  | 'fedora'
  | 'rocky'
  | 'alma'
  | 'centos'
  | 'opensuse'
  | 'redhat'
  | 'kali'
  | 'nixos'
  | 'gentoo'
  | 'freebsd'
  | 'linux'
  | 'other'

export interface VmOsInfo {
  family: OsFamily
  name: string
  version?: string
  source: 'ostype' | 'name' | 'agent' | 'default'
}

export type VmAction =
  | 'start'
  | 'shutdown'
  | 'stop'
  | 'reboot'
  | 'reset'
  | 'suspend'
  | 'resume'

export interface ApiError {
  code: string
  message: string
  detail?: string
  status?: number
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export interface AppSettings {
  serverUrl: string
  username: string
  allowSelfSigned: boolean
  rememberPassword: boolean
  hasSavedPassword: boolean
  credentialStorageAvailable: boolean
  theme: Theme
  refreshInterval: number
  uiFont: UiFont
  customFont: string
  accentColor: string
}

export interface SessionProfile {
  serverUrl: string
  username: string
  clusterName: string
  connectedAt: number
}

export interface BootstrapData {
  settings: AppSettings
  session: SessionProfile | null
  autoLoginError?: ApiError
  appVersion: string
  platform: string
  electronVersion: string
}

export interface LoginInput {
  serverUrl: string
  username: string
  password: string
  rememberPassword: boolean
  allowSelfSigned: boolean
}

export interface LoginResult {
  session: SessionProfile
  settings: AppSettings
}

export interface VmSummary {
  id: string
  vmid: number
  name: string
  node: string
  type: VmType
  status: string
  template: boolean
  tags: string[]
  os: VmOsInfo
  cpu: number
  cpus: number
  mem: number
  maxmem: number
  disk: number
  maxdisk: number
  uptime: number
  netin: number
  netout: number
  diskread: number
  diskwrite: number
}

export interface NodeMetricPoint {
  time: number
  cpu: number
  mem: number
}

export interface NodeSummary {
  node: string
  status: 'online' | 'offline' | 'unknown'
  uptime: number
  cpu: number
  maxcpu: number
  mem: number
  maxmem: number
  disk: number
  maxdisk: number
  level: string
  sslFingerprint?: string
  loadavg: number[]
  pveVersion?: string
  cpuModel?: string
  sockets?: number
  cores?: number
  memAvailable?: number
  ksmShared?: number
  kernelVersion?: string
  metrics: NodeMetricPoint[]
}

export interface StorageSummary {
  id: string
  storage: string
  node: string
  type: string
  content: string[]
  shared: boolean
  active: boolean
  status: string
  used: number
  total: number
  avail: number
  usedFraction: number
}

export interface HaStatus {
  id: string
  type: string
  node?: string
  status: string
  quorate?: number
}

export interface ClusterInfo {
  name: string
  quorate: boolean
  nodeCount: number
  version?: number
  ha: HaStatus[]
  keyboard?: string
  allowedTags: string[]
  description?: string
}

export interface TaskSummary {
  upid: string
  node: string
  type: string
  id?: string
  user: string
  status: 'running' | 'ok' | 'error' | 'unknown'
  rawStatus?: string
  startTime: number
  endTime?: number
  duration: number
}

export interface PveVersionInfo {
  version: string
  release: string
  repoid: string
}

export interface DashboardData {
  fetchedAt: number
  latencyMs: number
  cluster: ClusterInfo
  nodes: NodeSummary[]
  vms: VmSummary[]
  storages: StorageSummary[]
  tasks: TaskSummary[]
  version: PveVersionInfo
}

export interface LiveNodeMetrics {
  node: string
  status: 'online' | 'offline' | 'unknown'
  cpu: number
  maxcpu: number
  mem: number
  maxmem: number
  disk: number
  maxdisk: number
  uptime: number
}

export interface LiveMetricsData {
  fetchedAt: number
  nodes: LiveNodeMetrics[]
}

export interface VmRef {
  node: string
  type: VmType
  vmid: number
}

export interface VmRuntime {
  status: string
  qmpStatus?: string
  uptime: number
  cpu: number
  cpus: number
  mem: number
  maxmem: number
  memhost?: number
  freemem?: number
  balloon?: number
  pid?: number
  netin: number
  netout: number
  diskread: number
  diskwrite: number
  maxdisk: number
  agentEnabled: boolean
  haManaged: boolean
  runningMachine?: string
  runningQemu?: string
  tags: string[]
  pressureCpu?: number
  pressureMemory?: number
  pressureIo?: number
}

export interface VmMetricPoint {
  time: number
  cpu: number
  mem: number
  maxmem: number
  netin: number
  netout: number
  diskread: number
  diskwrite: number
}

export interface VmSnapshot {
  name: string
  description?: string
  snaptime?: number
  parent?: string
  vmstate: boolean
  current: boolean
  running: boolean
}

export interface AgentIpAddress {
  address: string
  type: string
  prefix?: number
}

export interface AgentInterface {
  name: string
  mac?: string
  ips: AgentIpAddress[]
  rxBytes?: number
  txBytes?: number
}

export interface VmDetail {
  ref: VmRef
  name: string
  os: VmOsInfo
  runtime: VmRuntime
  config: Record<string, string | number>
  snapshots: VmSnapshot[]
  tasks: TaskSummary[]
  metrics: VmMetricPoint[]
  agentInterfaces: AgentInterface[]
  agentError?: string
}

export type VmConfigValue = string | number

export interface DiskStorageOption {
  storage: string
  type: string
  avail: number
  total: number
  active: boolean
  enabled: boolean
  content: string[]
}

export interface IsoOption {
  volid: string
  label: string
  storage: string
  size: number
  format?: string
}

export interface BridgeOption {
  iface: string
  active: boolean
  comment?: string
}

export interface TemplateOption {
  vmid: number
  name: string
  node: string
  ostype?: string
  tags: string[]
}

export interface NodeOption {
  node: string
  status: string
  maxcpu: number
  maxmem: number
}

export interface CreateOptions {
  node: string
  nextId: number
  storages: DiskStorageOption[]
  isos: IsoOption[]
  bridges: BridgeOption[]
  templates: TemplateOption[]
  nodes: NodeOption[]
}

export interface CreateVmInput {
  node: string
  vmid: number
  name: string
  cores: number
  sockets: number
  memory: number
  ostype: string
  diskStorage: string
  diskSize: number
  iso: string | null
  bridge: string
  vlanTag: number | null
  start: boolean
  agent: boolean
  onboot: boolean
}

export interface CloneVmInput {
  node: string
  templateVmid: number
  vmid: number
  name: string
  storage: string | null
  full: boolean
  start: boolean
}

export interface MutationResult {
  vmid: number
  node: string
  task?: string
  started: boolean
  warnings: string[]
  message: string
}

export interface ActionResult {
  upid?: string
  message: string
}

export interface TaskStatusResult {
  upid: string
  status: 'running' | 'stopped' | 'unknown'
  exitStatus?: string
}

export interface TaskLogLine {
  n: number
  t: string
}

export interface PreferencesPatch {
  theme?: Theme
  refreshInterval?: number
  uiFont?: UiFont
  customFont?: string
  accentColor?: string
}

export interface WindowState {
  maximized: boolean
}

export type ConsoleMode = 'novnc' | 'xterm'

export interface ConsoleOpenRequest {
  kind: 'vm' | 'node'
  node: string
  type?: VmType
  vmid?: number
  name?: string
}

export interface ConsoleSessionInfo {
  sessionId: string
  kind: 'vm' | 'node'
  mode: ConsoleMode
  title: string
  subtitle: string
  node: string
  type?: VmType
  vmid?: number
  wsUrl: string
  vncPassword?: string
  username?: string
  expiresAt: number
}

export interface ConsoleWindowBootstrap {
  request: ConsoleOpenRequest
  settings: AppSettings
}

export interface DesktopApi {
  bootstrap: () => Promise<ApiResult<BootstrapData>>
  login: (input: LoginInput) => Promise<ApiResult<LoginResult>>
  logout: (clearSaved?: boolean) => Promise<ApiResult<AppSettings>>
  updatePreferences: (patch: PreferencesPatch) => Promise<ApiResult<AppSettings>>
  forgetCredentials: () => Promise<ApiResult<AppSettings>>
  dashboard: () => Promise<ApiResult<DashboardData>>
  liveMetrics: () => Promise<ApiResult<LiveMetricsData>>
  vmDetail: (ref: VmRef) => Promise<ApiResult<VmDetail>>
  vmAction: (ref: VmRef & { action: VmAction }) => Promise<ApiResult<ActionResult>>
  createOptions: (node: string) => Promise<ApiResult<CreateOptions>>
  createVm: (input: CreateVmInput) => Promise<ApiResult<MutationResult>>
  cloneVm: (input: CloneVmInput) => Promise<ApiResult<MutationResult>>
  taskLog: (node: string, upid: string) => Promise<ApiResult<TaskLogLine[]>>
  taskStatus: (node: string, upid: string) => Promise<ApiResult<TaskStatusResult>>
  openConsoleWindow: (input: ConsoleOpenRequest) => Promise<ApiResult<void>>
  consoleWindowBootstrap: () => Promise<ApiResult<ConsoleWindowBootstrap>>
  consoleOpen: (input: ConsoleOpenRequest) => Promise<ApiResult<ConsoleSessionInfo>>
  consoleClose: (sessionId: string) => Promise<ApiResult<void>>
  windowMinimize: () => void
  windowToggleMaximize: () => void
  windowClose: () => void
  getWindowState: () => Promise<WindowState>
  onWindowState: (callback: (state: WindowState) => void) => () => void
}
