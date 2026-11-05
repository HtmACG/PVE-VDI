/**
 * Shared contracts between the Electron main process, the preload bridge and
 * the renderer. Everything in this file must stay serialisable over IPC.
 */

export type Theme = 'dark' | 'light'
export type UiFont = 'inter' | 'system' | 'mono' | 'custom'
export type NetworkView = 'cards' | 'list'

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
  networkView: NetworkView
  launchAtLogin: boolean
  hasLoginBackground: boolean
  hasAppBackground: boolean
}

export type BackgroundKind = 'login' | 'app'

export interface BackgroundImages {
  login?: string
  app?: string
}

export interface BackgroundPickResult {
  settings: AppSettings
  backgrounds: BackgroundImages
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseUrl: string
  publishedAt?: string
  notes?: string
  source: 'release' | 'tag' | 'none'
  checkedAt: number
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
  backgrounds: BackgroundImages
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
  backgrounds: BackgroundImages
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

export type NodeNetworkType = 'bridge' | 'vlan' | 'eth' | 'bond'

export interface NodeNetworkInterface {
  iface: string
  type: string
  active?: boolean
  exists?: boolean
  autostart?: boolean
  comments?: string
  address?: string
  netmask?: string
  cidr?: string
  gateway?: string
  address6?: string
  netmask6?: number
  cidr6?: string
  gateway6?: string
  mtu?: number
  bridge_ports?: string
  bridge_stp?: string
  bridge_vlan_aware?: boolean
  bridge_vids?: string
  slaves?: string
  bond_mode?: string
  bond_xmit_hash_policy?: string
  'vlan-id'?: number
  'vlan-raw-device'?: string
  families?: string[]
  priority?: number
}

export interface NodeNetworkInput {
  node: string
  iface: string
  type: NodeNetworkType
  existing?: boolean
  comments?: string
  autostart?: boolean
  mtu?: number
  cidr?: string
  gateway?: string
  cidr6?: string
  gateway6?: string
  bridgePorts?: string
  bridgeStp?: boolean
  bridgeVlanAware?: boolean
  bridgeVids?: string
  slaves?: string
  bondMode?: string
  bondXmitHashPolicy?: string
  vlanId?: number
  vlanRawDevice?: string
}

export interface NodeDnsSettings {
  search?: string
  dns1?: string
  dns2?: string
  dns3?: string
}

export interface NodeTimeSettings {
  timezone?: string | null
  localtime: number
  time: number
}

export interface NodeCertificateInfo {
  filename: string
  subject?: string
  issuer?: string
  fingerprint?: string
  notbefore?: number
  notafter?: number
  publicKeyType?: string
  publicKeyBits?: number
  san: string[]
}

export interface NodeRepositorySource {
  path: string
  fileType?: string
  repositories: Array<{
    types: string[]
    uris: string[]
    suites: string[]
    components: string[]
    enabled: boolean
    comment?: string
  }>
}

export interface NodeRepositorySummary {
  errors: string[]
  standardRepos: Array<{ name: string; handle: string; description?: string }>
  sources: NodeRepositorySource[]
}

export interface NodeDiskInfo {
  devpath: string
  model?: string
  serial?: string
  size: number
  type?: string
  health?: string
  used?: string
  wearout?: number | string
  vendor?: string
  rpm?: number | string
  temperature?: number
  temperatureMax?: number
  temperatureCritical?: number
}

export interface NodeTemperatureReading {
  label: string
  source?: string
  value: number
  max?: number
  critical?: number
}

export interface NodeHardwareInfo {
  node: string
  manufacturer?: string
  productName?: string
  productVersion?: string
  boardName?: string
  cpuModel?: string
  cpuTemperature?: number
  cpuTemperatureMax?: number
  cpuTemperatureCritical?: number
  temperatures: NodeTemperatureReading[]
  disks: NodeDiskInfo[]
  warnings: string[]
  collectedAt: number
}

export interface IsoStorageInfo {
  node: string
  storage: string
  type: string
  avail: number
  total: number
  active: boolean
}

export interface IsoImageInfo {
  node: string
  storage: string
  volid: string
  name: string
  size: number
  format?: string
  ctime?: number
}

export interface IsoImageList {
  node: string
  storages: IsoStorageInfo[]
  images: IsoImageInfo[]
}

export interface PickedIsoFile {
  path: string
  name: string
  size: number
}

export interface IsoUploadInput {
  node: string
  storage: string
  filePath: string
}

export interface IsoUrlInput {
  node: string
  storage: string
  url: string
  filename: string
  checksum?: string
  checksumAlgorithm?: 'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512'
  verifyCertificates: boolean
}

export interface IsoMutationResult {
  message: string
  upid?: string
}

export interface NodeLvmGroup {
  name: string
  size: number
  free: number
}

export interface NodeLvmThinPool {
  lv: string
  vg: string
  lvSize: number
  used: number
  metadataSize?: number
  metadataUsed?: number
  lvState?: string
}

export interface NodeDirectoryStorage {
  path: string
  type?: string
  storage?: string
  total?: number
  used?: number
  avail?: number
}

export interface NodeZfsPool {
  name: string
  size?: number
  free?: number
  health?: string
  alloc?: number
}

export interface NodeSettingsData {
  node: string
  network: NodeNetworkInterface[]
  dns: NodeDnsSettings | null
  time: NodeTimeSettings | null
  config: Record<string, unknown> | null
  certificates: NodeCertificateInfo[]
  repositories: NodeRepositorySummary | null
  firewallOptions: Record<string, unknown> | null
  lvm: NodeLvmGroup[]
  lvmthin: NodeLvmThinPool[]
  directories: NodeDirectoryStorage[]
  zfs: NodeZfsPool[]
  warnings: string[]
}

export interface NodeLogEntry {
  n: number
  t: string
}

export interface NodeNetworkActionResult {
  message: string
  upid?: string
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

export interface VmDiskInfo {
  key: string
  volume: string
  storage?: string
  size?: number
  format?: string
  isCdrom: boolean
  options: string[]
}

export interface VmConfigPatchInput {
  node: string
  type: VmType
  vmid: number
  digest?: string
  patch: Record<string, string | number>
}

export interface VmDiskAddInput {
  node: string
  vmid: number
  storage: string
  sizeGiB: number
  bus: 'scsi' | 'virtio' | 'sata'
}

export interface VmDiskResizeInput {
  node: string
  type: VmType
  vmid: number
  disk: string
  size: string
}

export interface VmDiskRemoveInput {
  node: string
  type: VmType
  vmid: number
  disk: string
  destroy: boolean
}

export interface VmMutationResult {
  message: string
  upid?: string
  disk?: string
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
  disks: VmDiskInfo[]
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
  networkView?: NetworkView
  launchAtLogin?: boolean
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
  pickBackground: (kind: BackgroundKind) => Promise<ApiResult<BackgroundPickResult | null>>
  clearBackground: (kind: BackgroundKind) => Promise<ApiResult<BackgroundPickResult>>
  dashboard: () => Promise<ApiResult<DashboardData>>
  liveMetrics: () => Promise<ApiResult<LiveMetricsData>>
  nodeSettings: (node: string) => Promise<ApiResult<NodeSettingsData>>
  nodeHardware: (node: string, refresh?: boolean) => Promise<ApiResult<NodeHardwareInfo>>
  isoImages: (node: string) => Promise<ApiResult<IsoImageList>>
  pickIsoFile: () => Promise<ApiResult<PickedIsoFile | null>>
  uploadIso: (input: IsoUploadInput) => Promise<ApiResult<IsoMutationResult>>
  importIsoUrl: (input: IsoUrlInput) => Promise<ApiResult<IsoMutationResult>>
  deleteIso: (node: string, storage: string, volid: string) => Promise<ApiResult<void>>
  nodeNetworkSave: (input: NodeNetworkInput) => Promise<ApiResult<NodeNetworkActionResult>>
  nodeNetworkDelete: (node: string, iface: string) => Promise<ApiResult<void>>
  nodeNetworkApply: (node: string) => Promise<ApiResult<NodeNetworkActionResult>>
  nodeNetworkRevert: (node: string) => Promise<ApiResult<void>>
  nodeDnsUpdate: (node: string, settings: NodeDnsSettings) => Promise<ApiResult<void>>
  nodeTimeUpdate: (node: string, timezone: string) => Promise<ApiResult<void>>
  nodeOptionsUpdate: (node: string, description: string) => Promise<ApiResult<void>>
  nodeLogs: (node: string, kind: 'syslog' | 'firewall') => Promise<ApiResult<NodeLogEntry[]>>
  checkUpdates: () => Promise<ApiResult<UpdateCheckResult>>
  openExternal: (url: string) => Promise<ApiResult<void>>
  vmDetail: (ref: VmRef) => Promise<ApiResult<VmDetail>>
  vmAction: (ref: VmRef & { action: VmAction }) => Promise<ApiResult<ActionResult>>
  vmConfigUpdate: (input: VmConfigPatchInput) => Promise<ApiResult<VmMutationResult>>
  vmDiskAdd: (input: VmDiskAddInput) => Promise<ApiResult<VmMutationResult>>
  vmDiskResize: (input: VmDiskResizeInput) => Promise<ApiResult<VmMutationResult>>
  vmDiskRemove: (input: VmDiskRemoveInput) => Promise<ApiResult<VmMutationResult>>
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
