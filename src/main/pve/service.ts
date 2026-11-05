import {
  GUEST_TYPES,
  MAX_REFRESH_INTERVAL,
  MIN_REFRESH_INTERVAL
} from '@shared/ipc'
import type {
  ActionResult,
  AgentInterface,
  BridgeOption,
  CloneVmInput,
  ClusterInfo,
  ConsoleOpenRequest,
  ConsoleSessionInfo,
  CreateOptions,
  CreateVmInput,
  DashboardData,
  DiskStorageOption,
  HaStatus,
  IsoOption,
  LiveMetricsData,
  LiveNodeMetrics,
  MutationResult,
  NodeMetricPoint,
  NodeCertificateInfo,
  NodeDirectoryStorage,
  NodeDiskInfo,
  NodeDnsSettings,
  NodeLogEntry,
  NodeLvmGroup,
  NodeLvmThinPool,
  NodeNetworkActionResult,
  NodeNetworkInput,
  NodeNetworkInterface,
  NodeOption,
  NodeRepositorySummary,
  NodeSettingsData,
  NodeSummary,
  NodeTimeSettings,
  NodeZfsPool,
  PveVersionInfo,
  SessionProfile,
  StorageSummary,
  TaskLogLine,
  TaskStatusResult,
  TaskSummary,
  TemplateOption,
  VmAction,
  VmDetail,
  VmMetricPoint,
  VmOsInfo,
  VmRef,
  VmRuntime,
  VmSnapshot,
  VmSummary,
  VmType
} from '@shared/types'
import { PveClient, PveError, normalizeServerUrl, validateUpid } from './client'
import { ConsoleHost, type ConsoleUpstream } from '../console-host'
import { agentEnabledFromConfig, detectAgentOs, detectVmOs, isGenericLinuxOs } from './os'

type Raw = Record<string, unknown>

interface LoginInput {
  serverUrl: string
  username: string
  password: string
  rememberPassword: boolean
  allowSelfSigned: boolean
}

const TERMINAL_TASK_STATES = new Set(['stopped'])

function object(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function tagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean)
  }
  return text(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function validateNode(node: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(node)) {
    throw new PveError('VALIDATION', '节点名称格式无效。')
  }
  return node
}

function validateVmType(type: string): VmType {
  if (type !== 'qemu' && type !== 'lxc') {
    throw new PveError('VALIDATION', '不支持的虚拟机类型。')
  }
  return type
}

function validateVmid(vmid: number): number {
  if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999_999_999) {
    throw new PveError('VALIDATION', '虚拟机 ID 必须是 100-999999999 之间的整数。')
  }
  return vmid
}

function vmBase(ref: VmRef): string {
  const type = validateVmType(ref.type)
  return `/nodes/${encodeURIComponent(validateNode(ref.node))}/${type}/${validateVmid(ref.vmid)}`
}

function pveConsoleUrl(serverUrl: string, path: string, port: number | string, ticket: string): string {
  const url = new URL(serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/api2/json${path}`
  url.search = ''
  url.searchParams.set('port', String(port))
  url.searchParams.set('vncticket', ticket)
  return url.toString()
}

function mapTask(raw: Raw): TaskSummary {
  const endTime = raw.endtime ? number(raw.endtime) : undefined
  const startTime = number(raw.starttime)
  const rawStatus = text(raw.status) || undefined
  const running = !endTime
  const ok = rawStatus?.toUpperCase() === 'OK'
  const status: TaskSummary['status'] = running ? 'running' : ok ? 'ok' : rawStatus ? 'error' : 'unknown'
  return {
    upid: text(raw.upid),
    node: text(raw.node),
    type: text(raw.type, 'task'),
    id: raw.id === undefined ? undefined : text(raw.id),
    user: text(raw.user),
    status,
    rawStatus,
    startTime,
    endTime,
    duration: endTime ? Math.max(0, endTime - startTime) : Math.max(0, Math.floor(Date.now() / 1000) - startTime)
  }
}

function mapTaskStatus(raw: { status?: string; exitstatus?: string }): TaskStatusResult['status'] {
  if (raw.status === 'running') return 'running'
  if (raw.status === 'stopped') return 'stopped'
  return 'unknown'
}

function mapHa(raw: unknown[]): HaStatus[] {
  return raw.map((entry) => {
    const item = object(entry)
    return {
      id: text(item.id, text(item.type)),
      type: text(item.type),
      node: item.node ? text(item.node) : undefined,
      status: text(item.status),
      quorate: item.quorate === undefined ? undefined : number(item.quorate)
    }
  })
}

function mapVmSummary(raw: Raw): VmSummary {
  const type = validateVmType(text(raw.type, 'qemu'))
  const status = text(raw.status, 'unknown')
  return {
    id: text(raw.id, `${type}/${number(raw.vmid)}`),
    vmid: number(raw.vmid),
    name: text(raw.name) || `VM ${number(raw.vmid)}`,
    node: text(raw.node),
    type,
    status,
    template: boolean(raw.template),
    tags: tagList(raw.tags),
    os: { family: 'other', name: '检测中', source: 'default' },
    cpu: clamp(number(raw.cpu), 0, 1),
    cpus: number(raw.maxcpu),
    mem: number(raw.mem),
    maxmem: number(raw.maxmem),
    disk: number(raw.disk),
    maxdisk: number(raw.maxdisk),
    uptime: number(raw.uptime),
    netin: number(raw.netin),
    netout: number(raw.netout),
    diskread: number(raw.diskread),
    diskwrite: number(raw.diskwrite)
  }
}

function mapStorage(raw: Raw): StorageSummary {
  const used = number(raw.disk)
  const total = number(raw.maxdisk)
  return {
    id: text(raw.id, `storage/${text(raw.node)}/${text(raw.storage)}`),
    storage: text(raw.storage),
    node: text(raw.node),
    type: text(raw.plugintype, 'dir'),
    content: text(raw.content)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    shared: boolean(raw.shared),
    active: text(raw.status) === 'available',
    status: text(raw.status, 'unknown'),
    used,
    total,
    avail: Math.max(0, total - used),
    usedFraction: total > 0 ? clamp(used / total, 0, 1) : 0
  }
}

function mapNodeMetrics(raw: unknown[]): NodeMetricPoint[] {
  return raw
    .map((entry) => {
      const item = object(entry)
      const memtotal = number(item.memtotal)
      const memused = number(item.memused)
      return {
        time: number(item.time) * 1000,
        cpu: clamp(number(item.cpu), 0, 1),
        mem: memtotal > 0 ? clamp(memused / memtotal, 0, 1) : 0
      }
    })
    .filter((point) => point.time > 0)
}

function mapVmMetrics(raw: unknown[]): VmMetricPoint[] {
  return raw
    .map((entry) => {
      const item = object(entry)
      return {
        time: number(item.time) * 1000,
        cpu: clamp(number(item.cpu), 0, 1),
        mem: number(item.mem),
        maxmem: number(item.maxmem),
        netin: number(item.netin),
        netout: number(item.netout),
        diskread: number(item.diskread),
        diskwrite: number(item.diskwrite)
      }
    })
    .filter((point) => point.time > 0)
}

function mapSnapshots(raw: unknown[]): VmSnapshot[] {
  return raw
    .filter((entry) => {
      const item = object(entry)
      return Boolean(text(item.name))
    })
    .map((entry) => {
      const item = object(entry)
      return {
        name: text(item.name),
        description: text(item.description) || undefined,
        snaptime: item.snaptime ? number(item.snaptime) : undefined,
        parent: item.parent ? text(item.parent) : undefined,
        vmstate: boolean(item.vmstate),
        current: text(item.name) === 'current',
        running: boolean(item.running)
      }
    })
    .sort((a, b) => {
      if (a.current) return -1
      if (b.current) return 1
      return (b.snaptime ?? 0) - (a.snaptime ?? 0)
    })
}

function mapAgent(raw: unknown): AgentInterface[] {
  const payload = object(raw)
  const interfaces = array(payload.result ?? raw)
  return interfaces.map((entry) => {
    const item = object(entry)
    const stats = object(item.statistics)
    const ips = array(item['ip-addresses']).map((address) => {
      const ip = object(address)
      return {
        address: text(ip['ip-address']),
        type: text(ip['ip-address-type']),
        prefix: ip.prefix === undefined ? undefined : number(ip.prefix)
      }
    })
    return {
      name: text(item.name),
      mac: text(item['hardware-address']) || undefined,
      ips: ips.filter((ip) => ip.address),
      rxBytes: stats['rx-bytes'] === undefined ? undefined : number(stats['rx-bytes']),
      txBytes: stats['tx-bytes'] === undefined ? undefined : number(stats['tx-bytes'])
    }
  })
}

function mapRuntime(raw: Raw, config: Raw): VmRuntime {
  const ha = object(raw.ha)
  const configAgent = config.agent
  return {
    status: text(raw.status, 'unknown'),
    qmpStatus: text(raw.qmpstatus) || undefined,
    uptime: number(raw.uptime),
    cpu: clamp(number(raw.cpu), 0, 1),
    cpus: number(raw.cpus, number(config.cores) * Math.max(1, number(config.sockets, 1))),
    mem: number(raw.mem),
    maxmem: number(raw.maxmem, number(config.memory) * 1024 * 1024),
    memhost: raw.memhost === undefined ? undefined : number(raw.memhost),
    freemem: raw.freemem === undefined ? undefined : number(raw.freemem),
    balloon: raw.balloon === undefined ? undefined : number(raw.balloon),
    pid: raw.pid === undefined ? undefined : number(raw.pid),
    netin: number(raw.netin),
    netout: number(raw.netout),
    diskread: number(raw.diskread),
    diskwrite: number(raw.diskwrite),
    maxdisk: number(raw.maxdisk),
    agentEnabled: boolean(configAgent) || text(configAgent) === 'enabled',
    haManaged: boolean(ha.managed),
    runningMachine: text(raw['running-machine']) || undefined,
    runningQemu: text(raw['running-qemu']) || undefined,
    tags: tagList(raw.tags ?? config.tags),
    pressureCpu: raw.pressurecpusome === undefined ? undefined : number(raw.pressurecpusome),
    pressureMemory: raw.pressurememorysome === undefined ? undefined : number(raw.pressurememorysome),
    pressureIo: raw.pressureiosome === undefined ? undefined : number(raw.pressureiosome)
  }
}

function sanitizeConfig(raw: Raw): Record<string, string | number> {
  const clean: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue
    if (/password|secret|token|key$/i.test(key) && key !== 'sshkeys' && key !== 'keyboard') {
      clean[key] = '••••••••'
    } else {
      clean[key] = value
    }
  }
  return clean
}

function buildVmForm(input: CreateVmInput): { form: Record<string, string | number>; iso: string | null } {
  validateNode(input.node)
  const vmid = validateVmid(input.vmid)
  const name = input.name.trim()
  if (!name || name.length > 64 || /[\\/\u0000-\u001f]/.test(name)) {
    throw new PveError('VALIDATION', '虚拟机名称长度须为 1-64 个字符，且不能包含斜杠或控制字符。')
  }
  if (!Number.isInteger(input.cores) || input.cores < 1 || input.cores > 128) {
    throw new PveError('VALIDATION', 'CPU 核心数必须在 1-128 之间。')
  }
  if (!Number.isInteger(input.sockets) || input.sockets < 1 || input.sockets > 8) {
    throw new PveError('VALIDATION', 'CPU 插槽数必须在 1-8 之间。')
  }
  if (!Number.isInteger(input.memory) || input.memory < 256 || input.memory > 1_048_576) {
    throw new PveError('VALIDATION', '内存必须在 256 MiB - 1 TiB 之间。')
  }
  if (!Number.isInteger(input.diskSize) || input.diskSize < 1 || input.diskSize > 4096) {
    throw new PveError('VALIDATION', '磁盘大小必须在 1-4096 GiB 之间。')
  }
  if (!GUEST_TYPES.some((item) => item.value === input.ostype)) {
    throw new PveError('VALIDATION', '不支持的客户机操作系统类型。')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.diskStorage)) {
    throw new PveError('VALIDATION', '磁盘存储名称无效。')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(input.bridge)) {
    throw new PveError('VALIDATION', '网络桥接名称无效。')
  }
  if (input.vlanTag !== null && (!Number.isInteger(input.vlanTag) || input.vlanTag < 1 || input.vlanTag > 4094)) {
    throw new PveError('VALIDATION', 'VLAN 标记必须在 1-4094 之间。')
  }
  let iso: string | null = input.iso?.trim() || null
  if (iso) {
    if (iso.length > 512 || /[\r\n]/.test(iso) || !/^[A-Za-z0-9._-]+:iso\/.+$/.test(iso)) {
      throw new PveError('VALIDATION', '安装镜像的卷标识无效。')
    }
  }

  let network = `virtio,bridge=${input.bridge},firewall=1`
  if (input.vlanTag) network += `,tag=${input.vlanTag}`

  const form: Record<string, string | number> = {
    vmid,
    name,
    cores: input.cores,
    sockets: input.sockets,
    memory: input.memory,
    ostype: input.ostype,
    scsihw: 'virtio-scsi-single',
    scsi0: `${input.diskStorage}:${input.diskSize}`,
    net0: network,
    agent: input.agent ? 1 : 0,
    onboot: input.onboot ? 1 : 0,
    numa: 0,
    ide2: iso ? `${iso},media=cdrom` : 'none,media=cdrom',
    boot: iso ? 'order=ide2;scsi0;net0' : 'order=scsi0;net0'
  }
  if (!iso) iso = null
  return { form, iso }
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  return text(value)
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined
  return boolean(value)
}

function mapNodeNetworkInterface(raw: Raw): NodeNetworkInterface {
  return {
    iface: text(raw.iface),
    type: text(raw.type, 'unknown'),
    active: optionalBoolean(raw.active),
    exists: optionalBoolean(raw.exists),
    autostart: optionalBoolean(raw.autostart),
    comments: optionalText(raw.comments),
    address: optionalText(raw.address),
    netmask: optionalText(raw.netmask),
    cidr: optionalText(raw.cidr),
    gateway: optionalText(raw.gateway),
    address6: optionalText(raw.address6),
    netmask6: optionalNumber(raw.netmask6),
    cidr6: optionalText(raw.cidr6),
    gateway6: optionalText(raw.gateway6),
    mtu: optionalNumber(raw.mtu),
    bridge_ports: optionalText(raw.bridge_ports),
    bridge_stp: optionalText(raw.bridge_stp),
    bridge_vlan_aware: optionalBoolean(raw.bridge_vlan_aware),
    bridge_vids: optionalText(raw.bridge_vids),
    slaves: optionalText(raw.slaves),
    bond_mode: optionalText(raw.bond_mode),
    bond_xmit_hash_policy: optionalText(raw.bond_xmit_hash_policy),
    'vlan-id': optionalNumber(raw['vlan-id']),
    'vlan-raw-device': optionalText(raw['vlan-raw-device']),
    families: array(raw.families).map((entry) => text(entry)),
    priority: optionalNumber(raw.priority)
  }
}

function mapNodeCertificate(raw: Raw): NodeCertificateInfo {
  return {
    filename: text(raw.filename, '证书'),
    subject: optionalText(raw.subject),
    issuer: optionalText(raw.issuer),
    fingerprint: optionalText(raw.fingerprint),
    notbefore: optionalNumber(raw.notbefore),
    notafter: optionalNumber(raw.notafter),
    publicKeyType: optionalText(raw['public-key-type']),
    publicKeyBits: optionalNumber(raw['public-key-bits']),
    san: array(raw.san).map((entry) => text(entry))
  }
}

function mapNodeRepositories(raw: Raw): NodeRepositorySummary {
  const sources: NodeRepositorySummary['sources'] = array(raw.files).map((entry) => {
    const file = object(entry)
    return {
      path: text(file.path),
      fileType: optionalText(file['file-type']),
      repositories: array(file.repositories).map((repoEntry) => {
        const repo = object(repoEntry)
        return {
          types: array(repo.Types).map((item) => text(item)),
          uris: array(repo.URIs).map((item) => text(item)),
          suites: array(repo.Suites).map((item) => text(item)),
          components: array(repo.Components).map((item) => text(item)),
          enabled: boolean(repo.Enabled),
          comment: optionalText(repo.Comment)
        }
      })
    }
  })
  return {
    errors: array(raw.errors).map((entry) => text(entry)),
    standardRepos: array(raw['standard-repos']).map((entry) => {
      const repo = object(entry)
      return { name: text(repo.name), handle: text(repo.handle), description: optionalText(repo.description) }
    }),
    sources
  }
}

function mapLvmGroups(raw: unknown): NodeLvmGroup[] {
  const root = object(raw)
  const groups = array(root.children).length > 0 ? array(root.children) : root.name ? [root] : []
  return groups.map((entry) => {
    const group = object(entry)
    return {
      name: text(group.name),
      size: number(group.size),
      free: number(group.free)
    }
  })
}

function mapLvmThinPools(raw: unknown): NodeLvmThinPool[] {
  return array(raw).map((entry) => {
    const pool = object(entry)
    return {
      lv: text(pool.lv),
      vg: text(pool.vg),
      lvSize: number(pool.lv_size),
      used: number(pool.used),
      metadataSize: optionalNumber(pool.metadata_size),
      metadataUsed: optionalNumber(pool.metadata_used),
      lvState: optionalText(pool.lv_state)
    }
  })
}

function mapDirectoryStorages(raw: unknown): NodeDirectoryStorage[] {
  return array(raw).map((entry) => {
    const directory = object(entry)
    return {
      path: text(directory.path),
      type: optionalText(directory.type),
      storage: optionalText(directory.storage),
      total: optionalNumber(directory.total),
      used: optionalNumber(directory.used),
      avail: optionalNumber(directory.avail)
    }
  })
}

function mapZfsPools(raw: unknown): NodeZfsPool[] {
  return array(raw).map((entry) => {
    const pool = object(entry)
    return {
      name: text(pool.name),
      size: optionalNumber(pool.size),
      free: optionalNumber(pool.free),
      health: optionalText(pool.health),
      alloc: optionalNumber(pool.alloc)
    }
  })
}

function mapNodeDisks(raw: unknown[]): NodeDiskInfo[] {
  return array(raw).map((entry) => {
    const disk = object(entry)
    return {
      devpath: text(disk.devpath),
      model: optionalText(disk.model),
      serial: optionalText(disk.serial),
      size: number(disk.size),
      type: optionalText(disk.type),
      health: optionalText(disk.health),
      used: optionalText(disk.used),
      wearout: typeof disk.wearout === 'number' || typeof disk.wearout === 'string' ? disk.wearout : undefined,
      vendor: optionalText(disk.vendor),
      rpm: typeof disk.rpm === 'number' || typeof disk.rpm === 'string' ? disk.rpm : undefined
    }
  })
}

function validateNetworkInterfaceName(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) {
    throw new PveError('VALIDATION', '网络接口名称格式无效。')
  }
  return value
}

function buildNetworkForm(input: NodeNetworkInput): Record<string, string> {
  const form: Record<string, string> = {
    iface: validateNetworkInterfaceName(input.iface.trim()),
    type: input.type
  }
  if (input.comments !== undefined) form.comments = input.comments
  if (input.autostart !== undefined) form.autostart = input.autostart ? '1' : '0'
  if (input.mtu !== undefined) form.mtu = String(input.mtu)
  if (input.cidr?.trim()) form.cidr = input.cidr.trim()
  if (input.gateway?.trim()) form.gateway = input.gateway.trim()
  if (input.cidr6?.trim()) form.cidr6 = input.cidr6.trim()
  if (input.gateway6?.trim()) form.gateway6 = input.gateway6.trim()

  if (input.type === 'bridge') {
    if (input.bridgePorts?.trim()) form.bridge_ports = input.bridgePorts.trim()
    if (input.bridgeStp !== undefined) form.bridge_stp = input.bridgeStp ? 'on' : 'off'
    if (input.bridgeVlanAware !== undefined) form.bridge_vlan_aware = input.bridgeVlanAware ? '1' : '0'
    if (input.bridgeVids?.trim()) form.bridge_vids = input.bridgeVids.trim()
  }
  if (input.type === 'vlan') {
    if (input.vlanId !== undefined) form['vlan-id'] = String(input.vlanId)
    if (input.vlanRawDevice?.trim()) form['vlan-raw-device'] = input.vlanRawDevice.trim()
  }
  if (input.type === 'bond') {
    if (input.slaves?.trim()) form.slaves = input.slaves.trim()
    if (input.bondMode?.trim()) form.bond_mode = input.bondMode.trim()
    if (input.bondXmitHashPolicy?.trim()) form.bond_xmit_hash_policy = input.bondXmitHashPolicy.trim()
  }
  return form
}

export class PveManager {
  private client: PveClient | null = null
  private profile: SessionProfile | null = null
  private lastDashboard: DashboardData | null = null
  private lastDashboardAt = 0
  private readonly consoleHost = new ConsoleHost()
  private readonly osCache = new Map<
    number,
    {
      os: VmOsInfo
      agentEnabled: boolean
      configFetchedAt: number
      agentAttemptAt?: number
    }
  >()
  private osEnrichmentRunning = false

  get session(): SessionProfile | null {
    return this.profile
  }

  get serverUrl(): string | null {
    return this.client?.serverUrl ?? null
  }

  async login(input: LoginInput): Promise<SessionProfile> {
    const serverUrl = normalizeServerUrl(input.serverUrl)
    const username = input.username.trim()
    if (!username || username.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._@-]*$/.test(username)) {
      throw new PveError('VALIDATION', '请输入有效的 PVE 用户名，例如 root@pam。')
    }
    if (!input.password) {
      throw new PveError('VALIDATION', '请输入 PVE 密码。')
    }
    if (input.password.length > 1024) {
      throw new PveError('VALIDATION', '密码长度无效。')
    }

    const nextClient = new PveClient({
      serverUrl,
      username,
      password: input.password,
      allowSelfSigned: input.allowSelfSigned
    })

    try {
      const result = await nextClient.login()
      this.client?.dispose()
      this.client = nextClient
      this.lastDashboard = null
      this.lastDashboardAt = 0
      this.osCache.clear()
      this.profile = {
        serverUrl,
        username,
        clusterName: result.clusterName || 'PVE',
        connectedAt: Date.now()
      }
      return this.profile
    } catch (error) {
      nextClient.dispose()
      throw error
    }
  }

  logout(): void {
    this.consoleHost.closeAll()
    this.client?.dispose()
    this.client = null
    this.profile = null
    this.lastDashboard = null
    this.lastDashboardAt = 0
    this.osCache.clear()
  }

  getCachedDashboard(): DashboardData | null {
    return this.lastDashboard
  }

  private requireClient(): PveClient {
    if (!this.client) {
      throw new PveError('AUTH_REQUIRED', '尚未连接 PVE，请先登录。')
    }
    return this.client
  }

  async getDashboard(): Promise<DashboardData> {
    const client = this.requireClient()
    const started = Date.now()

    const [rawClusterStatus, rawResources, rawNodes, rawVersion, rawHa, rawOptions] = await Promise.all([
      client.request<unknown[]>('/cluster/status'),
      client.request<unknown[]>('/cluster/resources'),
      client.request<unknown[]>('/nodes'),
      client.request<Raw>('/version').catch(() => ({})),
      client.request<unknown[]>('/cluster/ha/status/current').catch(() => []),
      client.request<Raw>('/cluster/options').catch(() => ({}))
    ])

    const clusterEntries = array(rawClusterStatus).map(object)
    const clusterEntry = clusterEntries.find((entry) => text(entry.type) === 'cluster') ?? {}
    const nodeEntries = array(rawNodes).map(object)
    const resources = array(rawResources).map(object)

    const nodeResults = await Promise.all(
      nodeEntries.map(async (nodeEntry) => {
        const nodeName = text(nodeEntry.node)
        const base = `/nodes/${encodeURIComponent(nodeName)}`
        const [statusResult, metricsResult, taskResult] = await Promise.all([
          client.request<Raw>(`${base}/status`).catch(() => null),
          client.request<unknown[]>(`${base}/rrddata?timeframe=hour&cf=AVERAGE`).catch(() => []),
          client.request<unknown[]>(`${base}/tasks?limit=20`).catch(() => [])
        ])
        return { nodeEntry, statusResult, metricsResult, taskResult }
      })
    )

    const nodes: NodeSummary[] = nodeResults.map(({ nodeEntry, statusResult, metricsResult }) => {
      const detail = object(statusResult)
      const memory = object(detail.memory)
      const rootfs = object(detail.rootfs)
      const cpuinfo = object(detail.cpuinfo)
      const loadavg = array(detail.loadavg).map((item) => number(item))
      const online = text(nodeEntry.status) === 'online'
      return {
        node: text(nodeEntry.node),
        status: online ? 'online' : text(nodeEntry.status) === 'offline' ? 'offline' : 'unknown',
        uptime: number(detail.uptime, number(nodeEntry.uptime)),
        cpu: clamp(number(detail.cpu, number(nodeEntry.cpu)), 0, 1),
        maxcpu: number(cpuinfo.cpus, number(nodeEntry.maxcpu)),
        mem: number(memory.used, number(nodeEntry.mem)),
        maxmem: number(memory.total, number(nodeEntry.maxmem)),
        disk: number(rootfs.used, number(nodeEntry.disk)),
        maxdisk: number(rootfs.total, number(nodeEntry.maxdisk)),
        level: text(nodeEntry.level),
        sslFingerprint: text(nodeEntry.ssl_fingerprint) || undefined,
        loadavg,
        pveVersion: text(detail.pveversion) || undefined,
        cpuModel: text(cpuinfo.model) || undefined,
        sockets: cpuinfo.sockets === undefined ? undefined : number(cpuinfo.sockets),
        cores: cpuinfo.cores === undefined ? undefined : number(cpuinfo.cores),
        memAvailable: memory.available === undefined ? undefined : number(memory.available),
        ksmShared: object(detail.ksm).shared === undefined ? undefined : number(object(detail.ksm).shared),
        metrics: mapNodeMetrics(array(metricsResult))
      }
    })

    const vms = resources
      .filter((resource) => {
        const type = text(resource.type)
        return (type === 'qemu' || type === 'lxc') && resource.vmid !== undefined
      })
      .map(mapVmSummary)
      .sort((a, b) => a.vmid - b.vmid)

    await this.enrichVmOsForDashboard(vms)

    const storages = resources
      .filter((resource) => text(resource.type) === 'storage')
      .map(mapStorage)
      .sort((a, b) => a.node.localeCompare(b.node) || a.storage.localeCompare(b.storage))

    const tasks: TaskSummary[] = []
    for (const result of nodeResults) {
      tasks.push(...array(result.taskResult).map(object).map(mapTask))
    }
    tasks.sort((a, b) => b.startTime - a.startTime)

    const versionRaw = object(rawVersion)
    const version: PveVersionInfo = {
      version: text(versionRaw.version, 'unknown'),
      release: text(versionRaw.release, ''),
      repoid: text(versionRaw.repoid, '')
    }

    const allowedTags = array(object(rawOptions)['allowed-tags']).map((item) => text(item)).filter(Boolean)
    const cluster: ClusterInfo = {
      name: text(clusterEntry.name, this.profile?.clusterName || 'PVE'),
      quorate: boolean(clusterEntry.quorate),
      nodeCount: number(clusterEntry.nodes, nodes.length),
      version: clusterEntry.version === undefined ? undefined : number(clusterEntry.version),
      ha: mapHa(array(rawHa)),
      keyboard: text(object(rawOptions).keyboard) || undefined,
      allowedTags,
      description: text(object(rawOptions).description) || undefined
    }

    const dashboard: DashboardData = {
      fetchedAt: Date.now(),
      latencyMs: Date.now() - started,
      cluster,
      nodes,
      vms,
      storages,
      tasks: tasks.slice(0, 40),
      version
    }
    this.lastDashboard = dashboard
    this.lastDashboardAt = Date.now()
    return dashboard
  }

  async getLiveMetrics(): Promise<LiveMetricsData> {
    const client = this.requireClient()
    const rawNodes = await client.request<unknown[]>('/nodes')
    const nodes: LiveNodeMetrics[] = array(rawNodes)
      .map(object)
      .map((entry) => {
        const status: LiveNodeMetrics['status'] =
          text(entry.status) === 'online'
            ? 'online'
            : text(entry.status) === 'offline'
              ? 'offline'
              : 'unknown'
        return {
          node: text(entry.node),
          status,
          cpu: clamp(number(entry.cpu), 0, 1),
          maxcpu: number(entry.maxcpu),
          mem: number(entry.mem),
          maxmem: number(entry.maxmem),
          disk: number(entry.disk),
          maxdisk: number(entry.maxdisk),
          uptime: number(entry.uptime)
        }
      })
      .filter((entry) => entry.node)
    return { fetchedAt: Date.now(), nodes }
  }

  async getNodeSettings(nodeInput: string): Promise<NodeSettingsData> {
    const node = validateNode(nodeInput)
    const client = this.requireClient()
    const base = `/nodes/${encodeURIComponent(node)}`
    const settled = await Promise.allSettled([
      client.request<unknown[]>(`${base}/network`),
      client.request<unknown>(`${base}/dns`),
      client.request<unknown>(`${base}/time`),
      client.request<unknown>(`${base}/config`),
      client.request<unknown[]>(`${base}/certificates/info`),
      client.request<unknown>(`${base}/apt/repositories`),
      client.request<unknown>(`${base}/firewall/options`),
      client.request<unknown[]>(`${base}/disks/list`),
      client.request<unknown>(`${base}/disks/lvm`),
      client.request<unknown[]>(`${base}/disks/lvmthin`),
      client.request<unknown[]>(`${base}/disks/directory`),
      client.request<unknown[]>(`${base}/disks/zfs`)
    ])
    const warnings: string[] = []
    const take = <T>(index: number, label: string, fallback: T): T => {
      const result = settled[index]
      if (result.status === 'fulfilled') return result.value as T
      warnings.push(`${label}读取失败`)
      return fallback
    }

    const networkRaw = take<unknown[]>(0, '网络', [])
    const dnsRaw = take<unknown>(1, 'DNS', null)
    const timeRaw = take<unknown>(2, '时间', null)
    const configRaw = take<unknown>(3, '节点配置', null)
    const certificatesRaw = take<unknown[]>(4, '证书', [])
    const repositoriesRaw = take<unknown>(5, '存储库', null)
    const firewallRaw = take<unknown>(6, '防火墙', null)
    const disksRaw = take<unknown[]>(7, '磁盘', [])
    const lvmRaw = take<unknown>(8, 'LVM', null)
    const lvmthinRaw = take<unknown[]>(9, 'LVM-Thin', [])
    const directoryRaw = take<unknown[]>(10, '目录存储', [])
    const zfsRaw = take<unknown[]>(11, 'ZFS', [])

    const dnsSource = dnsRaw && typeof dnsRaw === 'object' ? object(dnsRaw) : {}
    const timeSource = timeRaw && typeof timeRaw === 'object' ? object(timeRaw) : {}
    const configSource = configRaw && typeof configRaw === 'object' ? object(configRaw) : {}
    const firewallSource = firewallRaw && typeof firewallRaw === 'object' ? object(firewallRaw) : {}

    const time: NodeTimeSettings | null = Object.keys(timeSource).length
      ? {
          timezone: timeSource.timezone === null || timeSource.timezone === undefined ? null : text(timeSource.timezone),
          localtime: number(timeSource.localtime),
          time: number(timeSource.time)
        }
      : null

    return {
      node,
      network: array(networkRaw).map(object).map(mapNodeNetworkInterface),
      dns: Object.keys(dnsSource).length
        ? {
            search: optionalText(dnsSource.search),
            dns1: optionalText(dnsSource.dns1),
            dns2: optionalText(dnsSource.dns2),
            dns3: optionalText(dnsSource.dns3)
          }
        : null,
      time,
      config: Object.keys(configSource).length
        ? {
            description: optionalText(configSource.description),
            startall: optionalBoolean(configSource.startall)
          }
        : null,
      certificates: array(certificatesRaw).map(object).map(mapNodeCertificate),
      repositories:
        repositoriesRaw && typeof repositoriesRaw === 'object' ? mapNodeRepositories(object(repositoriesRaw)) : null,
      firewallOptions: Object.keys(firewallSource).length ? { ...firewallSource } : null,
      disks: mapNodeDisks(array(disksRaw)),
      lvm: mapLvmGroups(lvmRaw),
      lvmthin: mapLvmThinPools(lvmthinRaw),
      directories: mapDirectoryStorages(directoryRaw),
      zfs: mapZfsPools(zfsRaw),
      warnings
    }
  }

  async saveNodeNetwork(input: NodeNetworkInput): Promise<NodeNetworkActionResult> {
    const node = validateNode(input.node)
    const client = this.requireClient()
    const form = buildNetworkForm(input)
    const base = `/nodes/${encodeURIComponent(node)}/network`
    if (input.existing) {
      await client.request(`${base}/${encodeURIComponent(form.iface)}`, {
        method: 'PUT',
        form,
        timeoutMs: 20_000
      })
    } else {
      await client.request(base, { method: 'POST', form, timeoutMs: 20_000 })
    }
    return { message: '网络配置已写入待应用队列。' }
  }

  async deleteNodeNetwork(nodeInput: string, ifaceInput: string): Promise<void> {
    const node = validateNode(nodeInput)
    const iface = validateNetworkInterfaceName(ifaceInput)
    const client = this.requireClient()
    await client.request(`/nodes/${encodeURIComponent(node)}/network/${encodeURIComponent(iface)}`, {
      method: 'DELETE',
      timeoutMs: 20_000
    })
  }

  async applyNodeNetwork(nodeInput: string): Promise<NodeNetworkActionResult> {
    const node = validateNode(nodeInput)
    const client = this.requireClient()
    const upid = await client.request<string | null>(`/nodes/${encodeURIComponent(node)}/network`, {
      method: 'PUT',
      timeoutMs: 30_000
    })
    return { message: '网络配置已提交到 PVE 应用任务。', upid: upid ?? undefined }
  }

  async revertNodeNetwork(nodeInput: string): Promise<void> {
    const node = validateNode(nodeInput)
    const client = this.requireClient()
    await client.request(`/nodes/${encodeURIComponent(node)}/network`, {
      method: 'DELETE',
      timeoutMs: 20_000
    })
  }

  async updateNodeDns(nodeInput: string, settings: NodeDnsSettings): Promise<void> {
    const node = validateNode(nodeInput)
    const client = this.requireClient()
    await client.request(`/nodes/${encodeURIComponent(node)}/dns`, {
      method: 'PUT',
      form: {
        search: settings.search?.trim() ?? '',
        dns1: settings.dns1?.trim() ?? '',
        dns2: settings.dns2?.trim() ?? '',
        dns3: settings.dns3?.trim() ?? ''
      },
      timeoutMs: 20_000
    })
  }

  async updateNodeTime(nodeInput: string, timezone: string): Promise<void> {
    const node = validateNode(nodeInput)
    if (!timezone.trim()) throw new PveError('VALIDATION', '时区不能为空。')
    const client = this.requireClient()
    await client.request(`/nodes/${encodeURIComponent(node)}/time`, {
      method: 'PUT',
      form: { timezone: timezone.trim() },
      timeoutMs: 20_000
    })
  }

  async updateNodeOptions(nodeInput: string, description: string): Promise<void> {
    const node = validateNode(nodeInput)
    const client = this.requireClient()
    await client.request(`/nodes/${encodeURIComponent(node)}/config`, {
      method: 'PUT',
      form: { description },
      timeoutMs: 20_000
    })
  }

  async getNodeLogs(nodeInput: string, kind: 'syslog' | 'firewall'): Promise<NodeLogEntry[]> {
    const node = validateNode(nodeInput)
    const client = this.requireClient()
    const endpoint =
      kind === 'syslog'
        ? `/nodes/${encodeURIComponent(node)}/syslog?limit=200`
        : `/nodes/${encodeURIComponent(node)}/firewall/log?limit=200`
    const raw = await client.request<unknown[]>(endpoint, { timeoutMs: 20_000 })
    return array(raw).map((entry) => {
      const line = object(entry)
      return { n: number(line.n), t: text(line.t) }
    })
  }

  private async enrichVmOsForDashboard(vms: VmSummary[]): Promise<void> {
    if (vms.length === 0) return
    const client = this.requireClient()
    const now = Date.now()
    const staleAfter = 30 * 60 * 1000

    const pending = vms.filter((vm) => {
      const cached = this.osCache.get(vm.vmid)
      return !cached || now - cached.configFetchedAt > staleAfter
    })

    if (pending.length > 0) {
      await Promise.allSettled(
        pending.map(async (vm) => {
          try {
            const config = await client.request<Raw>(`${vmBase(vm)}/config`, { timeoutMs: 6_000 })
            this.osCache.set(vm.vmid, {
              os: detectVmOs(vm.type, config, vm.name),
              agentEnabled: agentEnabledFromConfig(config),
              configFetchedAt: Date.now()
            })
          } catch {
            this.osCache.set(vm.vmid, {
              os: detectVmOs(vm.type, { name: vm.name, tags: vm.tags.join(' ') }, vm.name),
              agentEnabled: false,
              configFetchedAt: Date.now() - 25 * 60 * 1000
            })
          }
        })
      )
    }

    const activeIds = new Set(vms.map((vm) => vm.vmid))
    for (const cachedId of this.osCache.keys()) {
      if (!activeIds.has(cachedId)) this.osCache.delete(cachedId)
    }

    for (const vm of vms) {
      const cached = this.osCache.get(vm.vmid)
      if (cached) vm.os = cached.os
    }

    if (this.osEnrichmentRunning) return
    const nowForAgent = Date.now()
    const candidates = vms.filter((vm) => {
      const cached = this.osCache.get(vm.vmid)
      return (
        vm.type === 'qemu' &&
        vm.status === 'running' &&
        cached?.agentEnabled === true &&
        isGenericLinuxOs(cached.os) &&
        (!cached.agentAttemptAt || nowForAgent - cached.agentAttemptAt > staleAfter)
      )
    })
    if (candidates.length === 0) return

    this.osEnrichmentRunning = true
    void this.enrichVmOsFromAgent(candidates).finally(() => {
      this.osEnrichmentRunning = false
    })
  }

  private async enrichVmOsFromAgent(vms: VmSummary[]): Promise<void> {
    let client: PveClient
    try {
      client = this.requireClient()
    } catch {
      return
    }
    const attemptedAt = Date.now()
    for (const vm of vms) {
      const cached = this.osCache.get(vm.vmid)
      if (cached) cached.agentAttemptAt = attemptedAt
    }

    const batchSize = 4
    for (let index = 0; index < vms.length; index += batchSize) {
      const batch = vms.slice(index, index + batchSize)
      await Promise.allSettled(
        batch.map(async (vm) => {
          try {
            const raw = await client.request<Raw>(`${vmBase(vm)}/agent/get-osinfo`, {
              timeoutMs: 2_500
            })
            const os = detectAgentOs(raw)
            if (!os) return
            const cached = this.osCache.get(vm.vmid)
            if (!cached) return
            cached.os = os
            cached.configFetchedAt = Date.now()
          } catch {
            // A missing or unresponsive guest agent is expected for many VMs.
          }
        })
      )
    }
  }

  async getVmDetail(ref: VmRef): Promise<VmDetail> {
    const client = this.requireClient()
    const base = vmBase(ref)
    const node = encodeURIComponent(validateNode(ref.node))
    const [rawStatus, rawConfig, rawSnapshots, rawMetrics, rawTasks] = await Promise.all([
      client.request<Raw>(`${base}/status/current`),
      client.request<Raw>(`${base}/config`),
      client.request<unknown[]>(`${base}/snapshot`).catch(() => []),
      client.request<unknown[]>(`${base}/rrddata?timeframe=hour&cf=AVERAGE`).catch(() => []),
      client
        .request<unknown[]>(`/nodes/${node}/tasks?vmid=${validateVmid(ref.vmid)}&limit=12`)
        .catch(() => [])
    ])

    const status = object(rawStatus)
    const config = object(rawConfig)
    const runtime = mapRuntime(status, config)

    let agentInterfaces: AgentInterface[] = []
    let agentError: string | undefined
    if (ref.type === 'qemu') {
      if (!runtime.agentEnabled) {
        agentError = 'Guest Agent 未启用'
      } else if (runtime.status !== 'running') {
        agentError = '虚拟机未运行'
      } else {
        try {
          const rawAgent = await client.request<unknown>(`${base}/agent/network-get-interfaces`, {
            timeoutMs: 4500
          })
          agentInterfaces = mapAgent(rawAgent)
        } catch (error) {
          agentError = error instanceof Error ? error.message : 'Guest Agent 无响应'
        }
      }
    }

    const name = text(config.name, text(status.name, `${ref.type === 'qemu' ? 'VM' : 'CT'} ${ref.vmid}`))
    return {
      ref: { node: validateNode(ref.node), type: ref.type, vmid: validateVmid(ref.vmid) },
      name,
      os: detectVmOs(ref.type, config, name),
      runtime,
      config: sanitizeConfig(config),
      snapshots: mapSnapshots(array(rawSnapshots)),
      tasks: array(rawTasks).map(object).map(mapTask).slice(0, 12),
      metrics: mapVmMetrics(array(rawMetrics)),
      agentInterfaces,
      agentError
    }
  }

  async vmAction(ref: VmRef & { action: VmAction }): Promise<ActionResult> {
    const client = this.requireClient()
    const action = ref.action
    const allowed: VmAction[] = ['start', 'shutdown', 'stop', 'reboot', 'reset', 'suspend', 'resume']
    if (!allowed.includes(action)) {
      throw new PveError('VALIDATION', '不支持的电源操作。')
    }
    if (ref.type === 'lxc' && action === 'reset') {
      throw new PveError('VALIDATION', 'LXC 容器不支持重置操作。')
    }
    const upid = await client.request<string>(`${vmBase(ref)}/status/${action}`, {
      method: 'POST',
      timeoutMs: 30_000
    })
    return { upid: upid || undefined, message: '操作已下发到 PVE。' }
  }

  async getCreateOptions(nodeInput: string): Promise<CreateOptions> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    const [rawNodes, rawStorages, rawBridges, rawTemplates, rawNextId] = await Promise.all([
      client.request<unknown[]>('/nodes'),
      client.request<unknown[]>(`/nodes/${encodeURIComponent(node)}/storage`),
      client.request<unknown[]>(`/nodes/${encodeURIComponent(node)}/network`),
      client.request<unknown[]>('/cluster/resources?type=vm'),
      client.request<unknown>('/cluster/nextid').catch(() => null)
    ])

    const nodes: NodeOption[] = array(rawNodes).map(object).map((entry) => ({
      node: text(entry.node),
      status: text(entry.status),
      maxcpu: number(entry.maxcpu),
      maxmem: number(entry.maxmem)
    }))
    const onlineNode = nodes.find((entry) => entry.node === node)
    if (!onlineNode) {
      throw new PveError('VALIDATION', `节点 ${node} 不存在或当前不可用。`)
    }

    const storageEntries = array(rawStorages).map(object)
    const storages: DiskStorageOption[] = storageEntries
      .map((entry) => {
        const content = text(entry.content)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
        return {
          storage: text(entry.storage),
          type: text(entry.type, 'dir'),
          avail: number(entry.avail),
          total: number(entry.total),
          active: boolean(entry.active),
          enabled: boolean(entry.enabled),
          content
        }
      })
      .filter((entry) => entry.storage && entry.active && entry.enabled && entry.content.includes('images'))
      .sort((a, b) => a.storage.localeCompare(b.storage))

    const isoStorages = storageEntries.filter((entry) =>
      text(entry.content)
        .split(',')
        .map((item) => item.trim())
        .includes('iso')
    )
    const isoResults = await Promise.all(
      isoStorages.map(async (entry) => {
        const storage = text(entry.storage)
        try {
          const content = await client.request<unknown[]>(
            `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content`
          )
          return array(content)
            .map(object)
            .filter((item) => text(item.content) === 'iso' || text(item.volid).includes(':iso/'))
            .map<IsoOption>((item) => ({
              volid: text(item.volid),
              label: text(item.volid).split('/').pop() || text(item.volid),
              storage,
              size: number(item.size),
              format: text(item.format) || undefined
            }))
        } catch {
          return []
        }
      })
    )
    const isos = isoResults
      .flat()
      .filter((item) => item.volid)
      .sort((a, b) => a.label.localeCompare(b.label))

    const bridges: BridgeOption[] = array(rawBridges)
      .map(object)
      .filter((entry) => text(entry.type) === 'bridge' && boolean(entry.active))
      .map((entry) => ({
        iface: text(entry.iface),
        active: boolean(entry.active),
        comment: text(entry.comments).trim() || undefined
      }))
      .sort((a, b) => a.iface.localeCompare(b.iface))

    const templates: TemplateOption[] = array(rawTemplates)
      .map(object)
      .filter((entry) => boolean(entry.template) && text(entry.type) === 'qemu')
      .map((entry) => ({
        vmid: number(entry.vmid),
        name: text(entry.name) || `Template ${number(entry.vmid)}`,
        node: text(entry.node),
        ostype: text(entry.ostype) || undefined,
        tags: tagList(entry.tags)
      }))
      .sort((a, b) => a.vmid - b.vmid)

    const maxId = array(rawTemplates)
      .map(object)
      .reduce((max, entry) => Math.max(max, number(entry.vmid)), 99)
    const nextId = rawNextId === null ? maxId + 1 : number(rawNextId, maxId + 1)
    return { node, nextId, storages, isos, bridges, templates, nodes }
  }

  async createVm(input: CreateVmInput): Promise<MutationResult> {
    const client = this.requireClient()
    const { form } = buildVmForm(input)
    const node = validateNode(input.node)
    const upid = await client.request<string>(`/nodes/${encodeURIComponent(node)}/qemu`, {
      method: 'POST',
      form,
      timeoutMs: 30_000
    })
    const warnings: string[] = []
    let taskExit = 'OK'
    if (upid) {
      taskExit = await this.waitForTask(node, upid, 180_000)
      if (taskExit && !taskExit.startsWith('OK') && !taskExit.startsWith('WARNINGS')) {
        throw new PveError('TASK_FAILED', '创建虚拟机任务失败。', { detail: taskExit })
      }
      if (taskExit.startsWith('WARNINGS')) warnings.push(taskExit)
    }

    let started = false
    if (input.start) {
      try {
        const startUpid = await client.request<string>(
          `/nodes/${encodeURIComponent(node)}/qemu/${validateVmid(input.vmid)}/status/start`,
          { method: 'POST', timeoutMs: 30_000 }
        )
        if (startUpid) {
          const startExit = await this.waitForTask(node, startUpid, 90_000)
          if (startExit && !startExit.startsWith('OK') && !startExit.startsWith('WARNINGS')) {
            warnings.push(`虚拟机已创建，但启动任务返回：${startExit}`)
          } else {
            started = true
          }
        } else {
          started = true
        }
      } catch (error) {
        warnings.push(`虚拟机已创建，但启动失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return {
      vmid: input.vmid,
      node,
      task: upid || undefined,
      started,
      warnings,
      message: input.start
        ? started
          ? `虚拟机 ${input.vmid} 已创建并启动。`
          : `虚拟机 ${input.vmid} 已创建，但尚未启动。`
        : `虚拟机 ${input.vmid} 已创建。`
    }
  }

  async cloneVm(input: CloneVmInput): Promise<MutationResult> {
    const client = this.requireClient()
    const node = validateNode(input.node)
    const templateVmid = validateVmid(input.templateVmid)
    validateVmid(input.vmid)
    const name = input.name.trim()
    if (!name || name.length > 64 || /[\\/\u0000-\u001f]/.test(name)) {
      throw new PveError('VALIDATION', '虚拟机名称长度须为 1-64 个字符，且不能包含斜杠或控制字符。')
    }
    const form: Record<string, string | number> = {
      newid: input.vmid,
      name,
      full: input.full ? 1 : 0
    }
    if (input.full && input.storage) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.storage)) {
        throw new PveError('VALIDATION', '目标存储名称无效。')
      }
      form.target = input.storage
    }

    const upid = await client.request<string>(
      `/nodes/${encodeURIComponent(node)}/qemu/${templateVmid}/clone`,
      { method: 'POST', form, timeoutMs: 30_000 }
    )
    const warnings: string[] = []
    if (upid) {
      const exit = await this.waitForTask(node, upid, 240_000)
      if (exit && !exit.startsWith('OK') && !exit.startsWith('WARNINGS')) {
        throw new PveError('TASK_FAILED', '克隆虚拟机任务失败。', { detail: exit })
      }
      if (exit.startsWith('WARNINGS')) warnings.push(exit)
    }

    let started = false
    if (input.start) {
      try {
        const startUpid = await client.request<string>(
          `/nodes/${encodeURIComponent(node)}/qemu/${input.vmid}/status/start`,
          { method: 'POST', timeoutMs: 30_000 }
        )
        if (startUpid) {
          const exit = await this.waitForTask(node, startUpid, 90_000)
          if (exit && !exit.startsWith('OK') && !exit.startsWith('WARNINGS')) {
            warnings.push(`虚拟机已克隆，但启动任务返回：${exit}`)
          } else {
            started = true
          }
        } else {
          started = true
        }
      } catch (error) {
        warnings.push(`虚拟机已克隆，但启动失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return {
      vmid: input.vmid,
      node,
      task: upid || undefined,
      started,
      warnings,
      message: input.start
        ? started
          ? `虚拟机 ${input.vmid} 已从模板克隆并启动。`
          : `虚拟机 ${input.vmid} 已克隆，但尚未启动。`
        : `虚拟机 ${input.vmid} 已克隆。`
    }
  }

  async taskStatus(node: string, upid: string): Promise<TaskStatusResult> {
    const client = this.requireClient()
    validateNode(node)
    validateUpid(upid)
    const raw = await client.getTaskStatus(node, upid)
    return {
      upid,
      status: mapTaskStatus(raw),
      exitStatus: raw.exitstatus
    }
  }

  async taskLog(node: string, upid: string): Promise<TaskLogLine[]> {
    const client = this.requireClient()
    const lines = await client.getTaskLog(node, upid)
    return lines
      .map((line) => ({ n: number(line.n), t: text(line.t) }))
      .filter((line) => line.t)
  }

  async vmLogs(node: string, upid: string): Promise<TaskLogLine[]> {
    return this.taskLog(node, upid)
  }

  async openConsole(input: ConsoleOpenRequest): Promise<ConsoleSessionInfo> {
    const client = this.requireClient()
    const node = validateNode(input.node)

    if (input.kind === 'node') {
      const term = await client.request<{ port: number | string; ticket: string; user?: string }>(
        `/nodes/${encodeURIComponent(node)}/termproxy`,
        { method: 'POST', timeoutMs: 20_000 }
      )
      if (!term?.ticket || term.port === undefined) {
        throw new PveError('CONSOLE_ERROR', 'PVE 没有返回节点终端凭据。')
      }
      const upstream: ConsoleUpstream = {
        url: pveConsoleUrl(client.serverUrl, `/nodes/${encodeURIComponent(node)}/vncwebsocket`, term.port, term.ticket),
        headers: {
          Cookie: client.authCookieHeader,
          'User-Agent': 'PVE-VDI/1.1'
        },
        agent: client.tlsAgent,
        rejectUnauthorized: !client.allowSelfSigned,
        initialPayload: `${term.user || client.username}:${term.ticket}\n`
      }
      return this.consoleHost.createSession(
        {
          kind: 'node',
          mode: 'xterm',
          title: `节点 ${node}`,
          subtitle: `${node} · node shell · xterm.js`,
          node,
          username: term.user || client.username
        },
        upstream
      )
    }

    const type = validateVmType(input.type ?? 'qemu')
    const vmid = validateVmid(input.vmid ?? 0)
    const vmName = input.name?.trim() || `${type === 'qemu' ? 'QEMU' : 'LXC'} ${vmid}`
    const vmPath = `/nodes/${encodeURIComponent(node)}/${type}/${vmid}`

    if (type === 'qemu') {
      const proxy = await client.request<{
        port: number | string
        ticket: string
        user: string
        cert?: string
      }>(`${vmPath}/vncproxy`, {
        method: 'POST',
        form: { websocket: 1 },
        timeoutMs: 25_000
      })
      if (!proxy?.ticket || proxy.port === undefined) {
        throw new PveError('CONSOLE_ERROR', 'PVE 没有返回 VNC 控制台凭据。')
      }
      const upstream: ConsoleUpstream = {
        url: pveConsoleUrl(
          client.serverUrl,
          `${vmPath}/vncwebsocket`,
          proxy.port,
          proxy.ticket
        ),
        headers: {
          Cookie: client.authCookieHeader,
          'User-Agent': 'PVE-VDI/1.1'
        },
        agent: client.tlsAgent,
        rejectUnauthorized: !client.allowSelfSigned
      }
      return this.consoleHost.createSession(
        {
          kind: 'vm',
          mode: 'novnc',
          title: vmName,
          subtitle: `${node} · QEMU ${vmid} · noVNC`,
          node,
          type,
          vmid,
          vncPassword: proxy.ticket,
          username: proxy.user || client.username
        },
        upstream
      )
    }

    const term = await client.request<{ port: number | string; ticket: string; user?: string; cert?: string }>(
      `${vmPath}/termproxy`,
      { method: 'POST', timeoutMs: 20_000 }
    )
    if (!term?.ticket || term.port === undefined) {
      throw new PveError('CONSOLE_ERROR', 'PVE 没有返回容器终端凭据。')
    }
    const upstream: ConsoleUpstream = {
      url: pveConsoleUrl(client.serverUrl, `${vmPath}/vncwebsocket`, term.port, term.ticket),
      headers: {
        Cookie: client.authCookieHeader,
        'User-Agent': 'PVE-VDI/1.1'
      },
      agent: client.tlsAgent,
      rejectUnauthorized: !client.allowSelfSigned,
      initialPayload: `${term.user || client.username}:${term.ticket}\n`
    }
    return this.consoleHost.createSession(
      {
        kind: 'vm',
        mode: 'xterm',
        title: vmName,
        subtitle: `${node} · LXC ${vmid} · xterm.js`,
        node,
        type,
        vmid,
        username: term.user || client.username
      },
      upstream
    )
  }

  closeConsole(sessionId: string): void {
    if (!sessionId) return
    this.consoleHost.closeSession(sessionId)
  }

  private async waitForTask(node: string, upid: string, timeoutMs: number): Promise<string> {
    const client = this.requireClient()
    const started = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 500))
    let transientFailures = 0
    while (Date.now() - started < timeoutMs) {
      try {
        const status = await client.getTaskStatus(node, upid)
        if (status.status && TERMINAL_TASK_STATES.has(status.status)) {
          return status.exitstatus ?? 'OK'
        }
      } catch (error) {
        if (error instanceof PveError && error.code === 'NOT_FOUND') {
          transientFailures += 1
          if (transientFailures > 8) throw error
        } else {
          throw error
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    throw new PveError('TASK_TIMEOUT', '等待 PVE 任务完成超时。', {
      detail: `任务仍在后台运行：${upid}`
    })
  }

  validateRefreshInterval(seconds: number): number {
    if (!Number.isFinite(seconds)) return 8
    return Math.round(clamp(seconds, MIN_REFRESH_INTERVAL, MAX_REFRESH_INTERVAL))
  }

  get lastDashboardTimestamp(): number {
    return this.lastDashboardAt
  }
}

export { validateNode, validateVmType }
