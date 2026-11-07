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
  /** Windows 桌面通知总开关 */
  notificationsEnabled: boolean
  /** 虚拟机关机时提醒 */
  notifyVmShutdown: boolean
  /** 任务执行失败时提醒 */
  notifyTaskFailure: boolean
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
  /** 控制台可用性；未探测时为空，前端按「待探测」显示 */
  console?: VmConsoleInfo
}

/** 虚拟机控制台能力：决定 VNC / xterm.js 哪个能点、哪个置灰 */
export interface VmConsoleInfo {
  /** noVNC 可用（QEMU 有 vncproxy，LXC 没有图形界面） */
  vnc: boolean
  /** xterm.js 可用：QEMU 需要串口（qm terminal）或客户机 SSH；LXC 原生 pty 始终可用 */
  xterm: boolean
  /** 置灰原因，按模式给出 */
  vncReason?: string
  xtermReason?: string
  /** 探测到的客户机 sshd 地址；有值说明终端与文件面板都能直连虚拟机内部 */
  guestHost?: string | null
  /** cloud-init 的 ciuser（PVE API 不回传 cipassword，密码需要用户输入） */
  guestUser?: string | null
  /** 终端实际会走的通道，用于界面上给个准信 */
  xtermBackend?: 'serial' | 'guest-ssh' | 'pty'
  /** 探测时间，用于前端显示「刚刚检测」 */
  probedAt: number
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
  /** 最近一次采样里每个线程的占用比（0 ~ 1），索引即线程号；PVE 未上报时为 undefined */
  cpuCores?: number[]
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
  /** 登录时填的 PVE 地址（保留协议头），供「服务器资源」等处显示 */
  serverUrl?: string
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
  /** PVE 账号总数（`/access/users` 去重计数）；接口无权限时为 undefined */
  userCount?: number
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
  template: boolean
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
  warnings?: string[]
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
  /** 控制台能力：VNC / xterm.js 是否可用，决定菜单项是否置灰 */
  console?: VmConsoleInfo
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
  notificationsEnabled?: boolean
  notifyVmShutdown?: boolean
  notifyTaskFailure?: boolean
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
  /** 控制台类型；不传时按对象默认（QEMU→VNC，LXC/节点→终端） */
  mode?: ConsoleMode
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

/* ------------------------------------------------------------------ *
 * SSH 终端与文件管理
 * ------------------------------------------------------------------ */

/** SSH 连接参数覆盖；留空则沿用 PVE 的地址与账号 */
export interface SshTargetOverride {
  host?: string
  port?: number
  username?: string
  password?: string
  /** 从虚拟机控制台串进终端时带上 PVE 认证头 */
  pveCookie?: string
  token?: string
  allowSelfSigned?: boolean
}

/**
 * 文件面板的操作目标。
 *
 * 不传 `guest` 就是节点（沿用 PVE 登录凭据）；
 * 传了 `guest` 就直连虚拟机自己的 sshd——右侧文件面板看的才是虚拟机里的文件。
 */
export interface SshFsInput {
  override?: SshTargetOverride
  /** 客户机 SSH 目标；同时提供 host 与 password 才生效 */
  guest?: SshTargetOverride
  path?: string
}

/**
 * 虚拟机终端会话的目标。
 *
 * `guest*` 字段是「连虚拟机自己的 sshd」用的：填了 guestHost 就优先走客户机 SSH，
 * 这样 Windows / 没配串口的机器也能用 xterm.js，右侧文件面板看的也是虚拟机里的文件。
 */
export interface VmTerminalTarget {
  node: string
  vmid: number
  type: VmType
  name?: string
  /** 客户机 IP（通常取自 Guest Agent 上报的接口地址） */
  guestHost?: string
  guestPort?: number
  guestUser?: string
  guestPassword?: string
  /** 客户机系统类型，用来决定默认账号（windows → Administrator） */
  ostype?: string
}

export interface SshOpenShellInput {
  override?: SshTargetOverride
  cols: number
  rows: number
  title?: string
  /** 从节点 Shell 入口进来时带上节点名，SSH 不可用时回退到 PVE 节点通道 */
  node?: string
  /** 客户机 SSH 凭据覆盖（虚拟机窗口里由用户填写） */
  guest?: SshTargetOverride
  /** 指定时开的是虚拟机控制台，而不是节点登录 shell */
  vm?: VmTerminalTarget
}

export interface SshShellSession {
  sessionId: string
  host: string
  username: string
  title: string
  createdAt: number
  cols: number
  rows: number
  /** 实际使用的通道：SSH 或 PVE termproxy（后者没有 SFTP 文件面板） */
  transport?: 'ssh' | 'termproxy' | 'serial' | 'guest-ssh'
}

/** 打开独立 SSH 窗口时的参数；不传则沿用 PVE 的地址与账号 */
export interface SshWindowOpenRequest {
  override?: SshTargetOverride
  /** 预置的标签数量，1~6，默认 1 */
  tabs?: number
  /** 从节点 Shell 入口点进来时带上节点名，用于标题与日志 */
  node?: string
  /** 打开的是某台虚拟机的 xterm.js 控制台 */
  vm?: VmTerminalTarget
}

/** 独立 SSH 窗口的启动上下文（渲染端拉取） */
export interface SshWindowBootstrap {
  request: SshWindowOpenRequest
  settings: AppSettings
}

export type SshShellEvent =
  | { type: 'data'; sessionId: string; data: string }
  | { type: 'exit'; sessionId: string; reason: string }

export interface SshProbeResult {
  ok: boolean
  message: string
  host?: string
  port?: number
  username?: string
}

export interface SshFileEntry {
  name: string
  path: string
  type: 'dir' | 'file' | 'link' | 'other'
  size: number
  mtime: number
}

export interface SshDirectoryListing {
  path: string
  home: string
  entries: SshFileEntry[]
}

export interface SshFileContent {
  path: string
  size: number
  text: string | null
  /** 超过预览上限，未读取内容 */
  truncated: boolean
  /** 判定为二进制，未读取内容 */
  binary: boolean
  mtime: number
}

/* ------------------------------------------------------------------ *
 * 访问控制（Access Control）
 * ------------------------------------------------------------------ */

export interface PveUserToken {
  tokenId: string
  fullTokenId: string
  comment?: string
  expire?: number
  privsep: boolean
  createdAt?: number
}

export interface PveUser {
  userid: string
  comment?: string
  email?: string
  firstName?: string
  lastName?: string
  groups: string[]
  keys?: string
  enabled: boolean
  expire?: number
  domain: string
  realmType: string
  tokens: PveUserToken[]
}

export interface PveGroup {
  groupid: string
  comment?: string
  users: string[]
}

export interface PveRole {
  roleid: string
  privs: string[]
  special: boolean
}

export interface PveAclEntry {
  path: string
  ugid: string
  type: 'user' | 'group' | 'token'
  roleid: string
  propagate: boolean
  comment?: string
}

export interface AccessOverviewData {
  users: PveUser[]
  groups: PveGroup[]
  roles: PveRole[]
  acl: PveAclEntry[]
  realms: string[]
  warnings: string[]
}

export interface AccessUserInput {
  userid: string
  password?: string
  comment?: string
  email?: string
  firstName?: string
  lastName?: string
  groups?: string[]
  expire?: number
  enabled?: boolean
  create?: boolean
}

export interface AccessGroupInput {
  groupid: string
  comment?: string
  create?: boolean
}

export interface AccessAclInput {
  path: string
  ugid: string
  roleid: string
  propagate?: boolean
  delete?: boolean
}

export interface AccessTokenInput {
  userid: string
  tokenId: string
  comment?: string
  expire?: number
  privsep?: boolean
  create?: boolean
}

export interface AccessTokenCreated {
  tokenId: string
  fullTokenId: string
  value: string
  message: string
}

/* ------------------------------------------------------------------ *
 * 存储与资源池
 * ------------------------------------------------------------------ */

export interface StorageDefinition {
  storage: string
  type: string
  content: string[]
  path?: string
  nodes?: string
  shared: boolean
  disable: boolean
  options: Record<string, string>
}

export interface StorageContentEntry {
  volid: string
  name: string
  format: string
  contentType: string
  size: number
  used: number
  vmid?: number
  ctime?: number
  node: string
  storage: string
  protected: boolean
  notes?: string
}

export interface StorageContentData {
  node: string
  storage: string
  contentType: string
  entries: StorageContentEntry[]
  totalSize: number
  totalUsed: number
}

export interface StorageOverviewData {
  definitions: StorageDefinition[]
  pools: PvePoolSummary[]
  warnings: string[]
}

export interface PvePoolSummary {
  poolid: string
  comment?: string
  members: Array<{ id: string; type: string; vmid?: number; node?: string; storage?: string }>
}

export interface StorageDefinitionInput {
  storage: string
  type: string
  content: string[]
  path?: string
  nodes?: string
  shared?: boolean
  disable?: boolean
  options?: Record<string, string>
  create?: boolean
  delete?: boolean
}

export interface PoolInput {
  poolid: string
  comment?: string
  create?: boolean
  delete?: boolean
}

export interface PoolMemberInput {
  poolid: string
  vms?: Array<string | number>
  storages?: string[]
  delete?: boolean
}

/* ------------------------------------------------------------------ *
 * 备份与还原
 * ------------------------------------------------------------------ */

export interface BackupFile {
  volid: string
  filename: string
  storage: string
  node: string
  format: string
  size: number
  ctime?: number
  vmid?: number
  guestType?: VmType
  notes?: string
  encrypted: boolean
}

export interface BackupOverviewData {
  files: BackupFile[]
  jobs: BackupJob[]
  totals: { count: number; size: number }
  warnings: string[]
}

export interface BackupJob {
  id: string
  enabled: boolean
  mode: string
  storage: string
  schedule: string
  vmid?: string
  node?: string
  all: boolean
  compress: string
  comment?: string
  nextRun?: number
  lastRun?: number
}

export interface BackupJobInput {
  id?: string
  storage: string
  schedule: string
  mode?: string
  compress?: string
  vmid?: string
  node?: string
  comment?: string
  enabled?: boolean
  delete?: boolean
}

export interface StartBackupInput {
  node: string
  storage: string
  vmid?: number
  mode?: 'snapshot' | 'suspend' | 'stop'
  compress?: 'zstd' | 'gzip' | 'lzo' | 'none'
  notesTemplate?: string
  protected?: boolean
  removeOlder?: number
}

export interface RestoreBackupInput {
  node: string
  storage: string
  volid: string
  vmid: number
  guestType: VmType
  unique?: boolean
  start?: boolean
  name?: string
  pool?: string
}

/* ------------------------------------------------------------------ *
 * 防火墙
 * ------------------------------------------------------------------ */

export type FirewallScope =
  | { level: 'cluster' }
  | { level: 'node'; node: string }
  | { level: 'vm'; node: string; type: VmType; vmid: number }

export interface FirewallRule {
  pos: number
  type: 'in' | 'out' | 'group'
  action: string
  proto?: string
  source?: string
  dest?: string
  sport?: string
  dport?: string
  iface?: string
  comment?: string
  enabled: boolean
  log?: string
  macro?: string
  icmpType?: string
  digest?: string
}

export interface FirewallRuleInput {
  scope: FirewallScope
  rule: Omit<FirewallRule, 'pos' | 'digest'> & { pos?: number }
  /** true 时按 pos 删除已有规则 */
  delete?: boolean
}

export interface FirewallOptions {
  enable: boolean
  policyIn?: string
  policyOut?: string
  logLevelIn?: string
  logLevelOut?: string
  ebtables?: boolean
  digest?: string
  extra?: Record<string, string>
}

export interface FirewallGroupSummary {
  group: string
  comment?: string
  ruleCount: number
}

export interface FirewallOverviewData {
  scope: FirewallScope
  options: FirewallOptions
  rules: FirewallRule[]
  groups: FirewallGroupSummary[]
  ipsets: Array<{ name: string; comment?: string }>
  warnings: string[]
}

export interface FirewallOptionsInput {
  scope: FirewallScope
  options: Partial<FirewallOptions>
}

export interface FirewallAliasInput {
  scope: FirewallScope
  name: string
  cidr: string
  comment?: string
  delete?: boolean
}

/* ------------------------------------------------------------------ *
 * 高可用（HA）
 * ------------------------------------------------------------------ */

export interface HaResource {
  sid: string
  type: string
  state?: string
  group?: string
  maxRestart?: number
  maxRelocate?: number
  comment?: string
  node?: string
  status?: string
}

export interface HaGroup {
  group: string
  nodes: string
  comment?: string
  restricted?: boolean
  noFailback?: boolean
}

export interface HaOverviewData {
  resources: HaResource[]
  groups: HaGroup[]
  statuses: Array<{ id: string; node?: string; status?: string; type?: string }>
  manager: Record<string, unknown> | null
  warnings: string[]
}

export interface HaResourceInput {
  sid: string
  group?: string
  maxRestart?: number
  maxRelocate?: number
  comment?: string
  state?: 'started' | 'stopped' | 'disabled' | 'enabled'
  delete?: boolean
}

export interface HaGroupInput {
  group: string
  nodes: string
  comment?: string
  restricted?: boolean
  noFailback?: boolean
  delete?: boolean
}

/* ------------------------------------------------------------------ *
 * SDN（软件定义网络）
 * ------------------------------------------------------------------ */

export type SdnZoneType = 'simple' | 'vlan' | 'qinq' | 'vxlan' | 'evpn'

export interface SdnZone {
  zone: string
  type: SdnZoneType
  /** 出口节点，仅 simple / vlan / qinq 可用 */
  bridge?: string
  mtu?: number
  nodes?: string[]
  /** VLAN 区域的主 VLAN 标签 */
  vlan?: number
  /** QinQ 区域的额外 VLAN 范围 */
  vlanProtocol?: string
  /** VXLAN / EVPN 的 VNI 与对端列表 */
  vxlanId?: number
  peers?: string[]
  /** EVPN 控制器 */
  controller?: string
  /** EVPN 的 VRF VXLAN 号 */
  vrfVxlan?: number
  /** EVPN 的 BGP 自治系统号 */
  asn?: number
  /** EVPN 的出口节点 */
  exitNodes?: string[]
  /** EVPN 对等端口与 MTU（供对端 FW 侧参考） */
  exitNodesLocalRouting?: boolean
  ipam?: string
  dns?: string
  dnsZone?: string
  reversedns?: string
  dhcp?: string
  pending?: boolean
  state?: string
  /** 区域配置在 pending 时保存的原始键值，供编辑回填 */
  raw?: Record<string, unknown>
}

export interface SdnVnet {
  vnet: string
  zone: string
  alias?: string
  /** VLAN 标签，未设置时由 SDN 自动分配 */
  tag?: number
  vlanaware?: boolean
  pending?: boolean
  state?: string
  raw?: Record<string, unknown>
}

export interface SdnSubnet {
  subnet: string
  zone: string
  vnet: string
  gateway?: string
  dnsZonePrefix?: string
  snat?: boolean
  dhcpRange?: { start?: string; end?: string }
  dnsServers?: string[]
  pending?: boolean
  state?: string
  raw?: Record<string, unknown>
}

export interface SdnOverviewData {
  zones: SdnZone[]
  vnets: SdnVnet[]
  subnets: SdnSubnet[]
  /** `/cluster/sdn` 返回的 SDN 是否已启用、是否有待应用变更 */
  enabled: boolean
  pending: boolean
  /** 读取 `pending` 阶段失败的端点说明 */
  warnings: string[]
}

export interface SdnZoneInput {
  zone: string
  type: SdnZoneType
  bridge?: string
  mtu?: number
  nodes?: string
  vlan?: number
  vlanProtocol?: string
  vxlanId?: number
  peers?: string
  controller?: string
  vrfVxlan?: number
  asn?: number
  exitNodes?: string
  ipam?: string
  dns?: string
  dnsZone?: string
  reversedns?: string
  dhcp?: string
  delete?: boolean
}

export interface SdnVnetInput {
  vnet: string
  zone: string
  alias?: string
  tag?: number
  vlanaware?: boolean
  delete?: boolean
}

export interface SdnSubnetInput {
  subnet: string
  vnet: string
  gateway?: string
  snat?: boolean
  dnsZonePrefix?: string
  dhcpRangeStart?: string
  dhcpRangeEnd?: string
  dnsServers?: string
  delete?: boolean
}

/* ------------------------------------------------------------------ *
 * 集群成员管理
 * ------------------------------------------------------------------ */

export interface ClusterJoinInfo {
  /** 本节点在 /cluster/config/nodes 中的条目名（用于移出） */
  selfNode?: string
  /** 本节点视角的集群名称；单机模式下 PVE 仍会返回一个名称 */
  clusterName?: string
  /** 已加入集群时的成员列表 */
  nodes: ClusterMember[]
  /** 集群配置的汇总指纹，用于提示配置是否一致 */
  configDigest?: string
  warnings: string[]
}

export interface ClusterMember {
  name: string
  nodeid?: number
  /** 该节点的 ring0 地址，PEER 加入时就是填这个 */
  ring0?: string
  votes?: number
  online?: boolean
}

export interface ClusterJoinInput {
  /** 对端节点地址（IP 或主机名），不要带协议前缀 */
  hostname: string
  /** 对端 root 密码，用于建立 ssh 信任 */
  password: string
  /** 对端集群指纹，必须与服务端返回的一致 */
  fingerprint?: string
  /** 建议的主机名，留空沿用对端 */
  nodeid?: string
  /** 是否用该节点 IP 作为集群通信地址 */
  usePeerAddress?: boolean
  /** VOTE 会带入对端 votedquorum */
  votes?: number
}

/* ------------------------------------------------------------------ *
 * 节点磁盘初始化
 * ------------------------------------------------------------------ */

export type DiskInitMode = 'gpt' | 'lvm' | 'lvmthin' | 'zfs' | 'directory' | 'wipe'

export interface DiskInitInput {
  node: string
  devpath: string
  mode: DiskInitMode
  /** 生成的存储 ID，wipe 时忽略 */
  name?: string
  /** LVM 卷组名 / ZFS 池名，留空用 name */
  vgname?: string
  /** lvmthin 的 thin 池名 */
  thinpool?: string
  /** directory 的挂载路径 */
  path?: string
  /** ZFS 上额外建一个 thin 风格的 dataset */
  zfsThin?: boolean
  /** ZFS 池的 raidz 级别，单盘留空 */
  raidlevel?: string
  /** 设备是否带分区表，勾选后按整盘处理 */
  force?: boolean
  /** wipe 前是否做一次全盘清零（慢，但能彻底清除旧数据） */
  fullWipe?: boolean
}

/* ------------------------------------------------------------------ *
 * 虚拟机增强：快照 / 迁移 / 模板 / cloud-init
 * ------------------------------------------------------------------ */

export interface SnapshotInput {
  ref: VmRef
  /** 创建快照时必填；回滚/删除时用于展示，不会写入 PVE */
  name?: string
  description?: string
  vmstate?: boolean
  /** 不为空时对该快照执行回滚 */
  rollback?: string
  /** 不为空时删除该快照 */
  delete?: string
}

export interface MigrateInput {
  ref: VmRef
  target: string
  online?: boolean
  withLocalDisks?: boolean
  targetStorage?: string
  force?: boolean
}

export interface TemplateInput {
  ref: VmRef
  /** true 转为模板，false 取消模板标记（仅 qemu 支持直接取消） */
  template: boolean
}

export interface CloudInitInput {
  ref: VmRef
  /** 生成 cloud-init 磁盘（如 ide2=local-lvm:cloudinit） */
  addDrive?: string
  user?: string
  password?: string
  sshKeys?: string
  ipconfig0?: string
  nameserver?: string
  searchdomain?: string
  ciuser?: string
  cicustom?: string
  citype?: 'nocloud' | 'configdrive2'
}

export interface VmSendKeyInput {
  ref: VmRef
  keys: string[]
}

/* ------------------------------------------------------------------ *
 * 任务管理
 */

export interface TaskListQuery {
  node?: string
  /** 最多返回条数，默认 200 */
  limit?: number
  /** 只看失败的 */
  errorsOnly?: boolean
  typeFilter?: string
  /** 起始时间（秒），用于「最近 1 小时 / 24 小时」 */
  since?: number
}

export interface TaskListData {
  tasks: TaskSummary[]
  warnings: string[]
}

/* ------------------------------------------------------------------ *
 * 节点运维：订阅 / APT / 证书
 */

export interface SubscriptionInfo {
  status: 'active' | 'expired' | 'notfound' | 'new' | 'invalid' | 'unknown'
  level?: string
  key?: string
  message?: string
  serverid?: string
  sockets?: number
  checkTime?: number
  nextDueDate?: number
  productName?: string
  regDate?: string
}

export interface AptRepository {
  path: string
  fileType: string
  index: number
  enabled: boolean
  components: string[]
  uris: string[]
  suites?: string[]
  comment?: string
  types?: string[]
  warning?: string
}

export interface AptPackageUpdate {
  package: string
  title?: string
  oldVersion?: string
  version: string
  section?: string
  priority?: string
  origin?: string
  description?: string
}

export interface NodeAptData {
  node: string
  repositories: AptRepository[]
  updates: AptPackageUpdate[]
  /** 标准仓库 / 企业仓库是否启用，仅 pve 系发行版有意义 */
  standardRepo: boolean
  enterpriseRepo: boolean
  warnings: string[]
}

export interface NodeCertificateData {
  node: string
  custom: boolean
  info?: NodeCertificateInfo
  /** 自定义证书的 PEM 原文，自签证书为空 */
  pem?: string
  warnings: string[]
}

export interface NodeCertificateUpload {
  node: string
  certificates: string
  key: string
  force?: boolean
  restart?: boolean
}

export interface AptUpdateResult {
  node: string
  upid?: string
  message: string
}

export interface NodeAptAction {
  node: string
  /** 升级全部软件包；为 false 时只执行 refresh */
  upgrade?: boolean
  /** 同时处理发行版升级（dist-upgrade） */
  distUpgrade?: boolean
  /** 排除的软件包 */
  exclude?: string[]
}

export interface SnapshotMutationResult {
  message: string
  upid?: string
  name: string
}

export interface DesktopApi {
  bootstrap: () => Promise<ApiResult<BootstrapData>>
  login: (input: LoginInput) => Promise<ApiResult<LoginResult>>
  logout: (clearSaved?: boolean) => Promise<ApiResult<AppSettings>>
  updatePreferences: (patch: PreferencesPatch) => Promise<ApiResult<AppSettings>>
  forgetCredentials: () => Promise<ApiResult<AppSettings>>
  testNotification: () => Promise<ApiResult<void>>
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
  accessOverview: () => Promise<ApiResult<AccessOverviewData>>
  accessUserSave: (input: AccessUserInput) => Promise<ApiResult<void>>
  accessUserDelete: (userid: string) => Promise<ApiResult<void>>
  accessGroupSave: (input: AccessGroupInput) => Promise<ApiResult<void>>
  accessGroupDelete: (groupid: string) => Promise<ApiResult<void>>
  accessAclUpdate: (input: AccessAclInput) => Promise<ApiResult<void>>
  accessTokenSave: (input: AccessTokenInput) => Promise<ApiResult<AccessTokenCreated | null>>
  accessTokenDelete: (userid: string, tokenId: string) => Promise<ApiResult<void>>
  storageOverview: () => Promise<ApiResult<StorageOverviewData>>
  storageContents: (node: string, storage: string, contentType?: string) => Promise<ApiResult<StorageContentData>>
  storageDefinitionSave: (input: StorageDefinitionInput) => Promise<ApiResult<void>>
  storageContentDelete: (node: string, storage: string, volid: string) => Promise<ApiResult<ActionResult>>
  poolSave: (input: PoolInput) => Promise<ApiResult<void>>
  poolMemberUpdate: (input: PoolMemberInput) => Promise<ApiResult<void>>
  backupOverview: () => Promise<ApiResult<BackupOverviewData>>
  backupStart: (input: StartBackupInput) => Promise<ApiResult<ActionResult>>
  backupJobSave: (input: BackupJobInput) => Promise<ApiResult<void>>
  backupRestore: (input: RestoreBackupInput) => Promise<ApiResult<ActionResult>>
  firewallOverview: (scope: FirewallScope) => Promise<ApiResult<FirewallOverviewData>>
  firewallRuleSave: (input: FirewallRuleInput) => Promise<ApiResult<void>>
  firewallOptionsSave: (input: FirewallOptionsInput) => Promise<ApiResult<void>>
  firewallAliasSave: (input: FirewallAliasInput) => Promise<ApiResult<void>>
  haOverview: () => Promise<ApiResult<HaOverviewData>>
  haResourceSave: (input: HaResourceInput) => Promise<ApiResult<void>>
  haGroupSave: (input: HaGroupInput) => Promise<ApiResult<void>>
  vmSnapshot: (input: SnapshotInput) => Promise<ApiResult<SnapshotMutationResult>>
  vmMigrate: (input: MigrateInput) => Promise<ApiResult<ActionResult>>
  vmTemplate: (input: TemplateInput) => Promise<ApiResult<ActionResult>>
  vmCloudInit: (input: CloudInitInput) => Promise<ApiResult<VmMutationResult>>
  vmSendKey: (input: VmSendKeyInput) => Promise<ApiResult<void>>
  taskList: (query?: TaskListQuery) => Promise<ApiResult<TaskListData>>
  taskStop: (node: string, upid: string) => Promise<ApiResult<void>>
  taskDelete: (node: string, upid: string) => Promise<ApiResult<void>>
  subscriptionInfo: (node: string) => Promise<ApiResult<SubscriptionInfo>>
  subscriptionUpdate: (node: string, key: string) => Promise<ApiResult<void>>
  subscriptionDelete: (node: string) => Promise<ApiResult<void>>
  nodeApt: (node: string) => Promise<ApiResult<NodeAptData>>
  nodeAptRefresh: (input: NodeAptAction) => Promise<ApiResult<AptUpdateResult>>
  nodeAptRepoSave: (node: string, repos: AptRepository[]) => Promise<ApiResult<void>>
  nodeCertificate: (node: string) => Promise<ApiResult<NodeCertificateData>>
  nodeCertificateUpload: (input: NodeCertificateUpload) => Promise<ApiResult<void>>
  nodeCertificateReset: (node: string) => Promise<ApiResult<void>>
  sdnOverview: () => Promise<ApiResult<SdnOverviewData>>
  sdnZoneSave: (input: SdnZoneInput) => Promise<ApiResult<void>>
  sdnVnetSave: (input: SdnVnetInput) => Promise<ApiResult<void>>
  sdnSubnetSave: (input: SdnSubnetInput) => Promise<ApiResult<void>>
  sdnApply: (revert?: boolean) => Promise<ApiResult<void>>
  clusterJoinInfo: () => Promise<ApiResult<ClusterJoinInfo>>
  clusterJoin: (input: ClusterJoinInput) => Promise<ApiResult<void>>
  clusterNodeRemove: (node: string) => Promise<ApiResult<void>>
  diskInit: (input: DiskInitInput) => Promise<ApiResult<void>>
  openConsoleWindow: (input: ConsoleOpenRequest) => Promise<ApiResult<void>>
  consoleWindowBootstrap: () => Promise<ApiResult<ConsoleWindowBootstrap>>
  openSshWindow: (input?: SshWindowOpenRequest) => Promise<ApiResult<void>>
  sshWindowBootstrap: () => Promise<ApiResult<SshWindowBootstrap>>
  consoleOpen: (input: ConsoleOpenRequest) => Promise<ApiResult<ConsoleSessionInfo>>
  consoleClose: (sessionId: string) => Promise<ApiResult<void>>
  sshProbe: (override?: SshTargetOverride) => Promise<ApiResult<SshProbeResult>>
  sshShellOpen: (input: SshOpenShellInput) => Promise<ApiResult<SshShellSession>>
  sshShellList: () => Promise<ApiResult<SshShellSession[]>>
  sshShellWrite: (sessionId: string, data: string) => Promise<ApiResult<void>>
  sshShellResize: (sessionId: string, cols: number, rows: number) => Promise<ApiResult<void>>
  sshShellClose: (sessionId: string) => Promise<ApiResult<void>>
  onSshShellEvent: (callback: (event: SshShellEvent) => void) => () => void
  sshFsList: (input: SshFsInput) => Promise<ApiResult<SshDirectoryListing>>
  sshFsRead: (input: SshFsInput) => Promise<ApiResult<SshFileContent>>
  sshFsWrite: (input: SshFsInput & { content: string }) => Promise<ApiResult<{ path: string; size: number }>>
  sshFsCreateFile: (input: SshFsInput) => Promise<ApiResult<{ path: string }>>
  sshFsCreateDir: (input: SshFsInput) => Promise<ApiResult<{ path: string }>>
  sshFsRemove: (input: SshFsInput & { recursive?: boolean }) => Promise<ApiResult<{ path: string }>>
  sshFsRename: (input: SshFsInput & { from: string; to: string }) => Promise<ApiResult<{ from: string; to: string }>>
  sshFsUpload: (input: SshFsInput & { remoteDir: string; localPath?: string }) => Promise<ApiResult<{ path: string; size: number } | null>>
  sshFsDownload: (input: SshFsInput) => Promise<ApiResult<{ path: string; size: number } | null>>
  windowMinimize: () => void
  windowHide: () => void
  windowToggleMaximize: () => void
  windowClose: () => void
  getWindowState: () => Promise<WindowState>
  onWindowState: (callback: (state: WindowState) => void) => () => void
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void
}
