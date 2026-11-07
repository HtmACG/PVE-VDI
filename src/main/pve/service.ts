import fs from 'node:fs'
import path from 'node:path'
import type { Agent } from 'node:https'
import { firstReachable } from './probe'
import {
  GUEST_TYPES,
  MAX_REFRESH_INTERVAL,
  MIN_REFRESH_INTERVAL
} from '@shared/ipc'
import type {
  AccessAclInput,
  AccessGroupInput,
  AccessOverviewData,
  AccessTokenCreated,
  AccessTokenInput,
  AccessUserInput,
  ActionResult,
  AgentInterface,
  AptPackageUpdate,
  AptRepository,
  AptUpdateResult,
  BackupFile,
  BackupJob,
  BackupJobInput,
  BackupOverviewData,
  BridgeOption,
  CloneVmInput,
  CloudInitInput,
  ClusterInfo,
  ConsoleOpenRequest,
  ConsoleSessionInfo,
  CreateOptions,
  CreateVmInput,
  DashboardData,
  DiskStorageOption,
  FirewallAliasInput,
  FirewallGroupSummary,
  FirewallOptions,
  FirewallOptionsInput,
  FirewallOverviewData,
  FirewallRule,
  FirewallRuleInput,
  FirewallScope,
  HaGroup,
  HaGroupInput,
  HaOverviewData,
  HaResource,
  HaResourceInput,
  HaStatus,
  IsoImageInfo,
  IsoImageList,
  IsoMutationResult,
  IsoOption,
  IsoStorageInfo,
  IsoUploadInput,
  IsoUrlInput,
  LiveMetricsData,
  LiveNodeMetrics,
  MutationResult,
  NodeMetricPoint,
  NodeCertificateData,
  NodeCertificateInfo,
  NodeCertificateUpload,
  NodeDirectoryStorage,
  NodeDiskInfo,
  NodeDnsSettings,
  NodeHardwareInfo,
  NodeLogEntry,
  NodeLvmGroup,
  NodeLvmThinPool,
  ClusterJoinInfo,
  ClusterJoinInput,
  ClusterMember,
  DiskInitInput,
  NodeNetworkActionResult,
  NodeNetworkInput,
  NodeNetworkInterface,
  NodeAptAction,
  NodeAptData,
  NodeOption,
  NodeRepositorySummary,
  NodeSettingsData,
  NodeSummary,
  NodeTimeSettings,
  NodeZfsPool,
  PoolInput,
  PoolMemberInput,
  PveAclEntry,
  PveGroup,
  PvePoolSummary,
  PveRole,
  PveUser,
  PveUserToken,
  PveVersionInfo,
  MigrateInput,
  RestoreBackupInput,
  SessionProfile,
  SdnOverviewData,
  SdnSubnet,
  SdnSubnetInput,
  SdnVnet,
  SdnVnetInput,
  SdnZone,
  SdnZoneInput,
  SnapshotInput,
  SnapshotMutationResult,
  StartBackupInput,
  StorageContentData,
  StorageContentEntry,
  StorageDefinition,
  StorageDefinitionInput,
  StorageOverviewData,
  StorageSummary,
  SubscriptionInfo,
  TaskListData,
  TaskListQuery,
  TaskLogLine,
  TaskStatusResult,
  TaskSummary,
  TemplateInput,
  TemplateOption,
  VmAction,
  VmConfigPatchInput,
  VmDetail,
  VmDiskAddInput,
  VmDiskInfo,
  VmDiskRemoveInput,
  VmDiskResizeInput,
  VmMetricPoint,
  VmMutationResult,
  VmOsInfo,
  VmRef,
  VmRuntime,
  VmSendKeyInput,
  VmSnapshot,
  VmSummary,
  VmConsoleInfo,
  VmType
} from '@shared/types'

import { PveClient, PveError, normalizeServerUrl, validateUpid } from './client'
import { probeNodeHardware } from './node-hardware'
import { ConsoleHost, type ConsoleUpstream } from '../console-host'
import { agentEnabledFromConfig, detectAgentOs, detectVmOs, isGenericLinuxOs } from './os'
import { deriveConsoleCapability } from './console-info'

/** 客户机地址探测结果的有效期：太短会反复敲 22 端口，太长又跟不上 IP 变化 */
const GUEST_HOST_TTL_MS = 5 * 60 * 1000
/** 探测失败（没开 SSH / 没有 Agent）时的重试间隔，短一些便于装完 SSH 后尽快可用 */
const GUEST_RETRY_TTL_MS = 2 * 60 * 1000
/** 探客户机 SSH 只需要这几个字段，不绑死整个 VmSummary */
type VmSummaryRef = { node: string; vmid: number; type: VmType }

/** 同时在跑的客户机 SSH 探活上限 */
const GUEST_PROBE_CONCURRENCY = 4

type Raw = Record<string, unknown>

interface LoginInput {
  serverUrl: string
  username: string
  password: string
  rememberPassword: boolean
  allowSelfSigned: boolean
}

const TERMINAL_TASK_STATES = new Set(['stopped'])

const QEMU_CONFIG_KEYS = new Set([
  'cores',
  'sockets',
  'memory',
  'balloon',
  'cpu',
  'machine',
  'bios',
  'boot',
  'agent',
  'onboot',
  'numa',
  'vga',
  'keyboard',
  'description',
  'protection',
  'tags'
])

const LXC_CONFIG_KEYS = new Set([
  'cores',
  'memory',
  'swap',
  'hostname',
  'description',
  'onboot',
  'protection',
  'tags'
])

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

function pveConsoleUrl(
  serverUrl: string,
  path: string,
  port: number | string,
  ticket: string,
  extra?: Record<string, string>
): string {
  const url = new URL(serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/api2/json${path}`
  url.search = ''
  url.searchParams.set('port', String(port))
  url.searchParams.set('vncticket', ticket)
  // ttyd 走 vncwebsocket 时还要求 vncticket 走查询参数（PVE 7.4 起）
  if (extra) {
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value)
  }
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

function mapAptRepository(raw: unknown, path: string, index: number): AptRepository {
  const repo = object(raw)
  const split = (value: unknown): string[] =>
    text(value)
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  return {
    path,
    fileType: text(repo.fileType) || text(repo.filetype) || 'list',
    index: repo.index === undefined ? index : number(repo.index),
    enabled: boolean(repo.enabled),
    components: split(repo.components),
    uris: split(repo.uris),
    suites: split(repo.suites),
    types: split(repo.types),
    comment: text(repo.comment) || undefined,
    warning: text(repo.warning) || undefined
  }
}

/** SDN 的列表端点会把字符串按空白或逗号拆成数组，这里统一归一化。 */
function sdnList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  const list = Array.isArray(value)
    ? value.map((item) => text(item).trim())
    : text(value)
        .split(/[\s,;]+/)
        .map((item) => item.trim())
  const filtered = list.filter(Boolean)
  return filtered.length > 0 ? filtered : undefined
}

function mapSdnZone(raw: unknown): SdnZone {
  const item = object(raw)
  const type = text(item.type, 'simple') as SdnZone['type']
  return {
    zone: text(item.zone),
    type,
    bridge: optionalText(item.bridge) || undefined,
    mtu: optionalNumber(item.mtu),
    nodes: sdnList(item.nodes),
    vlan: optionalNumber(item.vlan),
    vlanProtocol: optionalText(item['vlan-protocol']) || undefined,
    vxlanId: optionalNumber(item['vxlan-id']),
    peers: sdnList(item.peers),
    controller: optionalText(item.controller) || undefined,
    vrfVxlan: optionalNumber(item['vrf-vxlan']),
    asn: optionalNumber(item.asn),
    exitNodes: sdnList(item['exit-nodes']),
    exitNodesLocalRouting: optionalBoolean(item['exitnodes-local-routing']),
    ipam: optionalText(item.ipam) || undefined,
    dns: optionalText(item.dns) || undefined,
    dnsZone: optionalText(item['dnszone']) || undefined,
    reversedns: optionalText(item.reversedns) || undefined,
    dhcp: optionalText(item.dhcp) || undefined,
    pending: optionalBoolean(item.pending),
    state: optionalText(item.state) || undefined,
    raw: item
  }
}

function mapSdnVnet(raw: unknown): SdnVnet {
  const item = object(raw)
  return {
    vnet: text(item.vnet),
    zone: text(item.zone),
    alias: optionalText(item.alias) || undefined,
    tag: optionalNumber(item.tag),
    vlanaware: optionalBoolean(item.vlanaware),
    pending: optionalBoolean(item.pending),
    state: optionalText(item.state) || undefined,
    raw: item
  }
}

function mapSdnSubnet(raw: unknown): SdnSubnet {
  const item = object(raw)
  return {
    subnet: text(item.subnet),
    zone: text(item.zone),
    vnet: text(item.vnet),
    gateway: optionalText(item.gateway) || undefined,
    dnsZonePrefix: optionalText(item['dnszoneprefix']) || undefined,
    snat: optionalBoolean(item.snat),
    dhcpRange: {
      start: text(object(item['dhcp-range']).start) || undefined,
      end: text(object(item['dhcp-range']).end) || undefined
    },
    dnsServers: sdnList(item.dns) ?? undefined,
    pending: optionalBoolean(item.pending),
    state: optionalText(item.state) || undefined,
    raw: item
  }
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

/**
 * 统计 PVE 账号数。
 *
 * `/access/users` 不带 `full=1` 时只返回 userid 等基础字段，代价很小。
 * 同一 userid 理论上不会重复，这里仍做一次去重——集群里有复制过来的脏数据时也稳。
 * 接口被权限拦住时返回 undefined，前端显示「—」而不是假装是 0。
 */
function countUniqueUsers(raw: unknown): number | undefined {
  const entries = array(raw)
  if (entries.length === 0) return undefined
  const ids = new Set<string>()
  for (const entry of entries) {
    const userid = text(object(entry).userid)
    if (userid) ids.add(userid)
  }
  return ids.size > 0 ? ids.size : undefined
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
    template: boolean(raw.template) || boolean(config.template),
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
      rpm: typeof disk.rpm === 'number' || typeof disk.rpm === 'string' ? disk.rpm : undefined,
      temperature: optionalNumber(disk.temperature),
      temperatureMax: optionalNumber(disk.temperature_max),
      temperatureCritical: optionalNumber(disk.temperature_critical)
    }
  })
}

function smartNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(parsed) || parsed < -40 || parsed > 200) return undefined
  return Math.round(parsed * 10) / 10
}

function smartTemperature(raw: Raw): Pick<NodeDiskInfo, 'temperature' | 'temperatureMax' | 'temperatureCritical'> {
  const attributes = array(raw.attributes).map(object)
  for (const attribute of attributes) {
    const id = number(attribute.id)
    const name = text(attribute.name)
    if (id !== 194 && id !== 190 && !/temperature/i.test(name)) continue
    const rawValue = text(attribute.raw)
    const valueMatch = /(-?\d+(?:\.\d+)?)/.exec(rawValue)
    const value = valueMatch ? smartNumber(valueMatch[1]) : undefined
    if (value === undefined) continue
    const range = /Min\/Max\s+(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/i.exec(rawValue)
    return {
      temperature: value,
      temperatureMax: range ? smartNumber(range[2]) : smartNumber(attribute.threshold)
    }
  }

  const smartText = text(raw.text)
  if (!smartText) return {}
  const patterns = [
    /(?:^|\n)\s*(?:Composite\s+)?Temperature(?:\s+Sensor\s+\d+)?:\s*(-?\d+(?:\.\d+)?)/i,
    /Current Drive Temperature:\s*(-?\d+(?:\.\d+)?)/i,
    /Drive Temperature:\s*(-?\d+(?:\.\d+)?)/i
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(smartText)
    if (!match) continue
    const value = smartNumber(match[1])
    if (value !== undefined) return { temperature: value }
  }
  return {}
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

async function attachDiskTemperatures(
  client: PveClient,
  node: string,
  disks: NodeDiskInfo[]
): Promise<{ disks: NodeDiskInfo[]; warnings: string[] }> {
  const warnings: string[] = []
  const enriched = await mapWithConcurrency(disks.slice(0, 24), 4, async (disk) => {
    if (!/^\/dev\/[A-Za-z0-9/]+$/.test(disk.devpath)) return disk
    try {
      const smart = await client.request<Raw>(`/nodes/${encodeURIComponent(node)}/disks/smart`, {
        params: { disk: disk.devpath },
        timeoutMs: 9_000
      })
      const temperature = smartTemperature(object(smart))
      return { ...disk, ...temperature }
    } catch {
      warnings.push(`${disk.devpath} 温度读取失败`)
      return disk
    }
  })
  return { disks: enriched, warnings }
}

function validateNetworkInterfaceName(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) {
    throw new PveError('VALIDATION', '网络接口名称格式无效。')
  }
  return value
}

function validateStorageName(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) {
    throw new PveError('VALIDATION', '存储名称格式无效。')
  }
  return value
}

function validateIsoVolume(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*:iso\/[^\\/\r\n\u0000-\u001f]+$/.test(value)) {
    throw new PveError('VALIDATION', 'ISO 卷标识格式无效。')
  }
  return value
}

/**
 * 接受任意存储卷标识（`local-lvm:vm-204-disk-0`、`nas:backup/vzdump-qemu-204-...vma.zst` 等）。
 * 卷名允许包含点、下划线、短横线与字母数字，禁止路径穿越与控制字符。
 */
function validateStorageVolume(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*:(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)*[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) {
    throw new PveError('VALIDATION', '存储卷标识格式无效。')
  }
  if (value.includes('..')) {
    throw new PveError('VALIDATION', '存储卷标识不合法。')
  }
  return value
}

function parseDiskEntry(value: string | number): {
  volume: string
  storage?: string
  isCdrom: boolean
  options: string[]
} {
  const tokens = String(value)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
  const volume = tokens.shift() ?? ''
  const isCdrom = tokens.some((token) => /^media=cdrom$/i.test(token))
  const storage = volume.includes(':') ? volume.slice(0, volume.indexOf(':')) : undefined
  return { volume, storage, isCdrom, options: tokens }
}

function nextDiskKey(config: Raw, bus: 'scsi' | 'virtio' | 'sata'): string {
  const max = bus === 'sata' ? 5 : bus === 'virtio' ? 15 : 30
  for (let index = 0; index <= max; index += 1) {
    const key = `${bus}${index}`
    if (config[key] === undefined) return key
  }
  throw new PveError('VALIDATION', `${bus.toUpperCase()} 总线没有空闲位置。`)
}

function validateDiskKey(type: VmType, value: string): string {
  const allowed =
    type === 'qemu' ? /^(scsi|virtio|sata|ide)\d+$/ : /^(rootfs|mp\d+)$/
  if (!allowed.test(value)) throw new PveError('VALIDATION', '磁盘标识无效。')
  return value
}

function validateVmConfigPatch(
  type: VmType,
  patch: Record<string, string | number>
): Record<string, string | number> {
  const allowed = type === 'qemu' ? QEMU_CONFIG_KEYS : LXC_CONFIG_KEYS
  const form: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) {
      throw new PveError('VALIDATION', `不支持的虚拟机配置项：${key}`)
    }
    if (key === 'cores') {
      const parsed = number(value, 0)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 128) {
        throw new PveError('VALIDATION', 'CPU 核心数必须在 1-128 之间。')
      }
      form[key] = parsed
    } else if (key === 'sockets') {
      const parsed = number(value, 0)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 8) {
        throw new PveError('VALIDATION', 'CPU 插槽数必须在 1-8 之间。')
      }
      form[key] = parsed
    } else if (key === 'memory' || key === 'balloon' || key === 'swap') {
      const parsed = number(value, -1)
      const min = key === 'balloon' || key === 'swap' ? 0 : 16
      if (!Number.isInteger(parsed) || parsed < min || parsed > 1_048_576) {
        throw new PveError('VALIDATION', '内存配置值无效。')
      }
      form[key] = parsed
    } else if (key === 'agent' || key === 'onboot' || key === 'numa' || key === 'protection') {
      const truthy = value === 1 || value === '1'
      const falsy = value === 0 || value === '0'
      if (!truthy && !falsy) throw new PveError('VALIDATION', `配置项 ${key} 必须是布尔值。`)
      form[key] = truthy ? 1 : 0
    } else if (key === 'bios') {
      const textValue = text(value)
      if (textValue !== 'seabios' && textValue !== 'ovmf') {
        throw new PveError('VALIDATION', '固件类型无效。')
      }
      form[key] = textValue
    } else {
      const textValue = text(value)
      const limit = key === 'description' ? 4096 : 256
      if (textValue.length > limit) throw new PveError('VALIDATION', `配置项 ${key} 过长。`)
      form[key] = textValue
    }
  }
  return form
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

/**
 * 虚拟机终端凭据换发的结果。
 *
 * `termproxy` 后端带回 wsUrl / ticket / user，由 VmSessionManager 自己连；
 * `serial` 后端不需要任何 ticket，靠节点 SSH 跑 `qm terminal`。
 */
export interface VmTerminalEndpoint {
  backend: 'termproxy' | 'serial'
  wsUrl?: string
  ticket?: string
  user?: string
  node: string
  type: 'qemu' | 'lxc'
  vmid: number
  name?: string
}

export class PveManager {
  private client: PveClient | null = null
  private profile: SessionProfile | null = null
  private lastDashboard: DashboardData | null = null
  private lastDashboardAt = 0
  private readonly hardwareCache = new Map<string, { data: NodeHardwareInfo; at: number }>()
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

  /**
   * 控制台能力缓存。探测要读 VM config（判断有没有 serial0、vga 类型），
   * 属于低频信息，缓存 5 分钟；配置被改动时由 vmConfigUpdate 主动失效。
   */
  private readonly consoleCache = new Map<number, VmConsoleInfo>()
  /** 上次探测控制台时的运行状态：状态变化要立刻重探，不能等缓存过期 */
  private readonly consoleStatus = new Map<number, string>()
  /** 虚拟机 → 探测到的可连 sshd 地址；host 为 null 表示探过但连不上 */
  private readonly guestHostCache = new Map<
    number,
    { host: string | null; probedAt: number; noAgent?: boolean }
  >()
  private guestProbes = 0
  /** 正在后台探测的虚拟机，避免同一轮刷新重复排队 */
  private readonly guestProbing = new Set<number>()
  /** 登录会话代次：异步探测回来时据此丢弃上一个集群的结果 */
  private sessionEpoch = 0

  /**
   * 按核负载采样钩子。PVE 的 rrddata 只给聚合 cpu，拿不到每线程数据，
   * 所以由外部（SSH 模块）注入一个采样函数；注入前 cpuCores 保持 undefined，
   * 前端会退回「只显示线程数、不给颜色」的占位形态。
   */
  private coreSampler: (() => Promise<number[] | undefined>) | null = null
  private coreSampleCache: { at: number; loads: number[] | undefined } | null = null
  private coreSampleRunning = false

  setCoreSampler(sampler: (() => Promise<number[] | undefined>) | null): void {
    this.coreSampler = sampler
    this.coreSampleCache = null
  }

  /** 取按核负载，带 1.5 秒缓存，避免刷新间隔小于采样耗时导致堆叠 */
  private async sampleCores(): Promise<number[] | undefined> {
    if (!this.coreSampler) return undefined
    const now = Date.now()
    if (this.coreSampleCache && now - this.coreSampleCache.at < 1500) {
      return this.coreSampleCache.loads
    }
    if (this.coreSampleRunning) return this.coreSampleCache?.loads
    this.coreSampleRunning = true
    try {
      const loads = await this.coreSampler()
      this.coreSampleCache = { at: Date.now(), loads }
      return loads
    } catch {
      return this.coreSampleCache?.loads
    } finally {
      this.coreSampleRunning = false
    }
  }

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
      this.hardwareCache.clear()
      this.osCache.clear()
      this.consoleCache.clear()
      this.consoleStatus.clear()
      this.guestHostCache.clear()
      this.sessionEpoch += 1
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
    this.hardwareCache.clear()
    this.osCache.clear()
    this.consoleCache.clear()
    this.consoleStatus.clear()
    this.guestHostCache.clear()
    this.sessionEpoch += 1
  }

  getCachedDashboard(): DashboardData | null {
    return this.lastDashboard
  }

  /**
   * termproxy WebSocket 的 TLS 参数。
   *
   * 之前主进程用全局 WebSocket 连 wss://，没有把 API 客户端的 https.Agent 带过去，
   * PVE 默认自签名证书时握手必然失败（界面上就是「PVE 隧道握手失败」）。
   * 这里把 agent、是否校验证书、登录 Cookie 一起交给 vm-session。
   */
  consoleTlsOptions(): { rejectUnauthorized: boolean; agent: Agent; cookie: string } {
    const client = this.requireClient()
    return {
      rejectUnauthorized: !client.allowSelfSigned,
      agent: client.tlsAgent,
      cookie: client.authCookieHeader
    }
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

    const [rawClusterStatus, rawResources, rawNodes, rawVersion, rawHa, rawOptions, rawUsers] = await Promise.all([
      client.request<unknown[]>('/cluster/status'),
      client.request<unknown[]>('/cluster/resources'),
      client.request<unknown[]>('/nodes'),
      client.request<Raw>('/version').catch(() => ({})),
      client.request<unknown[]>('/cluster/ha/status/current').catch(() => []),
      client.request<Raw>('/cluster/options').catch(() => ({})),
      // 用户总数：不带 full=1，只取 userid，代价很小；权限不足时按未知处理
      client.request<unknown[]>('/access/users').catch(() => [])
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

    // 按核负载只有一份（SSH 连的是「当前 PVE 节点」），取一次给所有节点用
    const coreLoads = await this.sampleCores()

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
        cpuCores: coreLoads && coreLoads.length > 0 ? coreLoads : undefined,
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
      description: text(object(rawOptions).description) || undefined,
      serverUrl: this.serverUrl ?? undefined
    }

    const dashboard: DashboardData = {
      fetchedAt: Date.now(),
      latencyMs: Date.now() - started,
      cluster,
      nodes,
      vms,
      storages,
      tasks: tasks.slice(0, 40),
      version,
      // 去重后计数：同一 userid 只算一个；接口没权限时给 undefined，前端显示 —
      userCount: countUniqueUsers(rawUsers)
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
    const lvmRaw = take<unknown>(7, 'LVM', null)
    const lvmthinRaw = take<unknown[]>(8, 'LVM-Thin', [])
    const directoryRaw = take<unknown[]>(9, '目录存储', [])
    const zfsRaw = take<unknown[]>(10, 'ZFS', [])

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
      lvm: mapLvmGroups(lvmRaw),
      lvmthin: mapLvmThinPools(lvmthinRaw),
      directories: mapDirectoryStorages(directoryRaw),
      zfs: mapZfsPools(zfsRaw),
      warnings
    }
  }

  async getNodeHardware(nodeInput: string, refresh = false): Promise<NodeHardwareInfo> {
    const node = validateNode(nodeInput)
    const cached = this.hardwareCache.get(node)
    if (!refresh && cached && Date.now() - cached.at < 60_000) return cached.data

    const client = this.requireClient()
    const base = `/nodes/${encodeURIComponent(node)}`
    const [statusResult, disksResult] = await Promise.all([
      client.request<Raw>(`${base}/status`).catch(() => null),
      client.request<unknown[]>(`${base}/disks/list`).catch(() => null)
    ])
    const status = object(statusResult)
    const cpuinfo = object(status.cpuinfo)
    const disks = mapNodeDisks(array(disksResult))
    const warnings: string[] = []
    if (!disksResult) warnings.push('磁盘列表读取失败')
    if (!statusResult) warnings.push('CPU 信息读取失败')

    const probePromise = probeNodeHardware(client, node).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error)
      warnings.push(`服务器型号与 CPU 温度：${detail}`)
      return null
    })
    const smarted = await attachDiskTemperatures(client, node, disks)
    warnings.push(...smarted.warnings)
    const probe = await probePromise
    if (probe) warnings.push(...probe.warnings)

    const data: NodeHardwareInfo = {
      node,
      manufacturer: probe?.manufacturer,
      productName: probe?.productName,
      productVersion: probe?.productVersion,
      boardName: probe?.boardName,
      cpuModel: text(cpuinfo.model) || undefined,
      cpuTemperature: probe?.cpuTemperature,
      cpuTemperatureMax: probe?.cpuTemperatureMax,
      cpuTemperatureCritical: probe?.cpuTemperatureCritical,
      temperatures: probe?.temperatures ?? [],
      disks: smarted.disks,
      warnings,
      collectedAt: Date.now()
    }
    this.hardwareCache.set(node, { data, at: Date.now() })
    return data
  }

  async getIsoImages(nodeInput: string): Promise<IsoImageList> {
    const node = validateNode(nodeInput)
    const client = this.requireClient()
    const base = `/nodes/${encodeURIComponent(node)}`
    const rawStorages = await client.request<unknown[]>(`${base}/storage`)
    const storages = array(rawStorages)
      .map(object)
      .map((entry) => {
        const content = text(entry.content)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
        return {
          node,
          storage: text(entry.storage),
          type: text(entry.type, 'dir'),
          avail: number(entry.avail),
          total: number(entry.total),
          active: boolean(entry.active),
          content
        }
      })
      .filter((entry) => entry.storage && entry.content.includes('iso'))
      .sort((a, b) => a.storage.localeCompare(b.storage))

    const imageResults = await Promise.allSettled(
      storages
        .filter((entry) => entry.active)
        .map(async (storage) => {
          const raw = await client.request<unknown[]>(
            `${base}/storage/${encodeURIComponent(storage.storage)}/content?content=iso`,
            { timeoutMs: 20_000 }
          )
          return array(raw)
            .map(object)
            .filter((item) => text(item.content) === 'iso' || text(item.volid).includes(':iso/'))
            .map<IsoImageInfo>((item) => {
              const volid = text(item.volid)
              return {
                node,
                storage: storage.storage,
                volid,
                name: volid.split('/').pop() || volid,
                size: number(item.size),
                format: optionalText(item.format),
                ctime: optionalNumber(item.ctime)
              }
            })
        })
    )
    const images = imageResults
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .filter((image) => image.volid)
      .sort((a, b) => a.storage.localeCompare(b.storage) || a.name.localeCompare(b.name))

    return {
      node,
      storages: storages.map(({ content: _content, ...storage }) => storage),
      images
    }
  }

  async uploadIso(input: IsoUploadInput): Promise<IsoMutationResult> {
    const node = validateNode(input.node)
    const storage = validateStorageName(input.storage)
    const filePath = path.resolve(input.filePath)
    if (!/\.(iso|img)$/i.test(filePath)) {
      throw new PveError('VALIDATION', '仅支持上传 .iso 或 .img 文件。')
    }
    let stat: fs.Stats
    try {
      stat = fs.statSync(filePath)
    } catch {
      throw new PveError('VALIDATION', '无法读取待上传的 ISO 文件。')
    }
    if (!stat.isFile()) throw new PveError('VALIDATION', '待上传路径不是文件。')
    const client = this.requireClient()
    const upid = await client.uploadStorageFile({ node, storage, content: 'iso', filePath })
    return {
      message: 'ISO 上传任务已提交。',
      upid: upid ?? undefined
    }
  }

  async importIsoUrl(input: IsoUrlInput): Promise<IsoMutationResult> {
    const node = validateNode(input.node)
    const storage = validateStorageName(input.storage)
    let url: URL
    try {
      url = new URL(input.url)
    } catch {
      throw new PveError('VALIDATION', 'ISO 下载地址格式无效。')
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new PveError('VALIDATION', 'ISO 下载地址只支持 HTTP 或 HTTPS。')
    }
    if (input.url.length > 2048) throw new PveError('VALIDATION', 'ISO 下载地址过长。')
    const filename = input.filename.trim()
    if (!filename || filename.length > 200 || /[\\/\u0000-\u001f]/.test(filename)) {
      throw new PveError('VALIDATION', 'ISO 文件名无效。')
    }
    if (input.checksum && !input.checksumAlgorithm) {
      throw new PveError('VALIDATION', '填写校验值时必须选择校验算法。')
    }
    const client = this.requireClient()
    const form: Record<string, string | number> = {
      url: input.url,
      filename,
      content: 'iso',
      'verify-certificates': input.verifyCertificates ? 1 : 0
    }
    if (input.checksum) {
      form.checksum = input.checksum
      form['checksum-algorithm'] = input.checksumAlgorithm ?? 'sha256'
    }
    const upid = await client.request<string>(
      `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/download-url`,
      { method: 'POST', form, timeoutMs: 30_000 }
    )
    return { message: 'ISO 下载任务已提交。', upid: upid || undefined }
  }

  async deleteIso(nodeInput: string, storageInput: string, volidInput: string): Promise<void> {
    const node = validateNode(nodeInput)
    const storage = validateStorageName(storageInput)
    const volid = validateIsoVolume(volidInput)
    const client = this.requireClient()
    await client.request(
      `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content/${encodeURIComponent(volid)}`,
      { method: 'DELETE', timeoutMs: 30_000 }
    )
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

  /**
   * 探测客户机 SSH 是否可达，顺便把可用的 IP 记下来给「打开终端 / 文件面板」用。
   *
   * 走 Guest Agent 的 network-get-interfaces 拿 IPv4，再并发敲 22 端口。
   * 拿不到 Agent 数据时返回 undefined（不下「不可用」结论），
   * 只有拿到地址但连不上才返回 false。
   */
  private async probeGuestSsh(vm: VmSummaryRef): Promise<boolean | undefined> {
    const cached = this.guestHostCache.get(vm.vmid)
    const now = Date.now()
    if (cached) {
      const ttl = cached.host ? GUEST_HOST_TTL_MS : GUEST_RETRY_TTL_MS
      if (now - cached.probedAt < ttl) {
        return cached.noAgent ? undefined : Boolean(cached.host)
      }
    }
    // 同一轮刷新里不要同时敲几十台：每台最多 1.2s，全并发会给局域网刷出一堆 SYN
    while (this.guestProbes >= GUEST_PROBE_CONCURRENCY) {
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    this.guestProbes += 1
    try {
      return await this.doProbeGuestSsh(vm)
    } finally {
      this.guestProbes -= 1
    }
  }

  private async doProbeGuestSsh(vm: VmSummaryRef): Promise<boolean | undefined> {
    const client = this.requireClient()
    const epoch = this.sessionEpoch
    const now = Date.now()
    const fresh = (): boolean => epoch === this.sessionEpoch
    let interfaces: AgentInterface[]
    try {
      const raw = await client.request<unknown>(`${vmBase(vm)}/agent/network-get-interfaces`, {
        timeoutMs: 2_500
      })
      interfaces = mapAgent(raw)
    } catch {
      // Guest Agent 没装/没响应：不下否定结论，但记一笔，避免每分钟反复等超时
      if (fresh()) this.guestHostCache.set(vm.vmid, { host: null, probedAt: now, noAgent: true })
      return undefined
    }

    const candidates = interfaces
      .flatMap((item) => item.ips)
      .filter((ip) => !ip.type || ip.type === 'ipv4')
      .map((ip) => ip.address)
      .filter((address) => address && !address.startsWith('127.') && address !== '0.0.0.0')

    if (!fresh()) return undefined
    if (candidates.length === 0) {
      this.guestHostCache.set(vm.vmid, { host: null, probedAt: now })
      return false
    }

    const host = await firstReachable(candidates, 22, 1_200)
    if (!fresh()) return undefined
    this.guestHostCache.set(vm.vmid, { host, probedAt: now })
    return Boolean(host)
  }

  /** 取某台虚拟机上次探测到的可用客机地址（打开终端 / 文件面板时用） */
  guestHostOf(vmid: number): string | null {
    const cached = this.guestHostCache.get(vmid)
    if (!cached) return null
    if (Date.now() - cached.probedAt > GUEST_HOST_TTL_MS) return null
    return cached.host
  }

  /**
   * 后台探测客户机 SSH：不阻塞 dashboard。
   * 结果写回控制台缓存，下一次轮询（默认 8 秒）就能反映到控制台菜单。
   */
  private queueGuestSshProbe(vm: VmSummaryRef, status: string): void {
    if (this.guestProbing.has(vm.vmid)) return
    this.guestProbing.add(vm.vmid)
    const epoch = this.sessionEpoch
    void this.probeGuestSsh(vm)
      .then((reachable) => {
        if (epoch !== this.sessionEpoch) return
        if (this.consoleStatus.get(vm.vmid) !== status) return
        const cached = this.consoleCache.get(vm.vmid)
        if (!cached) return
        this.consoleCache.set(vm.vmid, {
          ...cached,
          xterm: true,
          xtermReason:
            reachable === true
              ? undefined
              : reachable === false
                ? '客户机 22 端口不可达；打开终端时可手动填写 SSH 地址与账号密码'
                : '未能自动探测客户机 IP；打开终端时手动填写 SSH 地址即可',
          guestHost: reachable === true ? this.guestHostOf(vm.vmid) : null,
          xtermBackend: 'guest-ssh',
          probedAt: Date.now()
        })
      })
      .catch(() => {
        /* 探测失败只影响控制台菜单的提示，不影响页面 */
      })
      .finally(() => this.guestProbing.delete(vm.vmid))
  }

  private async enrichVmOsForDashboard(vms: VmSummary[]): Promise<void> {
    if (vms.length === 0) return
    const client = this.requireClient()
    const now = Date.now()
    const staleAfter = 30 * 60 * 1000
    const consoleStaleAfter = 5 * 60 * 1000
    /** 控制台不可用时更频繁地重试：装完 OpenSSH 后两分钟内菜单就能变回可用 */
    const consoleRetryAfter = 2 * 60 * 1000

    const pending = vms.filter((vm) => {
      const cached = this.osCache.get(vm.vmid)
      return !cached || now - cached.configFetchedAt > staleAfter
    })

    // 控制台能力也需要 config，跟 OS 探测复用同一次请求；
    // 运行状态变了必须立刻重探，否则「先关机后开机」会一直沿用旧结论
    const consolePending = vms.filter((vm) => {
      const cached = this.consoleCache.get(vm.vmid)
      if (!cached) return true
      if (this.consoleStatus.get(vm.vmid) !== vm.status) return true
      const ttl =
        vm.status === 'running' && !cached.xterm ? consoleRetryAfter : consoleStaleAfter
      return now - cached.probedAt > ttl
    })

    await Promise.allSettled(
      vms.map(async (vm) => {
        const needsOs = pending.includes(vm)
        const needsConsole = consolePending.includes(vm)
        if (!needsOs && !needsConsole) return
        try {
          const config = await client.request<Raw>(`${vmBase(vm)}/config`, { timeoutMs: 6_000 })
          if (needsOs) {
            this.osCache.set(vm.vmid, {
              os: detectVmOs(vm.type, config, vm.name),
              agentEnabled: agentEnabledFromConfig(config),
              configFetchedAt: Date.now()
            })
          }
          if (needsConsole) {
            const agentEnabled = agentEnabledFromConfig(config)
            const cachedGuest = this.guestHostCache.get(vm.vmid)
            const guestFresh =
              cachedGuest !== undefined &&
              Date.now() - cachedGuest.probedAt <
                (cachedGuest.host ? GUEST_HOST_TTL_MS : GUEST_RETRY_TTL_MS)
            const guestSsh = guestFresh
              ? cachedGuest.noAgent
                ? undefined
                : Boolean(cachedGuest.host)
              : undefined
            /**
             * QEMU 终端统一走客户机 SSH，后台探测 22 端口只为自动带出 IP；
             * 探测失败也不置灰，用户可以在终端窗口里手动填写地址。
             */
            const needsGuestProbe =
              vm.type === 'qemu' && vm.status === 'running' && agentEnabled && !guestFresh
            const capability = deriveConsoleCapability({
              type: vm.type,
              status: vm.status,
              config,
              guestSsh,
              vncEnabled: text(config.vnc, '') !== '0'
            })
            const guest = this.guestHostOf(vm.vmid)
            this.consoleCache.set(vm.vmid, {
              ...capability,
              xtermReason:
                needsGuestProbe && !capability.xterm
                  ? '正在探测客户机 SSH（22 端口）…'
                  : capability.xtermReason,
              guestHost: guest,
              guestUser: text(config.ciuser, '') || undefined,
              xtermBackend: guest ? 'guest-ssh' : capability.backend,
              probedAt: Date.now()
            })
            this.consoleStatus.set(vm.vmid, vm.status)
            if (needsGuestProbe) this.queueGuestSshProbe(vm, vm.status)
          }
        } catch {
          if (needsOs) {
            this.osCache.set(vm.vmid, {
              os: detectVmOs(vm.type, { name: vm.name, tags: vm.tags.join(' ') }, vm.name),
              agentEnabled: false,
              configFetchedAt: Date.now() - 25 * 60 * 1000
            })
          }
        }
      })
    )

    const activeIds = new Set(vms.map((vm) => vm.vmid))
    for (const cachedId of this.osCache.keys()) {
      if (!activeIds.has(cachedId)) this.osCache.delete(cachedId)
    }
    for (const cachedId of this.consoleCache.keys()) {
      if (!activeIds.has(cachedId)) this.consoleCache.delete(cachedId)
    }
    for (const cachedId of this.consoleStatus.keys()) {
      if (!activeIds.has(cachedId)) this.consoleStatus.delete(cachedId)
    }

    for (const vm of vms) {
      const cached = this.osCache.get(vm.vmid)
      if (cached) vm.os = cached.os
      const consoleInfo = this.consoleCache.get(vm.vmid)
      if (consoleInfo) vm.console = consoleInfo
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

  private async enrichVmOsFromAgent(vms: VmSummary[]): Promise<void> {    let client: PveClient
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
    const normalizedRef: VmRef = {
      node: validateNode(ref.node),
      type: validateVmType(ref.type),
      vmid: validateVmid(ref.vmid)
    }
    const disks = await this.mapVmDisks(client, normalizedRef, config)
    // 控制台能力：QEMU 统一走客户机 SSH，详情弹窗用同一份缓存避免重复探测
    const guestSsh =
      ref.type === 'qemu' &&
      runtime.status === 'running' &&
      agentEnabledFromConfig(config)
        ? await this.probeGuestSsh({ node: normalizedRef.node, vmid: normalizedRef.vmid, type: ref.type })
        : undefined
    const guest = this.guestHostOf(normalizedRef.vmid)
    const capability = deriveConsoleCapability({
      type: ref.type,
      status: runtime.status,
      config,
      guestSsh,
      vncEnabled: text(config.vnc, '') !== '0'
    })
    const consoleInfo: VmConsoleInfo = {
      ...capability,
      guestHost: guest,
      guestUser: text(config.ciuser, '') || undefined,
      xtermBackend: guest ? 'guest-ssh' : capability.backend,
      probedAt: Date.now()
    }
    this.consoleCache.set(normalizedRef.vmid, consoleInfo)
    this.consoleStatus.set(normalizedRef.vmid, runtime.status)
    return {
      ref: normalizedRef,
      name,
      os: detectVmOs(ref.type, config, name),
      console: consoleInfo,
      runtime,
      config: sanitizeConfig(config),
      disks,
      snapshots: mapSnapshots(array(rawSnapshots)),
      tasks: array(rawTasks).map(object).map(mapTask).slice(0, 12),
      metrics: mapVmMetrics(array(rawMetrics)),
      agentInterfaces,
      agentError
    }
  }

  private async mapVmDisks(client: PveClient, ref: VmRef, config: Raw): Promise<VmDiskInfo[]> {
    const entries = Object.entries(config).filter(
      ([key]) => /^(scsi|sata|virtio|ide)\d+$/.test(key) || key === 'efidisk0' || key === 'tpmstate0'
    )
    const disks = await Promise.all(
      entries.map(async ([key, value]) => {
        const parsed = parseDiskEntry(value as string | number)
        let size: number | undefined
        let format: string | undefined
        if (
          parsed.storage &&
          parsed.volume.includes(':') &&
          !parsed.isCdrom &&
          parsed.volume !== 'none' &&
          !parsed.volume.startsWith('/dev/')
        ) {
          try {
            const info = await client.request<Raw>(
              `/nodes/${encodeURIComponent(ref.node)}/storage/${encodeURIComponent(parsed.storage)}/content/${encodeURIComponent(parsed.volume)}`,
              { timeoutMs: 5_000 }
            )
            size = optionalNumber(object(info).size)
            format = optionalText(object(info).format)
          } catch {
            // Some volumes (for example snapshots or mapped devices) do not
            // expose a storage content record; size simply stays unknown.
          }
        }
        return {
          key,
          volume: parsed.volume,
          storage: parsed.storage,
          size,
          format,
          isCdrom: parsed.isCdrom,
          options: parsed.options
        }
      })
    )
    return disks.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
  }

  private async requireVmStopped(client: PveClient, ref: VmRef): Promise<void> {
    const status = await client.request<Raw>(`${vmBase(ref)}/status/current`, { timeoutMs: 10_000 })
    if (text(status.status) === 'running') {
      throw new PveError('VM_RUNNING', '请先关闭虚拟机，再修改配置或磁盘。')
    }
  }

  async vmConfigUpdate(input: VmConfigPatchInput): Promise<VmMutationResult> {
    const ref: VmRef = {
      node: validateNode(input.node),
      type: validateVmType(input.type),
      vmid: validateVmid(input.vmid)
    }
    const client = this.requireClient()
    await this.requireVmStopped(client, ref)
    if (!input.patch || typeof input.patch !== 'object' || Array.isArray(input.patch)) {
      throw new PveError('VALIDATION', '虚拟机配置参数无效。')
    }
    if (input.digest !== undefined && typeof input.digest !== 'string') {
      throw new PveError('VALIDATION', '配置摘要参数无效。')
    }
    const form = validateVmConfigPatch(ref.type, input.patch)
    if (input.digest) form.digest = input.digest
    await client.request(`${vmBase(ref)}/config`, {
      method: 'PUT',
      form,
      timeoutMs: 30_000
    })
    // 改配置可能加/删串口，控制台能力必须重探
    this.consoleCache.delete(ref.vmid)
    this.consoleStatus.delete(ref.vmid)
    return { message: '虚拟机配置已更新。' }
  }

  async vmDiskAdd(input: VmDiskAddInput): Promise<VmMutationResult> {
    const ref: VmRef = {
      node: validateNode(input.node),
      type: 'qemu',
      vmid: validateVmid(input.vmid)
    }
    const client = this.requireClient()
    await this.requireVmStopped(client, ref)
    const storage = validateStorageName(input.storage)
    if (!Number.isInteger(input.sizeGiB) || input.sizeGiB < 1 || input.sizeGiB > 4096) {
      throw new PveError('VALIDATION', '磁盘大小必须在 1-4096 GiB 之间。')
    }
    if (input.bus !== 'scsi' && input.bus !== 'virtio' && input.bus !== 'sata') {
      throw new PveError('VALIDATION', '不支持的磁盘总线类型。')
    }
    const config = object(await client.request<Raw>(`${vmBase(ref)}/config`, { timeoutMs: 10_000 }))
    const disk = nextDiskKey(config, input.bus)
    const form: Record<string, string | number> = {
      [disk]: `${storage}:${input.sizeGiB}`
    }
    if (input.bus === 'scsi' && !text(config.scsihw)) form.scsihw = 'virtio-scsi-single'
    if (text(config.digest)) form.digest = text(config.digest)
    await client.request(`${vmBase(ref)}/config`, {
      method: 'PUT',
      form,
      timeoutMs: 30_000
    })
    return { message: `已添加磁盘 ${disk}。`, disk }
  }

  async vmDiskResize(input: VmDiskResizeInput): Promise<VmMutationResult> {
    const ref: VmRef = {
      node: validateNode(input.node),
      type: validateVmType(input.type),
      vmid: validateVmid(input.vmid)
    }
    const client = this.requireClient()
    await this.requireVmStopped(client, ref)
    const disk = validateDiskKey(ref.type, input.disk)
    const size = input.size.trim()
    if (!/^\+?\d+(\.\d+)?[KMGT]?$/.test(size)) {
      throw new PveError('VALIDATION', '磁盘容量格式无效，例如 64G 或 +10G。')
    }
    const upid = await client.request<string>(`${vmBase(ref)}/resize`, {
      method: 'PUT',
      form: { disk, size },
      timeoutMs: 30_000
    })
    return { message: '磁盘扩容任务已提交。', upid: upid || undefined }
  }

  async vmDiskRemove(input: VmDiskRemoveInput): Promise<VmMutationResult> {
    const ref: VmRef = {
      node: validateNode(input.node),
      type: validateVmType(input.type),
      vmid: validateVmid(input.vmid)
    }
    const client = this.requireClient()
    await this.requireVmStopped(client, ref)
    if (typeof input.destroy !== 'boolean') {
      throw new PveError('VALIDATION', '磁盘删除参数无效。')
    }
    const disk = validateDiskKey(ref.type, input.disk)
    if (ref.type === 'lxc' && disk === 'rootfs') {
      throw new PveError('VALIDATION', '容器 rootfs 不能移除。')
    }
    const config = object(await client.request<Raw>(`${vmBase(ref)}/config`, { timeoutMs: 10_000 }))
    if (config[disk] === undefined) {
      throw new PveError('NOT_FOUND', `磁盘 ${disk} 不存在。`)
    }
    const parsed = parseDiskEntry(config[disk] as string | number)
    const form: Record<string, string | number> = { delete: disk }
    if (text(config.digest)) form.digest = text(config.digest)
    await client.request(`${vmBase(ref)}/config`, {
      method: 'PUT',
      form,
      timeoutMs: 30_000
    })

    let volumeDeleted = false
    if (input.destroy && parsed.storage && parsed.volume && !parsed.isCdrom && parsed.volume !== 'none') {
      try {
        await client.request(
          `/nodes/${encodeURIComponent(ref.node)}/storage/${encodeURIComponent(parsed.storage)}/content/${encodeURIComponent(parsed.volume)}`,
          { method: 'DELETE', timeoutMs: 30_000 }
        )
        volumeDeleted = true
      } catch (error) {
        throw new PveError('DISK_DELETE_FAILED', '磁盘配置已移除，但删除数据卷失败。', {
          detail: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return {
      message: volumeDeleted ? '磁盘已移除，数据卷已删除。' : '磁盘配置已移除，数据卷仍保留在存储中。'
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

  /** 跨节点拉取任务历史，供任务页做筛选与归档清理。 */
  async taskList(query?: TaskListQuery): Promise<TaskListData> {
    const client = this.requireClient()
    const warnings: string[] = []
    const limit = Math.min(Math.max(query?.limit ?? 200, 1), 1000)

    let nodeNames: string[]
    if (query?.node) {
      nodeNames = [validateNode(query.node)]
    } else {
      try {
        nodeNames = await this.listNodeNames()
      } catch (error) {
        throw new PveError('PVE_ERROR', `无法读取节点列表：${describeError(error)}`)
      }
    }

    const results = await mapWithConcurrency(nodeNames, 4, async (nodeName) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) })
        if (query?.errorsOnly) params.set('errors', '1')
        if (query?.typeFilter) params.set('typefilter', query.typeFilter)
        if (query?.since) params.set('start', String(Math.max(0, query.since)))
        const raw = await client.request<unknown[]>(
          `/nodes/${encodeURIComponent(nodeName)}/tasks?${params.toString()}`
        )
        return array(raw).map(object).map(mapTask)
      } catch (error) {
        warnings.push(`${nodeName}：${describeError(error)}`)
        return [] as TaskSummary[]
      }
    })

    const tasks = results.flat().sort((a, b) => b.startTime - a.startTime).slice(0, limit)
    return { tasks, warnings }
  }

  async taskStop(nodeInput: string, upidInput: string): Promise<void> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    validateUpid(upidInput)
    await client.request(`/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upidInput)}/status`, {
      method: 'DELETE',
      timeoutMs: 20_000
    })
  }

  async taskDelete(nodeInput: string, upidInput: string): Promise<void> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    validateUpid(upidInput)
    // 先尝试停掉，PVE 不允许删除正在运行的任务，已结束的会直接 4xx，忽略即可。
    await client
      .request(`/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upidInput)}/status`, {
        method: 'DELETE',
        timeoutMs: 15_000
      })
      .catch(() => undefined)
    await client.request(`/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upidInput)}`, {
      method: 'DELETE',
      timeoutMs: 20_000
    })
  }

  async subscriptionInfo(nodeInput: string): Promise<SubscriptionInfo> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    const raw = await client.request<Raw>(`/nodes/${encodeURIComponent(node)}/subscription`)
    const status = text(object(raw).status, 'unknown')
    const normalized: SubscriptionInfo['status'] =
      status === 'active' || status === 'expired' || status === 'notfound' || status === 'new' || status === 'invalid'
        ? status
        : 'unknown'
    const data = object(raw)
    return {
      status: normalized,
      level: text(data.level) || undefined,
      key: text(data.key) || undefined,
      message: text(data.message) || undefined,
      serverid: text(data.serverid) || undefined,
      sockets: data.sockets === undefined ? undefined : number(data.sockets),
      checkTime: data.checktime === undefined ? undefined : number(data.checktime),
      nextDueDate: data.nextduedate === undefined ? undefined : number(data.nextduedate),
      productName: text(data.productname) || undefined,
      regDate: text(data.regdate) || undefined
    }
  }

  async subscriptionUpdate(nodeInput: string, keyInput: string): Promise<void> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    const key = keyInput.trim()
    if (!key) throw new PveError('VALIDATION', '订阅密钥不能为空。')
    await client.request(`/nodes/${encodeURIComponent(node)}/subscription`, {
      method: 'PUT',
      form: { key },
      timeoutMs: 20_000
    })
  }

  async subscriptionDelete(nodeInput: string): Promise<void> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    await client.request(`/nodes/${encodeURIComponent(node)}/subscription`, {
      method: 'DELETE',
      timeoutMs: 20_000
    })
  }

  async nodeApt(nodeInput: string): Promise<NodeAptData> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    const base = `/nodes/${encodeURIComponent(node)}`
    const warnings: string[] = []

    const [repoResult, updateResult] = await Promise.all([
      client.request<unknown[]>(`${base}/apt/repositories`).catch((error: unknown) => {
        warnings.push(`仓库列表：${describeError(error)}`)
        return []
      }),
      client.request<unknown[]>(`${base}/apt/update`).catch((error: unknown) => {
        warnings.push(`可升级列表：${describeError(error)}`)
        return []
      })
    ])

    const repoRaw = object(repoResult)
    const repositories = array(repoRaw.files).flatMap((file) => {
      const fileObj = object(file)
      const path = text(fileObj.path)
      return array(fileObj.repositories).map((repo, index) => mapAptRepository(repo, path, index))
    })

    const updates = array(updateResult).map(object).map((entry) => ({
      package: text(entry.Package) || text(entry.package),
      title: text(entry.Title) || undefined,
      oldVersion: text(entry.OldVersion) || undefined,
      version: text(entry.Version) || '',
      section: text(entry.Section) || undefined,
      priority: text(entry.Priority) || undefined,
      origin: text(entry.Origin) || undefined,
      description: text(entry.Description) || undefined
    })).filter((entry) => entry.package)

    return {
      node,
      repositories,
      updates,
      standardRepo: boolean(repoRaw['standard-repos']),
      enterpriseRepo: repositories.some(
        (repo) => repo.enabled && repo.uris.some((uri) => uri.includes('enterprise.proxmox.com'))
      ),
      warnings
    }
  }

  async nodeAptRefresh(input: NodeAptAction): Promise<AptUpdateResult> {
    const client = this.requireClient()
    const node = validateNode(input.node)
    const base = `/nodes/${encodeURIComponent(node)}/apt`

    if (!input.upgrade) {
      const upid = await client.request<string | null>(`${base}/update`, { method: 'POST', timeoutMs: 120_000 })
      return {
        node,
        upid: upid ?? undefined,
        message: upid ? '软件包索引刷新任务已提交。' : '软件包索引已刷新。'
      }
    }

    const form: Record<string, string | boolean> = {}
    if (input.distUpgrade) form['dist-upgrade'] = true
    if (input.exclude && input.exclude.length > 0) form.exclude = input.exclude.join(' ')
    const upid = await client.request<string | null>(`${base}/upgrade`, {
      method: 'POST',
      form,
      timeoutMs: 60_000
    })
    return {
      node,
      upid: upid ?? undefined,
      message: upid ? '升级任务已提交，执行结果会出现在任务列表中。' : '升级任务已提交。'
    }
  }

  async nodeAptRepoSave(nodeInput: string, repos: AptRepository[]): Promise<void> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    if (!Array.isArray(repos) || repos.length === 0) {
      throw new PveError('VALIDATION', '没有需要保存的仓库配置。')
    }
    // PVE 按文件整体写回，因此先按 path 分组。
    const byPath = new Map<string, AptRepository[]>()
    for (const repo of repos) {
      if (!repo.path) throw new PveError('VALIDATION', '仓库配置缺少文件路径。')
      const list = byPath.get(repo.path) ?? []
      list.push(repo)
      byPath.set(repo.path, list)
    }

    for (const [path, entries] of byPath) {
      const payload = entries.map((repo, index) => ({
        index,
        enabled: repo.enabled ? 1 : 0,
        types: (repo.types && repo.types.length > 0 ? repo.types : ['deb']).join(' '),
        uris: repo.uris.join(' '),
        suites: (repo.suites ?? []).join(' '),
        components: repo.components.join(' '),
        ...(repo.comment ? { comment: repo.comment } : {})
      }))
      await client.request(`/nodes/${encodeURIComponent(node)}/apt/repositories`, {
        method: 'POST',
        form: { path, 'digest': '', repos: JSON.stringify(payload) },
        timeoutMs: 30_000
      })
    }
  }

  async nodeCertificate(nodeInput: string): Promise<NodeCertificateData> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    const base = `/nodes/${encodeURIComponent(node)}/certificates`
    const warnings: string[] = []

    const infoRaw = await client
      .request<unknown[]>(`${base}/info`)
      .catch((error: unknown) => {
        warnings.push(`证书信息：${describeError(error)}`)
        return []
      })

    const infoList = array(infoRaw).map(object)
    const custom = infoList.some((entry) => text(entry.filename).startsWith('pveproxy-custom'))
    const entry = infoList.find((item) => text(item.filename) === 'pveproxy-ssl.pem') ?? infoList[0]
    if (!entry) return { node, custom: false, warnings }

    const info = object(entry)
    const filename = text(info.filename)
    // 只有自定义证书才会出现在 custom 端点上，自签证书读不到 PEM，属正常情况。
    const pemText =
      custom && filename
        ? await client
            .request<string>(`${base}/custom`, { params: { filename } })
            .catch(() => '')
        : ''

    return {
      node,
      custom,
      warnings,
      pem: pemText || undefined,
      info: {
        filename,
        subject: text(info.subject) || undefined,
        issuer: text(info.issuer) || undefined,
        fingerprint: text(info.fingerprint) || undefined,
        notbefore: info.notbefore === undefined ? undefined : number(info.notbefore),
        notafter: info.notafter === undefined ? undefined : number(info.notafter),
        publicKeyBits: info['public-key-bits'] === undefined ? undefined : number(info['public-key-bits']),
        publicKeyType: text(info['public-key-type']) || undefined,
        san: array(info.san).map((item) => text(item)).filter(Boolean)
      }
    }
  }

  async nodeCertificateUpload(input: NodeCertificateUpload): Promise<void> {
    const client = this.requireClient()
    const node = validateNode(input.node)
    const certificates = input.certificates.trim()
    const key = input.key.trim()
    if (!certificates.includes('BEGIN CERTIFICATE')) {
      throw new PveError('VALIDATION', '证书内容看起来不是 PEM 格式。')
    }
    if (!key.includes('PRIVATE KEY')) {
      throw new PveError('VALIDATION', '私钥内容看起来不是 PEM 格式。')
    }
    const form: Record<string, string | boolean> = { certificates, key }
    if (input.force) form.force = true
    if (input.restart) form.restart = true
    await client.request(`/nodes/${encodeURIComponent(node)}/certificates/custom`, {
      method: 'POST',
      form,
      timeoutMs: 40_000
    })
  }

  async nodeCertificateReset(nodeInput: string): Promise<void> {
    const client = this.requireClient()
    const node = validateNode(nodeInput)
    await client.request(`/nodes/${encodeURIComponent(node)}/certificates/custom`, {
      method: 'DELETE',
      timeoutMs: 30_000
    })
  }

  async openConsole(input: ConsoleOpenRequest): Promise<ConsoleSessionInfo> {
    // 虚拟机 xterm 走 SshServers.vmSessions（要处理 termproxy 帧协议），这里只保留 noVNC / 节点终端
    return this.openConsoleSession(input)
  }

  /**
   * 虚拟机 xterm.js 控制台的凭据换发。
   *
   * 这里只负责向 PVE 要 ticket 并拼出 vncwebsocket 地址，真正的 WS 连接与
   * termproxy 帧协议由 SshServers.vmSessions 负责（那边还要剥掉认证回包 'OK'）。
   *
   * 判定顺序：
   *   1. LXC → termproxy（容器天生有 pty）
   *   2. QEMU：serial(socket) 存在 → 串口（qm terminal）
   *   3. QEMU 没有串口 → 抛错；客户机 SSH 由 ipc 层在这之前优先尝试
   */
  async prepareVmTerminal(input: ConsoleOpenRequest): Promise<VmTerminalEndpoint> {
    const client = this.requireClient()
    const node = validateNode(input.node)
    const type = validateVmType(input.type ?? 'qemu')
    const vmid = validateVmid(input.vmid ?? 0)
    const vmPath = `/nodes/${encodeURIComponent(node)}/${type}/${vmid}`

    const termproxyUrl = (port: number | string, ticket: string): string =>
      pveConsoleUrl(client.serverUrl, `${vmPath}/vncwebsocket`, port, ticket)

    if (type === 'lxc') {
      const term = await client.request<{ port: number | string; ticket: string; user?: string }>(
        `${vmPath}/termproxy`,
        { method: 'POST', timeoutMs: 20_000 }
      )
      if (!term?.ticket || term.port === undefined) {
        throw new PveError('CONSOLE_ERROR', 'PVE 没有返回容器终端凭据。')
      }
      return {
        backend: 'termproxy',
        wsUrl: termproxyUrl(term.port, term.ticket),
        ticket: term.ticket,
        user: term.user || client.username,
        node,
        type,
        vmid,
        name: input.name
      }
    }

    // QEMU 串口方案已取消：终端统一走客户机 SSH，由 ipc 层优先处理。
    // 这里只保留 LXC 的容器 pty。
    throw new PveError(
      'CONSOLE_ERROR',
      'QEMU 串口控制台已取消，请打开 xterm.js 并填写客户机 SSH 地址与账号密码。'
    )
  }


  /**
   * 节点 Shell 的 PVE termproxy。
   *
   * 很多 PVE 节点只允许密钥 SSH（Debian 默认 PermitRootLogin prohibit-password），
   * 但 PVE 自己的 termproxy 只用 API ticket，不依赖节点 sshd；
   * QEMU 串口也可以先开这个通道再执行 `qm terminal`。
   */
  async prepareNodeTerminal(node: string): Promise<{ wsUrl: string; ticket: string; user: string }> {
    const client = this.requireClient()
    const valid = validateNode(node)
    const term = await client.request<{ port: number | string; ticket: string; user?: string }>(
      `/nodes/${encodeURIComponent(valid)}/termproxy`,
      { method: 'POST', timeoutMs: 20_000 }
    )
    if (!term?.ticket || term.port === undefined) {
      throw new PveError('CONSOLE_ERROR', 'PVE 没有返回节点终端凭据。')
    }
    return {
      wsUrl: pveConsoleUrl(
        client.serverUrl,
        `/nodes/${encodeURIComponent(valid)}/vncwebsocket`,
        term.port,
        term.ticket
      ),
      ticket: term.ticket,
      user: term.user || client.username
    }
  }

  private async openConsoleSession(input: ConsoleOpenRequest): Promise<ConsoleSessionInfo> {
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

  /* ---------------------------------------------------------------- *
   * 访问控制
   * ---------------------------------------------------------------- */

  async getAccessOverview(): Promise<AccessOverviewData> {
    const client = this.requireClient()
    const warnings: string[] = []

    const [rawUsers, rawGroups, rawRoles, rawAcl, rawDomains] = await Promise.all([
      client.request<unknown[]>('/access/users?full=1'),
      client.request<unknown[]>('/access/groups').catch((error) => {
        warnings.push(`读取用户组失败：${describeError(error)}`)
        return []
      }),
      client.request<unknown[]>('/access/roles').catch((error) => {
        warnings.push(`读取角色失败：${describeError(error)}`)
        return []
      }),
      client.request<unknown[]>('/access/acl').catch((error) => {
        warnings.push(`读取 ACL 失败：${describeError(error)}`)
        return []
      }),
      client.request<unknown[]>('/access/domains').catch(() => [])
    ])

    const userEntries = array(rawUsers).map(object)
    const tokensByUser = new Map<string, PveUserToken[]>()
    await mapWithConcurrency(userEntries, 4, async (entry) => {
      const userid = text(entry.userid)
      if (!userid) return
      try {
        const rawTokens = await client.request<unknown[]>(`/access/users/${encodeURIComponent(userid)}/token`)
        tokensByUser.set(
          userid,
          array(rawTokens).map((token) => mapUserToken(userid, object(token)))
        )
      } catch {
        tokensByUser.set(userid, [])
      }
    })

    const usersByGroup = new Map<string, string[]>()
    for (const entry of userEntries) {
      const userid = text(entry.userid)
      if (!userid) continue
      for (const groupid of tagListList(entry.groups)) {
        const list = usersByGroup.get(groupid) ?? []
        list.push(userid)
        usersByGroup.set(groupid, list)
      }
    }

    const groups = array(rawGroups).map((entry) => mapGroup(object(entry), usersByGroup))
    const groupOf = new Map<string, string[]>()
    for (const group of groups) {
      for (const userid of group.users) {
        const list = groupOf.get(userid) ?? []
        list.push(group.groupid)
        groupOf.set(userid, list)
      }
    }

    const users = userEntries.map((entry) => {
      const userid = text(entry.userid)
      const realm = userid.includes('@') ? userid.slice(userid.lastIndexOf('@') + 1) : 'pam'
      return {
        userid,
        comment: text(entry.comment) || undefined,
        email: text(entry.email) || undefined,
        firstName: text(entry.firstname) || undefined,
        lastName: text(entry.lastname) || undefined,
        groups: groupOf.get(userid) ?? tagListList(entry.groups),
        keys: text(entry.keys) || undefined,
        enabled: entry.enable === undefined ? true : boolean(entry.enable),
        expire: entry.expire === undefined ? undefined : number(entry.expire),
        domain: realm,
        realmType: text(entry.type) || (realm === 'pam' ? 'pam' : 'pve'),
        tokens: tokensByUser.get(userid) ?? []
      }
    })

    const roles = array(rawRoles).map((entry) => mapRole(object(entry)))

    const acl = array(rawAcl)
      .map((entry) => mapAcl(object(entry)))
      .filter((entry): entry is PveAclEntry => entry !== null)

    const realms = array(rawDomains)
      .map((entry) => text(object(entry).realm))
      .filter(Boolean)

    return { users, groups, roles, acl, realms, warnings }
  }

  async saveAccessUser(input: AccessUserInput): Promise<void> {
    const client = this.requireClient()
    const userid = validateUserid(input.userid)
    const create = input.create !== false
    const form: Record<string, string | number | boolean> = {}
    if (input.password !== undefined && input.password !== '') form.password = input.password
    if (input.comment !== undefined) form.comment = input.comment
    if (input.email !== undefined) form.email = input.email.trim()
    if (input.firstName !== undefined) form.firstname = input.firstName
    if (input.lastName !== undefined) form.lastname = input.lastName
    if (input.groups !== undefined) form.groups = input.groups.filter(Boolean).join(',')
    if (input.expire !== undefined) form.expire = input.expire
    if (input.enabled !== undefined) form.enable = input.enabled

    if (create) {
      const realm = userid.includes('@') ? userid.slice(userid.lastIndexOf('@') + 1) : 'pam'
      if (input.password === undefined && realm === 'pve') {
        throw new PveError('VALIDATION', 'PVE 内置域（pve）新建用户必须设置密码。')
      }
      await client.request('/access/users', { method: 'POST', form, timeoutMs: 20_000 })
    } else {
      await client.request(`/access/users/${encodeURIComponent(userid)}`, {
        method: 'PUT',
        form,
        timeoutMs: 20_000
      })
    }
  }

  async deleteAccessUser(useridInput: string): Promise<void> {
    const userid = validateUserid(useridInput)
    const client = this.requireClient()
    await client.request(`/access/users/${encodeURIComponent(userid)}`, {
      method: 'DELETE',
      timeoutMs: 20_000
    })
  }

  async saveAccessGroup(input: AccessGroupInput): Promise<void> {
    const groupid = validateGroupId(input.groupid)
    const client = this.requireClient()
    const form: Record<string, string> = {}
    if (input.comment !== undefined) form.comment = input.comment
    if (input.create === false) {
      await client.request(`/access/groups/${encodeURIComponent(groupid)}`, {
        method: 'PUT',
        form,
        timeoutMs: 20_000
      })
    } else {
      await client.request('/access/groups', { method: 'POST', form, timeoutMs: 20_000 })
    }
  }

  async deleteAccessGroup(groupidInput: string): Promise<void> {
    const groupid = validateGroupId(groupidInput)
    const client = this.requireClient()
    await client.request(`/access/groups/${encodeURIComponent(groupid)}`, {
      method: 'DELETE',
      timeoutMs: 20_000
    })
  }

  async updateAccessAcl(input: AccessAclInput): Promise<void> {
    const client = this.requireClient()
    const path = validateAclPath(input.path)
    const ugid = input.ugid.trim()
    if (!ugid) throw new PveError('VALIDATION', '请选择用户、组或 API 令牌。')
    const roleid = input.roleid.trim()
    if (!roleid) throw new PveError('VALIDATION', '请选择角色。')
    const form: Record<string, string | boolean> = {
      path,
      users: ugid,
      roles: roleid,
      propagate: input.propagate !== false
    }
    if (input.delete) form.delete = true
    await client.request('/access/acl', { method: 'PUT', form, timeoutMs: 20_000 })
  }

  async saveAccessToken(input: AccessTokenInput): Promise<AccessTokenCreated | null> {
    const client = this.requireClient()
    const userid = validateUserid(input.userid)
    const tokenId = input.tokenId.trim().toLowerCase()
    if (!/^[a-z][a-z0-9.-]*$/.test(tokenId)) {
      throw new PveError('VALIDATION', '令牌标识只能包含小写字母、数字、点与短横线，且以字母开头。')
    }
    const base = `/access/users/${encodeURIComponent(userid)}/token/${encodeURIComponent(tokenId)}`
    if (input.create === false) {
      await client.request(base, {
        method: 'PUT',
        form: {
          comment: input.comment ?? '',
          expire: input.expire ?? 0,
          privsep: input.privsep ?? false
        },
        timeoutMs: 20_000
      })
      return null
    }
    const raw = await client.request<Raw>(base, {
      method: 'POST',
      form: {
        comment: input.comment ?? '',
        expire: input.expire ?? 0,
        privsep: input.privsep ?? false
      },
      timeoutMs: 20_000
    })
    const value = text(object(raw).value)
    const fullTokenId = text(object(raw)['full-tokenid']) || `${userid}!${tokenId}`
    return {
      tokenId,
      fullTokenId,
      value,
      message: value
        ? '令牌已创建。密钥只显示这一次，请立即保存。'
        : '令牌已创建，但 PVE 未返回密钥内容。'
    }
  }

  async deleteAccessToken(useridInput: string, tokenIdInput: string): Promise<void> {
    const userid = validateUserid(useridInput)
    const tokenId = tokenIdInput.trim()
    if (!tokenId) throw new PveError('VALIDATION', '令牌标识不能为空。')
    const client = this.requireClient()
    await client.request(
      `/access/users/${encodeURIComponent(userid)}/token/${encodeURIComponent(tokenId)}`,
      { method: 'DELETE', timeoutMs: 20_000 }
    )
  }

  /* ---------------------------------------------------------------- *
   * 存储与资源池
   * ---------------------------------------------------------------- */

  async getStorageOverview(): Promise<StorageOverviewData> {
    const client = this.requireClient()
    const warnings: string[] = []

    const [rawDefinitions, rawPools] = await Promise.all([
      client.request<unknown[]>('/storage'),
      client.request<unknown[]>('/pools').catch((error) => {
        warnings.push(`读取资源池失败：${describeError(error)}`)
        return []
      })
    ])

    const definitions = array(rawDefinitions).map((entry) => mapStorageDefinition(object(entry)))

    const pools = await mapWithConcurrency(array(rawPools).map(object), 4, async (entry) => {
      const poolid = text(entry.poolid)
      const base: PvePoolSummary = {
        poolid,
        comment: text(entry.comment) || undefined,
        members: []
      }
      if (!poolid) return base
      try {
        const raw = await client.request<Raw>(`/pools/${encodeURIComponent(poolid)}`)
        const members = array(object(raw).members).map((member) => {
          const item = object(member)
          return {
            id: text(item.id),
            type: text(item.type),
            vmid: item.vmid === undefined ? undefined : number(item.vmid),
            node: text(item.node) || undefined,
            storage: text(item.storage) || undefined
          }
        })
        return { ...base, members }
      } catch (error) {
        warnings.push(`读取资源池 ${poolid} 成员失败：${describeError(error)}`)
        return base
      }
    })

    return { definitions, pools, warnings }
  }

  async getStorageContents(
    nodeInput: string,
    storageInput: string,
    contentType?: string
  ): Promise<StorageContentData> {
    const node = validateNode(nodeInput)
    const storage = validateStorageName(storageInput)
    const client = this.requireClient()
    const params = contentType ? `?content=${encodeURIComponent(contentType)}` : ''
    const raw = await client.request<unknown[]>(
      `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content${params}`,
      { timeoutMs: 25_000 }
    )

    const base = `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content`
    const entries: StorageContentEntry[] = array(raw).map((item) => {
      const entry = object(item)
      const volid = text(entry.volid)
      return {
        volid,
        name: storageVolumeName(volid),
        format: text(entry.format),
        contentType: text(entry.content),
        size: number(entry.size),
        used: number(entry.size),
        vmid: entry.vmid === undefined ? undefined : number(entry.vmid),
        ctime: entry.ctime === undefined ? undefined : number(entry.ctime),
        node,
        storage,
        protected: boolean(entry.protected),
        notes: text(entry.notes) || undefined
      }
    })

    return {
      node,
      storage,
      contentType: contentType ?? '',
      entries,
      totalSize: entries.reduce((sum, entry) => sum + entry.size, 0),
      totalUsed: entries.reduce((sum, entry) => sum + entry.used, 0)
    }
  }

  async saveStorageDefinition(input: StorageDefinitionInput): Promise<void> {
    const storage = validateStorageName(input.storage)
    const client = this.requireClient()

    if (input.delete) {
      await client.request(`/storage/${encodeURIComponent(storage)}`, {
        method: 'DELETE',
        timeoutMs: 25_000
      })
      return
    }

    const type = input.type.trim()
    if (!type) throw new PveError('VALIDATION', '请选择存储类型。')

    const form: Record<string, string | boolean> = {
      storage,
      type,
      content: input.content.filter(Boolean).join(',')
    }
    if (input.path !== undefined) form.path = input.path.trim()
    if (input.nodes !== undefined) form.nodes = input.nodes.trim()
    if (input.shared !== undefined) form.shared = input.shared
    if (input.disable !== undefined) form.disable = input.disable
    for (const [key, value] of Object.entries(input.options ?? {})) {
      if (!key.trim() || value === '') continue
      form[key.trim()] = value
    }

    if (input.create === false) {
      await client.request(`/storage/${encodeURIComponent(storage)}`, {
        method: 'PUT',
        form,
        timeoutMs: 25_000
      })
    } else {
      await client.request('/storage', { method: 'POST', form, timeoutMs: 25_000 })
    }
  }

  async deleteStorageContent(
    nodeInput: string,
    storageInput: string,
    volidInput: string
  ): Promise<ActionResult> {
    const node = validateNode(nodeInput)
    const storage = validateStorageName(storageInput)
    const volid = validateStorageVolume(volidInput)
    const client = this.requireClient()
    const upid = await client.request<string | null>(
      `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content/${encodeURIComponent(volid)}`,
      { method: 'DELETE', timeoutMs: 60_000 }
    )
    return {
      upid: upid ?? undefined,
      message: upid ? '删除任务已提交，卷会在后台释放。' : '卷已删除。'
    }
  }

  async savePool(input: PoolInput): Promise<void> {
    const poolid = validatePoolId(input.poolid)
    const client = this.requireClient()
    if (input.delete) {
      await client.request(`/pools/${encodeURIComponent(poolid)}`, {
        method: 'DELETE',
        timeoutMs: 20_000
      })
      return
    }
    const form: Record<string, string> = {}
    if (input.comment !== undefined) form.comment = input.comment
    if (input.create === false) {
      await client.request(`/pools/${encodeURIComponent(poolid)}`, {
        method: 'PUT',
        form,
        timeoutMs: 20_000
      })
    } else {
      await client.request('/pools', { method: 'POST', form: { poolid, ...form }, timeoutMs: 20_000 })
    }
  }

  async updatePoolMembers(input: PoolMemberInput): Promise<void> {
    const poolid = validatePoolId(input.poolid)
    const client = this.requireClient()
    const form: Record<string, string | boolean> = {}
    if (input.vms && input.vms.length > 0) form.vms = input.vms.join(',')
    if (input.storages && input.storages.length > 0) form.storages = input.storages.join(',')
    if (input.delete) form.delete = true
    if (!form.vms && !form.storages) {
      throw new PveError('VALIDATION', '请至少选择一台虚拟机或一个存储。')
    }
    await client.request(`/pools/${encodeURIComponent(poolid)}`, {
      method: 'PUT',
      form,
      timeoutMs: 25_000
    })
  }

  /* ---------------------------------------------------------------- *
   * 备份与还原
   * ---------------------------------------------------------------- */

  async getBackupOverview(): Promise<BackupOverviewData> {
    const client = this.requireClient()
    const warnings: string[] = []

    const nodes = await this.listNodeNames()

    const filesByNode = await Promise.all(
      nodes.map(async (node) => {
        const base = `/nodes/${encodeURIComponent(node)}`
        const storages = await client
          .request<unknown[]>(`${base}/storage?content=backup`)
          .catch(() => [])
        const activeStorages = array(storages)
          .map(object)
          .filter((entry) => boolean(entry.active) !== false)
          .map((entry) => text(entry.storage))
          .filter(Boolean)

        const perStorage = await mapWithConcurrency(activeStorages, 3, async (storage) => {
          try {
            const raw = await client.request<unknown[]>(
              `${base}/storage/${encodeURIComponent(storage)}/content?content=backup`,
              { timeoutMs: 30_000 }
            )
            return array(raw).map((item) => mapBackupFile(object(item), node, storage))
          } catch (error) {
            warnings.push(`${node}/${storage} 读取备份失败：${describeError(error)}`)
            return [] as BackupFile[]
          }
        })
        return perStorage.flat()
      })
    )

    const files = filesByNode.flat().sort((a, b) => (b.ctime ?? 0) - (a.ctime ?? 0))

    const jobs = await this.getBackupJobs().catch((error) => {
      warnings.push(`读取备份计划失败：${describeError(error)}`)
      return [] as BackupJob[]
    })

    return {
      files,
      jobs,
      totals: {
        count: files.length,
        size: files.reduce((sum, file) => sum + file.size, 0)
      },
      warnings
    }
  }

  async getBackupJobs(): Promise<BackupJob[]> {
    const client = this.requireClient()
    const raw = await client.request<unknown[]>('/cluster/backup')
    return array(raw).map((entry) => mapBackupJob(object(entry)))
  }

  async startBackup(input: StartBackupInput): Promise<ActionResult> {
    const node = validateNode(input.node)
    const storage = validateStorageName(input.storage)
    const client = this.requireClient()

    const form: Record<string, string | number | boolean> = {
      storage,
      mode: input.mode ?? 'snapshot',
      compress: input.compress ?? 'zstd',
      stdout: false
    }
    if (input.vmid !== undefined) {
      form.vmid = validateVmid(input.vmid)
    } else {
      form.all = true
    }
    if (input.notesTemplate) form.notesTemplate = input.notesTemplate
    if (input.protected) form.protected = true
    if (input.removeOlder !== undefined && input.removeOlder > 0) {
      form['remove'] = Math.min(365, Math.round(input.removeOlder))
    }

    const upid = await client.request<string | null>(`/nodes/${encodeURIComponent(node)}/vzdump`, {
      method: 'POST',
      form,
      timeoutMs: 30_000
    })
    return {
      upid: upid ?? undefined,
      message: upid ? '备份任务已提交，可在「任务」页查看进度。' : '备份任务已提交。'
    }
  }

  async saveBackupJob(input: BackupJobInput): Promise<void> {
    const client = this.requireClient()
    if (input.delete) {
      if (!input.id) throw new PveError('VALIDATION', '缺少备份计划 ID。')
      await client.request(`/cluster/backup/${encodeURIComponent(input.id)}`, {
        method: 'DELETE',
        timeoutMs: 20_000
      })
      return
    }

    const storage = validateStorageName(input.storage)
    const schedule = input.schedule?.trim()
    if (!schedule) throw new PveError('VALIDATION', '请填写备份计划（cron 或 calendar 表达式）。')

    const form: Record<string, string | boolean> = {
      storage,
      schedule,
      mode: input.mode ?? 'snapshot',
      compress: input.compress ?? 'zstd',
      enabled: input.enabled !== false
    }
    if (input.vmid) form.vmid = input.vmid
    else if (input.node) form.node = validateNode(input.node)
    else form.all = true
    if (input.comment !== undefined) form.comment = input.comment

    if (input.id) {
      await client.request(`/cluster/backup/${encodeURIComponent(input.id)}`, {
        method: 'PUT',
        form,
        timeoutMs: 25_000
      })
    } else {
      await client.request('/cluster/backup', { method: 'POST', form, timeoutMs: 25_000 })
    }
  }

  async restoreBackup(input: RestoreBackupInput): Promise<ActionResult> {
    const node = validateNode(input.node)
    const storage = validateStorageName(input.storage)
    const volid = validateStorageVolume(input.volid)
    const vmid = validateVmid(input.vmid)
    const type = validateVmType(input.guestType)
    const client = this.requireClient()

    const form: Record<string, string | number | boolean> = { archive: volid, unique: input.unique !== false }
    if (input.start) form.start = true
    if (input.name) form.name = input.name
    if (input.pool) form.pool = input.pool

    if (type === 'qemu') {
      form.storage = storage
      const upid = await client.request<string | null>(
        `/nodes/${encodeURIComponent(node)}/qemu`,
        { method: 'POST', form: { ...form, vmid }, timeoutMs: 30_000 }
      )
      return {
        upid: upid ?? undefined,
        message: upid ? '还原任务已提交。' : '还原任务已提交。'
      }
    }

    form.ostemplate = volid
    const upid = await client.request<string | null>(`/nodes/${encodeURIComponent(node)}/lxc`, {
      method: 'POST',
      form: { ...form, vmid, restore: true },
      timeoutMs: 30_000
    })
    return {
      upid: upid ?? undefined,
      message: upid ? '容器还原任务已提交。' : '容器还原任务已提交。'
    }
  }

  /* ---------------------------------------------------------------- *
   * 防火墙
   * ---------------------------------------------------------------- */

  async getFirewallOverview(scope: FirewallScope): Promise<FirewallOverviewData> {
    const client = this.requireClient()
    const base = firewallBase(scope)
    const warnings: string[] = []

    const [rawOptions, rawRules, rawGroups, rawIpsets] = await Promise.all([
      client.request<Raw>(`${base}/options`).catch(() => ({})),
      client.request<unknown[]>(`${base}/rules`).catch((error) => {
        warnings.push(`读取防火墙规则失败：${describeError(error)}`)
        return []
      }),
      client.request<unknown[]>('/cluster/firewall/groups').catch(() => []),
      client.request<unknown[]>(`${base}/ipset`).catch(() => [])
    ])

    const rules = array(rawRules).map((entry) => mapFirewallRule(object(entry)))

    const groups = await mapWithConcurrency(
      array(rawGroups).map(object),
      4,
      async (entry): Promise<FirewallGroupSummary> => {
        const group = text(entry.group)
        const count = await client
          .request<unknown[]>(`/cluster/firewall/groups/${encodeURIComponent(group)}`)
          .then((raw) => array(raw).length)
          .catch(() => 0)
        return { group, comment: text(entry.comment) || undefined, ruleCount: count }
      }
    )

    return {
      scope,
      options: mapFirewallOptions(object(rawOptions)),
      rules,
      groups,
      ipsets: array(rawIpsets).map((entry) => {
        const item = object(entry)
        return { name: text(item.name), comment: text(item.comment) || undefined }
      }),
      warnings
    }
  }

  async saveFirewallRule(input: FirewallRuleInput): Promise<void> {
    const client = this.requireClient()
    const base = firewallBase(input.scope)
    const rule = input.rule
    const type = rule.type
    if (type !== 'in' && type !== 'out' && type !== 'group') {
      throw new PveError('VALIDATION', '规则方向无效。')
    }
    const action = (rule.action ?? '').trim()
    if (!action) throw new PveError('VALIDATION', '请选择规则动作。')

    const form: Record<string, string | number | boolean> = {
      type,
      action,
      enable: rule.enabled !== false
    }
    if (rule.proto) form.proto = rule.proto
    if (rule.source) form.source = rule.source.trim()
    if (rule.dest) form.dest = rule.dest.trim()
    if (rule.sport) form.sport = rule.sport.trim()
    if (rule.dport) form.dport = rule.dport.trim()
    if (rule.iface) form.iface = rule.iface.trim()
    if (rule.comment) form.comment = rule.comment
    if (rule.log) form.log = rule.log
    if (rule.macro) form.macro = rule.macro
    if (rule.icmpType) form['icmp-type'] = rule.icmpType

    if (input.delete) {
      const pos = rule.pos
      if (!Number.isInteger(pos)) throw new PveError('VALIDATION', '缺少规则序号。')
      await client.request(`${base}/rules/${pos}`, { method: 'DELETE', timeoutMs: 20_000 })
      return
    }

    if (Number.isInteger(rule.pos) && (rule.pos ?? 0) > 0) {
      await client.request(`${base}/rules/${rule.pos}`, {
        method: 'PUT',
        form,
        timeoutMs: 20_000
      })
    } else {
      await client.request(`${base}/rules`, { method: 'POST', form, timeoutMs: 20_000 })
    }
  }

  async saveFirewallOptions(input: FirewallOptionsInput): Promise<void> {
    const client = this.requireClient()
    const base = firewallBase(input.scope)
    const options = input.options
    const form: Record<string, string | boolean> = {}
    if (options.enable !== undefined) form.enable = options.enable
    if (options.policyIn !== undefined) form.policy_in = options.policyIn
    if (options.policyOut !== undefined) form.policy_out = options.policyOut
    if (options.logLevelIn !== undefined) form.log_level_in = options.logLevelIn
    if (options.logLevelOut !== undefined) form.log_level_out = options.logLevelOut
    if (options.ebtables !== undefined) form.ebtables = options.ebtables
    for (const [key, value] of Object.entries(options.extra ?? {})) {
      if (!key.trim()) continue
      form[key] = value
    }
    if (Object.keys(form).length === 0) {
      throw new PveError('VALIDATION', '没有需要更新的防火墙选项。')
    }
    await client.request(`${base}/options`, { method: 'PUT', form, timeoutMs: 20_000 })
  }

  async saveFirewallAlias(input: FirewallAliasInput): Promise<void> {
    const client = this.requireClient()
    const base = firewallBase(input.scope)
    const name = input.name.trim()
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      throw new PveError('VALIDATION', '别名只能包含字母、数字与下划线，且以字母开头。')
    }
    if (input.delete) {
      await client.request(`${base}/ipset/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        timeoutMs: 20_000
      })
      return
    }
    const cidr = input.cidr.trim()
    if (!cidr) throw new PveError('VALIDATION', '请填写 CIDR，例如 10.0.0.0/24。')
    const form: Record<string, string> = { cidr }
    if (input.comment !== undefined) form.comment = input.comment
    await client.request(`${base}/ipset`, { method: 'POST', form: { name, ...form }, timeoutMs: 20_000 })
  }

  /* ---------------------------------------------------------------- *
   * 集群成员管理
   * ---------------------------------------------------------------- */

  async getClusterJoinInfo(): Promise<ClusterJoinInfo> {
    const client = this.requireClient()
    const warnings: string[] = []

    const [rawNodes, rawStatus, rawConfig] = await Promise.all([
      client.request<unknown[]>('/cluster/config/nodes').catch((error) => {
        warnings.push(`读取集群成员失败：${describeError(error)}`)
        return []
      }),
      client.request<Raw>('/cluster/status').catch((error) => {
        warnings.push(`读取集群状态失败：${describeError(error)}`)
        return null
      }),
      client.request<Raw>('/cluster/config/join', {
        params: { join: 1 },
        timeoutMs: 15_000
      }).catch(() => null)
    ])

    // /cluster/status 里带 name 的那条就是本节点自身
    const statusEntries = array(rawStatus).map((entry) => object(entry))
    const selfEntry = statusEntries.find((entry) => text(entry.type) === 'node' && boolean(entry.local))
    const nodeEntries = statusEntries.filter((entry) => text(entry.type) === 'node')

    const nodes: ClusterMember[] = array(rawNodes).map((entry) => {
      const item = object(entry)
      const name = text(item.name) || text(item.nodeid)
      const online = nodeEntries.find((node) => text(node.name) === name)
      return {
        name,
        nodeid: optionalNumber(item.nodeid),
        ring0: optionalText(item.ring0_addr) || undefined,
        votes: optionalNumber(item.quorum_votes),
        online: online ? boolean(online.online) : undefined
      }
    })

    // 兜底：/cluster/config/nodes 为空时用 status 里的节点列表
    if (nodes.length === 0) {
      for (const entry of nodeEntries) {
        nodes.push({
          name: text(entry.name),
          nodeid: optionalNumber(entry.nodeid),
          votes: optionalNumber(entry.quorum_votes),
          online: boolean(entry.online)
        })
      }
    }

    const config = object(rawConfig)
    return {
      selfNode: selfEntry ? text(selfEntry.name) || undefined : undefined,
      clusterName: text(config.clustername) || undefined,
      configDigest: text(config.config_digest) || undefined,
      nodes,
      warnings
    }
  }

  /**
   * 把本节点加入对端集群。
   * PVE 的 `/cluster/config/join` 走 ssh 连到对端，整个过程可能几十秒，超时给足。
   */
  async joinCluster(input: ClusterJoinInput): Promise<void> {
    const hostname = input.hostname.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    if (!hostname) throw new PveError('VALIDATION', '请填写对端节点地址。')
    if (!/^[A-Za-z0-9._-]+(:\d+)?$/.test(hostname)) {
      throw new PveError('VALIDATION', '对端地址格式无效：只填主机名或 IP，不要带协议或路径。')
    }
    if (!input.password) throw new PveError('VALIDATION', '请填写对端节点的 root 密码。')
    if (input.votes !== undefined && (input.votes < 0 || !Number.isInteger(input.votes))) {
      throw new PveError('VALIDATION', '节点票数必须是 0 或正整数。')
    }

    const client = this.requireClient()
    await client.request('/cluster/config/join', {
      method: 'POST',
      form: {
        hostname,
        password: input.password,
        ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
        ...(input.nodeid ? { nodeid: input.nodeid } : {}),
        ...(input.usePeerAddress !== undefined ? { 'use_peer_address': input.usePeerAddress } : {}),
        ...(input.votes !== undefined ? { votes: input.votes } : {})
      },
      timeoutMs: 180_000
    })
  }

  async removeClusterNode(nodeInput: string): Promise<void> {
    const node = validateNode(nodeInput)
    const client = this.requireClient()
    await client.request<unknown>('/cluster/status').then((raw) => {
      const local = array(raw)
        .map((entry) => object(entry))
        .find((entry) => text(entry.type) === 'node' && boolean(entry.local))
      if (local && text(local.name) === node) {
        throw new PveError('VALIDATION', '不能移出当前连接的这个节点，请在其它节点上操作。')
      }
      return raw
    })
    await client.request(`/cluster/config/nodes/${encodeURIComponent(node)}`, {
      method: 'DELETE',
      timeoutMs: 60_000
    })
  }

  /* ---------------------------------------------------------------- *
   * 节点磁盘初始化
   * ---------------------------------------------------------------- */

  async initDisk(input: DiskInitInput): Promise<void> {
    const node = validateNode(input.node)
    const devpath = input.devpath.trim()
    if (!devpath) throw new PveError('VALIDATION', '请选择要操作的磁盘。')
    // PVE 的 disks/create 只接受 /dev/xxx 形式
    if (!/^\/dev\/[A-Za-z0-9_./-]+$/.test(devpath)) {
      throw new PveError('VALIDATION', `磁盘路径无效：${devpath}。应为 /dev/sdX 或 /dev/nvmeXn1。`)
    }
    const client = this.requireClient()
    const base = `/nodes/${encodeURIComponent(node)}/disks`

    if (input.mode === 'wipe') {
      await client.request(`${base}/wipe`, {
        method: 'POST',
        form: { dev: devpath },
        timeoutMs: 600_000
      })
      return
    }

    const name = input.name?.trim() ?? ''
    if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(name)) {
      throw new PveError('VALIDATION', '存储 ID 必须以字母开头，只能包含字母、数字、点、下划线和连字符。')
    }

    const form: Record<string, string | number | boolean> = { dev: devpath }
    if (input.force) form.force = true

    switch (input.mode) {
      case 'gpt':
        await client.request(`${base}/initgpt`, {
          method: 'POST',
          form: { disk: devpath, ...(input.force ? { force: true } : {}) },
          timeoutMs: 120_000
        })
        return
      case 'lvm':
        form.name = name
        form.vgname = input.vgname?.trim() || name
        break
      case 'lvmthin':
        form.name = name
        form.vgname = input.vgname?.trim() || name
        form.thinpool = input.thinpool?.trim() || 'data'
        break
      case 'zfs':
        form.name = name
        if (input.zfsThin) form.add_storage = true
        if (input.raidlevel) form.raidlevel = input.raidlevel
        break
      case 'directory':
        form.name = name
        form.path = input.path?.trim() || `/mnt/${name}`
        break
    }

    await client.request(`${base}/create`, {
      method: 'POST',
      form: { ...form, type: input.mode },
      timeoutMs: 300_000
    })
  }

  /* ---------------------------------------------------------------- *
   * SDN（软件定义网络）
   * ---------------------------------------------------------------- */

  async getSdnOverview(): Promise<SdnOverviewData> {
    const client = this.requireClient()
    const warnings: string[] = []

    const [rawRoot, rawZones, rawVnets, rawSubnets] = await Promise.all([
      client.request<unknown>('/cluster/sdn').catch((error) => {
        warnings.push(`读取 SDN 配置状态失败：${describeError(error)}`)
        return null
      }),
      client.request<unknown[]>('/cluster/sdn/zones').catch((error) => {
        warnings.push(`读取 SDN 区域失败：${describeError(error)}`)
        return []
      }),
      client.request<unknown[]>('/cluster/sdn/vnets').catch((error) => {
        warnings.push(`读取 SDN VNet 失败：${describeError(error)}`)
        return []
      }),
      client.request<unknown[]>('/cluster/sdn/subnets').catch((error) => {
        warnings.push(`读取 SDN 子网失败：${describeError(error)}`)
        return []
      })
    ])

    const root = object(rawRoot)
    const vnets = array(rawVnets).map(mapSdnVnet).filter((item) => item.vnet)
    const zones = array(rawZones).map(mapSdnZone).filter((item) => item.zone)
    const subnets = array(rawSubnets).map(mapSdnSubnet).filter((item) => item.subnet)

    return {
      zones,
      vnets,
      subnets,
      enabled: Boolean(root.sdn) || object(root.sdn).enabled !== undefined,
      pending:
        boolean(root.pending) ||
        zones.some((item) => item.pending) ||
        vnets.some((item) => item.pending) ||
        subnets.some((item) => item.pending),
      warnings
    }
  }

  async saveSdnZone(input: SdnZoneInput): Promise<void> {
    const zone = input.zone.trim()
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(zone)) {
      throw new PveError('VALIDATION', 'SDN 区域名格式无效：只能包含字母、数字、下划线和连字符，且以字母开头。')
    }
    const client = this.requireClient()

    if (input.delete) {
      await client.request(`/cluster/sdn/zones/${encodeURIComponent(zone)}`, {
        method: 'DELETE',
        timeoutMs: 20_000
      })
      return
    }

    const form: Record<string, string | number | boolean> = { type: input.type }
    if (input.type === 'simple' || input.type === 'vlan' || input.type === 'qinq') {
      if (input.bridge) form.bridge = input.bridge
    }
    if (input.type === 'vlan' && input.vlan !== undefined) form.vlan = input.vlan
    if (input.type === 'qinq' && input.vlanProtocol) form['vlan-protocol'] = input.vlanProtocol
    if (input.type === 'vxlan' || input.type === 'evpn') {
      if (input.vxlanId !== undefined) form['vxlan-id'] = input.vxlanId
      if (input.peers) form.peers = input.peers
    }
    if (input.type === 'evpn') {
      if (input.controller) form.controller = input.controller
      if (input.vrfVxlan !== undefined) form['vrf-vxlan'] = input.vrfVxlan
      if (input.asn !== undefined) form.asn = input.asn
      if (input.exitNodes) form['exit-nodes'] = input.exitNodes
    }
    if (input.mtu !== undefined) form.mtu = input.mtu
    if (input.nodes) form.nodes = input.nodes
    for (const key of ['ipam', 'dns', 'dnsZone', 'reversedns', 'dhcp'] as const) {
      const value = input[key]
      if (!value) continue
      form[key === 'dnsZone' ? 'dnszone' : key.toLowerCase()] = value
    }

    await client.request(`/cluster/sdn/zones/${encodeURIComponent(zone)}`, {
      method: 'PUT',
      form,
      timeoutMs: 20_000
    })
  }

  async saveSdnVnet(input: SdnVnetInput): Promise<void> {
    const vnet = input.vnet.trim()
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(vnet)) {
      throw new PveError('VALIDATION', 'VNet 名称格式无效：只能包含字母、数字、下划线和连字符，且以字母开头。')
    }
    const client = this.requireClient()

    if (input.delete) {
      await client.request(`/cluster/sdn/vnets/${encodeURIComponent(vnet)}`, {
        method: 'DELETE',
        timeoutMs: 20_000
      })
      return
    }

    const zone = input.zone.trim()
    if (!zone) throw new PveError('VALIDATION', '请选择 VNet 所属的 SDN 区域。')
    await client.request(`/cluster/sdn/vnets/${encodeURIComponent(vnet)}`, {
      method: 'PUT',
      form: {
        zone,
        ...(input.alias ? { alias: input.alias } : {}),
        ...(input.tag !== undefined ? { tag: input.tag } : {}),
        ...(input.vlanaware !== undefined ? { vlanaware: input.vlanaware } : {})
      },
      timeoutMs: 20_000
    })
  }

  async saveSdnSubnet(input: SdnSubnetInput): Promise<void> {
    const subnet = input.subnet.trim()
    if (!/^[0-9a-fA-F.:]+\/\d{1,3}$/.test(subnet)) {
      throw new PveError('VALIDATION', '子网格式无效，应为 CIDR 形式，例如 10.0.0.0/24。')
    }
    const client = this.requireClient()
    const base = `/cluster/sdn/subnets/${encodeURIComponent(subnet)}`

    if (input.delete) {
      await client.request(base, { method: 'DELETE', timeoutMs: 20_000 })
      return
    }

    const vnet = input.vnet.trim()
    if (!vnet) throw new PveError('VALIDATION', '请选择子网所属的 VNet。')
    const form: Record<string, string | number | boolean> = { vnet }
    if (input.gateway) form.gateway = input.gateway
    if (input.snat !== undefined) form.snat = input.snat
    if (input.dnsZonePrefix) form['dnszoneprefix'] = input.dnsZonePrefix
    if (input.dnsServers) form.dns = input.dnsServers
    if (input.dhcpRangeStart && input.dhcpRangeEnd) {
      form['dhcp-range'] = JSON.stringify({ start: input.dhcpRangeStart, end: input.dhcpRangeEnd })
    }

    await client.request(base, { method: 'PUT', form, timeoutMs: 20_000 })
  }

  /** 把 pending 的 SDN 变更下发到各节点；revert=true 时丢弃未下发的变更。 */
  async applySdn(revert = false): Promise<void> {
    const client = this.requireClient()
    // PVE 要求先拿到 /cluster/sdn 的锁再提交，否则返回 423 Locked；
    // lock-token 由 PVE 直接回写 cookie 维度，这里只需先 GET 一次拿锁。
    await client.request<unknown>('/cluster/sdn', { timeoutMs: 15_000 })
    await client.request('/cluster/sdn', {
      method: 'PUT',
      form: revert ? { revert: 1, release_lock: 1 } : { release_lock: 1 },
      timeoutMs: 180_000
    })
  }

  /* ---------------------------------------------------------------- *
   * 高可用（HA）
   * ---------------------------------------------------------------- */

  async getHaOverview(): Promise<HaOverviewData> {
    const client = this.requireClient()
    const warnings: string[] = []

    const [rawResources, rawGroups, rawStatus, rawManager] = await Promise.all([
      client.request<unknown[]>('/cluster/ha/resources').catch((error) => {
        warnings.push(`读取 HA 资源失败：${describeError(error)}`)
        return []
      }),
      client.request<unknown[]>('/cluster/ha/groups').catch(() => []),
      client.request<unknown[]>('/cluster/ha/status/current').catch(() => []),
      client.request<Raw>('/cluster/ha/status/manager_status').catch(() => null)
    ])

    return {
      resources: array(rawResources).map((entry) => mapHaResource(object(entry))),
      groups: array(rawGroups).map((entry) => mapHaGroup(object(entry))),
      statuses: array(rawStatus).map((entry) => {
        const item = object(entry)
        return {
          id: text(item.id),
          node: text(item.node) || undefined,
          status: text(item.status) || undefined,
          type: text(item.type) || undefined
        }
      }),
      manager: rawManager ? object(rawManager) : null,
      warnings
    }
  }

  async saveHaResource(input: HaResourceInput): Promise<void> {
    const sid = validateHaSid(input.sid)
    const client = this.requireClient()
    if (input.delete) {
      await client.request(`/cluster/ha/resources/${encodeURIComponent(sid)}`, {
        method: 'DELETE',
        timeoutMs: 20_000
      })
      return
    }
    if (input.state) {
      await client.request(`/cluster/ha/resources/${encodeURIComponent(sid)}/state`, {
        method: 'POST',
        form: { request_state: input.state },
        timeoutMs: 20_000
      })
      return
    }
    await client.request('/cluster/ha/resources', {
      method: 'POST',
      form: {
        sid,
        ...(input.group ? { group: input.group } : {}),
        ...(input.maxRestart !== undefined ? { max_restart: input.maxRestart } : {}),
        ...(input.maxRelocate !== undefined ? { max_relocate: input.maxRelocate } : {}),
        ...(input.comment !== undefined ? { comment: input.comment } : {})
      },
      timeoutMs: 20_000
    })
  }
  async saveHaGroup(input: HaGroupInput): Promise<void> {
    const group = input.group.trim()
    if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(group)) {
      throw new PveError('VALIDATION', 'HA 组名格式无效。')
    }
    const client = this.requireClient()
    if (input.delete) {
      await client.request(`/cluster/ha/groups/${encodeURIComponent(group)}`, {
        method: 'DELETE',
        timeoutMs: 20_000
      })
      return
    }
    const nodes = input.nodes.trim()
    if (!nodes) throw new PveError('VALIDATION', '请填写组成员节点。')
    await client.request('/cluster/ha/groups', {
      method: 'POST',
      form: {
        group,
        nodes,
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        ...(input.restricted !== undefined ? { restricted: input.restricted } : {}),
        ...(input.noFailback !== undefined ? { nofailback: input.noFailback } : {})
      },
      timeoutMs: 20_000
    })
  }

  private async listNodeNames(): Promise<string[]> {
    const client = this.requireClient()
    const raw = await client.request<unknown[]>('/nodes')
    return array(raw)
      .map((entry) => text(object(entry).node))
      .filter(Boolean)
  }

  /* ---------------------------------------------------------------- *
   * 虚拟机增强：快照 / 迁移 / 模板 / cloud-init
   * ---------------------------------------------------------------- */

  async vmSnapshot(input: SnapshotInput): Promise<SnapshotMutationResult> {
    const base = vmBase(input.ref)
    const client = this.requireClient()

    if (input.delete) {
      const name = validateSnapshotName(input.delete)
      const upid = await client.request<string | null>(
        `${base}/snapshot/${encodeURIComponent(name)}`,
        { method: 'DELETE', timeoutMs: 30_000 }
      )
      return {
        name,
        upid: upid ?? undefined,
        message: upid ? `快照「${name}」删除任务已提交。` : `快照「${name}」已删除。`
      }
    }

    if (input.rollback) {
      const name = validateSnapshotName(input.rollback)
      const upid = await client.request<string | null>(
        `${base}/snapshot/${encodeURIComponent(name)}/rollback`,
        { method: 'POST', timeoutMs: 30_000 }
      )
      return {
        name,
        upid: upid ?? undefined,
        message: upid ? `回滚到「${name}」的任务已提交。` : `已回滚到「${name}」。`
      }
    }

    const name = validateSnapshotName(input.name ?? '')
    const form: Record<string, string | boolean> = { snapname: name }
    if (input.description) form.description = input.description
    if (input.vmstate) form.vmstate = true
    const upid = await client.request<string | null>(`${base}/snapshot`, {
      method: 'POST',
      form,
      timeoutMs: 30_000
    })
    return {
      name,
      upid: upid ?? undefined,
      message: upid ? `快照「${name}」创建任务已提交。` : `快照「${name}」已创建。`
    }
  }

  async vmMigrate(input: MigrateInput): Promise<ActionResult> {
    const base = vmBase(input.ref)
    const target = validateNode(input.target)
    const client = this.requireClient()
    if (target === input.ref.node) {
      throw new PveError('VALIDATION', '目标节点与当前节点相同。')
    }
    const upid = await client.request<string | null>(`${base}/migrate`, {
      method: 'POST',
      form: {
        target,
        online: input.online !== false,
        'with-local-disks': input.withLocalDisks !== false,
        ...(input.targetStorage ? { targetstorage: validateStorageName(input.targetStorage) } : {}),
        ...(input.force ? { force: true } : {})
      },
      timeoutMs: 30_000
    })
    return {
      upid: upid ?? undefined,
      message: upid ? `迁移任务已提交，目标节点 ${target}。` : '迁移任务已提交。'
    }
  }

  async vmTemplate(input: TemplateInput): Promise<ActionResult> {
    const base = vmBase(input.ref)
    const client = this.requireClient()
    if (input.template) {
      await this.requireVmStopped(client, input.ref)
    }
    const upid = await client.request<string | null>(`${base}/template`, {
      method: 'POST',
      timeoutMs: 30_000
    })
    return {
      upid: upid ?? undefined,
      message: input.template ? '已提交转为模板，模板不可再直接启动。' : '已提交取消模板标记。'
    }
  }

  async vmCloudInit(input: CloudInitInput): Promise<VmMutationResult> {
    if (input.ref.type !== 'qemu') {
      throw new PveError('VALIDATION', 'cloud-init 仅适用于 KVM 虚拟机。')
    }
    const base = vmBase(input.ref)
    const client = this.requireClient()

    const patch: Record<string, string> = {}
    if (input.addDrive) patch.ide2 = input.addDrive
    if (input.user) patch.ciuser = input.user
    if (input.ciuser) patch.ciuser = input.ciuser
    if (input.password) patch.cipassword = input.password
    if (input.sshKeys !== undefined) patch.sshkeys = encodeURIComponent(input.sshKeys)
    if (input.ipconfig0) patch.ipconfig0 = input.ipconfig0
    if (input.nameserver) patch.nameserver = input.nameserver
    if (input.searchdomain) patch.searchdomain = input.searchdomain
    if (input.citype) patch.citype = input.citype
    if (input.cicustom) patch.cicustom = input.cicustom

    if (Object.keys(patch).length === 0) {
      throw new PveError('VALIDATION', '没有需要写入的 cloud-init 配置。')
    }

    const upid = await client.request<string | null>(`${base}/config`, {
      method: 'PUT',
      form: patch,
      timeoutMs: 25_000
    })

    const warnings: string[] = []
    if (upid) {
      const exit = await this.waitForTask(input.ref.node, upid, 30_000).catch(() => '')
      if (exit && exit !== 'OK') warnings.push(`配置任务返回：${exit}`)
    }

    return {
      message: 'cloud-init 配置已写入。',
      upid: upid ?? undefined,
      warnings
    }
  }

  async vmSendKey(input: VmSendKeyInput): Promise<void> {
    if (input.ref.type !== 'qemu') {
      throw new PveError('VALIDATION', '发送组合键仅适用于 KVM 虚拟机。')
    }
    const keys = input.keys.filter(Boolean)
    if (keys.length === 0) throw new PveError('VALIDATION', '请至少指定一个按键。')
    const base = vmBase(input.ref)
    const client = this.requireClient()
    await client.request(`${base}/sendkey`, {
      method: 'PUT',
      form: { key: keys.join(' ') },
      timeoutMs: 15_000
    })
  }
}

function describeError(error: unknown): string {
  if (error instanceof PveError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

function tagListList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean)
  return text(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function mapUserToken(userid: string, raw: Raw): PveUserToken {
  const tokenId = text(raw.tokenid)
  return {
    tokenId,
    fullTokenId: `${userid}!${tokenId}`,
    comment: text(raw.comment) || undefined,
    expire: raw.expire === undefined ? undefined : number(raw.expire),
    privsep: boolean(raw.privsep),
    createdAt: raw['ctime'] === undefined ? undefined : number(raw['ctime'])
  }
}

function mapGroup(raw: Raw, usersByGroup: Map<string, string[]>): PveGroup {
  const groupid = text(raw.groupid)
  return {
    groupid,
    comment: text(raw.comment) || undefined,
    users: usersByGroup.get(groupid) ?? []
  }
}

function mapRole(raw: Raw): PveRole {
  return {
    roleid: text(raw.roleid),
    privs: tagListList(raw.privs),
    special: boolean(raw.special)
  }
}

function mapAcl(raw: Raw): PveAclEntry | null {
  const ugid = text(raw.ugid) || text(raw.user) || text(raw.group)
  if (!ugid) return null
  const type: PveAclEntry['type'] = ugid.includes('!')
    ? 'token'
    : text(raw.type) === 'group' || text(raw.group)
      ? 'group'
      : 'user'
  return {
    path: text(raw.path, '/'),
    ugid,
    type,
    roleid: text(raw.roleid),
    propagate: boolean(raw.propagate),
    comment: text(raw.comment) || undefined
  }
}

function validateUserid(input: string): string {
  const userid = input.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(@[A-Za-z0-9][A-Za-z0-9._-]*)?$/.test(userid)) {
    throw new PveError('VALIDATION', '用户标识格式无效，应形如 root@pam 或 user@realm。')
  }
  return userid
}

function validateGroupId(input: string): string {
  const groupid = input.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(groupid)) {
    throw new PveError('VALIDATION', '用户组标识格式无效。')
  }
  return groupid
}

function validateAclPath(input: string): string {
  const path = input.trim()
  if (!path.startsWith('/')) {
    throw new PveError('VALIDATION', 'ACL 路径必须以 / 开头。')
  }
  return path
}

function validatePoolId(input: string): string {
  const poolid = input.trim()
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(poolid)) {
    throw new PveError('VALIDATION', '资源池标识必须以字母开头，只能包含字母、数字、点、下划线与短横线。')
  }
  return poolid
}

function storageVolumeName(volid: string): string {
  if (!volid) return ''
  if (volid.includes(':iso/')) {
    return volid.slice(volid.indexOf(':iso/') + 5)
  }
  if (volid.includes(':vztmpl/')) {
    return volid.slice(volid.indexOf(':vztmpl/') + 8)
  }
  if (volid.includes(':backup/')) {
    return volid.slice(volid.indexOf(':backup/') + 8)
  }
  if (volid.includes(':snippets/')) {
    return volid.slice(volid.indexOf(':snippets/') + 10)
  }
  const tail = volid.split('/').pop() ?? volid
  return tail
}

const STORAGE_CONTENT_TYPES = [
  'images',
  'rootdir',
  'vztmpl',
  'iso',
  'backup',
  'snippets'
] as const

/* ---------------- 备份映射 ---------------- */

function mapBackupFile(raw: Raw, node: string, storage: string): BackupFile {
  const volid = text(raw.volid)
  const filename = volid.includes(':backup/')
    ? volid.slice(volid.indexOf(':backup/') + 8)
    : volid.split('/').pop() ?? volid
  const guestType: VmType | undefined = filename.includes('vzdump-qemu')
    ? 'qemu'
    : filename.includes('vzdump-lxc')
      ? 'lxc'
      : undefined
  const vmidMatch = /vzdump-(?:qemu|lxc)-(\d+)-/.exec(filename)
  return {
    volid,
    filename,
    storage,
    node,
    format: text(raw.format) || guessBackupFormat(filename),
    size: number(raw.size),
    ctime: raw.ctime === undefined ? undefined : number(raw.ctime),
    vmid: raw.vmid === undefined ? (vmidMatch ? Number(vmidMatch[1]) : undefined) : number(raw.vmid),
    guestType,
    notes: text(raw.notes) || undefined,
    encrypted: text(raw.format).includes('enc') || filename.includes('enc')
  }
}

function guessBackupFormat(filename: string): string {
  if (filename.endsWith('.vma.zst')) return 'zst'
  if (filename.endsWith('.vma.gz')) return 'gz'
  if (filename.endsWith('.vma.lzo')) return 'lzo'
  if (filename.endsWith('.tar.zst')) return 'zst'
  if (filename.endsWith('.tar.gz')) return 'gz'
  if (filename.endsWith('.vma')) return 'vma'
  if (filename.endsWith('.tar')) return 'tar'
  return ''
}

function mapBackupJob(raw: Raw): BackupJob {
  const vmid = raw.vmid === undefined ? '' : text(raw.vmid)
  return {
    id: text(raw.id),
    enabled: raw.enabled === undefined ? true : boolean(raw.enabled),
    mode: text(raw.mode, 'snapshot'),
    storage: text(raw.storage),
    schedule: text(raw.schedule),
    vmid: vmid || undefined,
    node: text(raw.node) || undefined,
    all: boolean(raw.all),
    compress: text(raw.compress, 'zstd'),
    comment: text(raw.comment) || undefined,
    nextRun: raw.nextrun === undefined ? undefined : number(raw.nextrun),
    lastRun: raw.lastrun === undefined ? undefined : number(raw.lastrun)
  }
}

/* ---------------- 防火墙映射 ---------------- */

function firewallBase(scope: FirewallScope): string {
  if (scope.level === 'cluster') return '/cluster/firewall'
  const node = validateNode(scope.node)
  if (scope.level === 'node') return `/nodes/${encodeURIComponent(node)}/firewall`
  const type = validateVmType(scope.type)
  const vmid = validateVmid(scope.vmid)
  return `/nodes/${encodeURIComponent(node)}/${type}/${vmid}/firewall`
}

function mapFirewallRule(raw: Raw): FirewallRule {
  const typeRaw = text(raw.type, 'in')
  const type: FirewallRule['type'] = typeRaw === 'out' ? 'out' : typeRaw === 'group' ? 'group' : 'in'
  return {
    pos: number(raw.pos),
    type,
    action: text(raw.action, 'ACCEPT').toUpperCase(),
    proto: text(raw.proto) || undefined,
    source: text(raw.source) || undefined,
    dest: text(raw.dest) || undefined,
    sport: text(raw.sport) || undefined,
    dport: text(raw.dport) || undefined,
    iface: text(raw.iface) || undefined,
    comment: text(raw.comment) || undefined,
    enabled: raw.enable === undefined ? true : boolean(raw.enable),
    log: text(raw.log) || undefined,
    macro: text(raw.macro) || undefined,
    icmpType: text(raw['icmp-type']) || undefined,
    digest: text(raw.digest) || undefined
  }
}

function mapFirewallOptions(raw: Raw): FirewallOptions {
  const known = new Set([
    'enable',
    'policy_in',
    'policy_out',
    'log_level_in',
    'log_level_out',
    'ebtables',
    'digest'
  ])
  const extra: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (known.has(key)) continue
    if (value === null || value === undefined) continue
    extra[key] = String(value)
  }
  return {
    enable: boolean(raw.enable),
    policyIn: text(raw.policy_in) || undefined,
    policyOut: text(raw.policy_out) || undefined,
    logLevelIn: text(raw.log_level_in) || undefined,
    logLevelOut: text(raw.log_level_out) || undefined,
    ebtables: raw.ebtables === undefined ? undefined : boolean(raw.ebtables),
    digest: text(raw.digest) || undefined,
    extra
  }
}

/* ---------------- HA 映射 ---------------- */

function mapHaResource(raw: Raw): HaResource {
  return {
    sid: text(raw.sid),
    type: text(raw.type),
    state: text(raw.state) || undefined,
    group: text(raw.group) || undefined,
    maxRestart: raw['max_restart'] === undefined ? undefined : number(raw['max_restart']),
    maxRelocate: raw['max_relocate'] === undefined ? undefined : number(raw['max_relocate']),
    comment: text(raw.comment) || undefined,
    node: text(raw.node) || undefined,
    status: text(raw.status) || undefined
  }
}

function mapHaGroup(raw: Raw): HaGroup {
  return {
    group: text(raw.group),
    nodes: text(raw.nodes),
    comment: text(raw.comment) || undefined,
    restricted: raw.restricted === undefined ? undefined : boolean(raw.restricted),
    noFailback: raw.nofailback === undefined ? undefined : boolean(raw.nofailback)
  }
}

function validateHaSid(input: string): string {
  const sid = input.trim()
  if (!/^(vm|ct):\d{3,}$/.test(sid)) {
    throw new PveError('VALIDATION', 'HA 资源标识应形如 vm:100 或 ct:101。')
  }
  return sid
}

function validateSnapshotName(input: string): string {
  const name = input.trim()
  if (!name) throw new PveError('VALIDATION', '快照名称不能为空。')
  if (name.length > 40) throw new PveError('VALIDATION', '快照名称不能超过 40 个字符。')
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    throw new PveError('VALIDATION', '快照名称只能包含字母、数字、点、下划线与短横线。')
  }
  return name
}

function mapStorageDefinition(raw: Raw): StorageDefinition {
  const known = new Set([
    'storage',
    'type',
    'content',
    'path',
    'nodes',
    'shared',
    'disable'
  ])
  const options: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (known.has(key)) continue
    if (value === null || value === undefined) continue
    options[key] = String(value)
  }
  return {
    storage: text(raw.storage),
    type: text(raw.type),
    content: tagListList(raw.content).filter((item) =>
      (STORAGE_CONTENT_TYPES as readonly string[]).includes(item)
    ),
    path: text(raw.path) || undefined,
    nodes: text(raw.nodes) || undefined,
    shared: boolean(raw.shared),
    disable: boolean(raw.disable),
    options
  }
}

export { validateNode, validateVmType }
