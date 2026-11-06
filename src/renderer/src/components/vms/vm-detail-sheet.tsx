import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Camera,
  Clock,
  CloudCog,
  Cpu,
  ExternalLink,
  HardDrive,
  Info,
  Keyboard,
  Loader2,
  MemoryStick,
  Network,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Server,
  Settings2,
  Terminal,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import type {
  AgentInterface,
  StorageSummary,
  TaskSummary,
  VmDetail,
  VmDiskInfo,
  VmRef,
  VmAction,
  VmSnapshot
} from '@shared/types'
import { TASK_TYPE_LABELS, VM_ACTION_LABELS } from '@shared/ipc'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@renderer/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Progress, Skeleton } from '@renderer/components/ui/primitives'
import { DataRow, EmptyState } from '@renderer/components/common'
import { AreaChart } from '@renderer/components/charts/area-chart'
import { OsIcon } from '@renderer/components/os-icon'
import { TaskStatusBadge, VmStatusBadge } from '@renderer/components/status-badges'
import { VmDetailActionBar, type ActionTarget } from '@renderer/components/vms/vm-actions'
import {
  AddDiskDialog,
  RemoveDiskDialog,
  ResizeDiskDialog,
  VmConfigDialog
} from '@renderer/components/vms/vm-config-dialogs'
import {
  CloudInitDialog,
  MigrateDialog,
  SendKeyDialog,
  SnapshotDeleteDialog,
  SnapshotDialog,
  SnapshotRollbackDialog,
  TemplateDialog
} from '@renderer/components/vms/vm-ops-dialogs'
import { unwrap, errorDetail } from '@renderer/lib/api'
import {
  formatBytes,
  formatDuration,
  formatFullDateTime,
  formatPercent,
  formatUptime
} from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'

interface VmDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vmRef: VmRef | null
  refreshToken: number
  actionBusy: boolean
  storages: StorageSummary[]
  nodes: string[]
  onRefresh: () => void
  onAction: (target: ActionTarget, action: VmAction) => void
  onConsole: (target: ActionTarget) => void
  onViewTask: (task: TaskSummary) => void
}

const CONFIG_LABELS: Record<string, string> = {
  name: '名称',
  cores: 'CPU 核心',
  sockets: 'CPU 插槽',
  cpu: 'CPU 类型',
  memory: '内存',
  balloon: '内存气球',
  ostype: '客户机类型',
  scsihw: 'SCSI 控制器',
  machine: '机器类型',
  bios: '固件',
  boot: '启动顺序',
  agent: 'Guest Agent',
  onboot: '随机启动',
  numa: 'NUMA',
  vga: '显示设备',
  serial0: '串行端口',
  tags: '标签',
  description: '描述',
  tpmstate0: 'TPM 状态',
  efidisk0: 'EFI 磁盘',
  parent: '父快照',
  digest: '配置摘要',
  meta: '元数据',
  smbios1: 'SMBIOS',
  vmgenid: 'VM Generation ID',
  keyboard: '键盘布局',
  protection: '删除保护'
}

const HIDDEN_CONFIG_KEYS = new Set(['digest', 'meta', 'name', 'description'])

function displayConfigValue(key: string, value: string | number): string {
  if (key === 'memory' || key === 'balloon') {
    const n = Number(value)
    if (Number.isFinite(n)) return `${n} MiB · ${(n / 1024).toFixed(n >= 1024 ? 1 : 2)} GiB`
  }
  if (key === 'agent' || key === 'onboot' || key === 'numa' || key === 'protection') {
    const truthy = value === 1 || value === '1' || value === 'yes' || value === 'on'
    return truthy ? '是' : '否'
  }
  if (key === 'bios') return String(value) === 'ovmf' ? 'OVMF (UEFI)' : String(value)
  return String(value)
}

function parseNetwork(value: string | number): {
  model: string
  mac?: string
  options: Record<string, string>
} {
  const tokens = String(value)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
  const options: Record<string, string> = {}
  let model = 'virtio'
  let mac: string | undefined
  for (const token of tokens) {
    const [rawKey, ...rest] = token.split('=')
    if (rest.length === 0) {
      model = rawKey
      continue
    }
    const rawValue = rest.join('=')
    if (/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(rawValue) && /^(virtio|e1000|e1000e|rtl8139|vmxnet3)$/.test(rawKey)) {
      model = rawKey
      mac = rawValue
    } else {
      options[rawKey] = rawValue
    }
  }
  return { model, mac, options }
}

function MetricTile({
  label,
  value,
  suffix,
  detail,
  icon,
  progress,
  className
}: {
  label: string
  value: string
  suffix?: string
  detail?: string
  icon: React.ReactNode
  progress?: number
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('min-w-0 border-r border-border/60 px-3 py-2.5 last:border-r-0', className)}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="truncate font-mono text-[17px] font-medium tracking-tight text-foreground">{value}</span>
        {suffix && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{suffix}</span>}
      </div>
      {progress !== undefined && (
        <Progress
          value={progress * 100}
          className="mt-1.5 h-[3px]"
          indicatorClassName={progress > 0.85 ? 'bg-warning' : 'bg-brand'}
        />
      )}
      {detail && <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{detail}</div>}
    </div>
  )
}

function Field({
  label,
  children,
  mono,
  className
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className={cn('mt-1 break-all text-[12px] leading-5 text-foreground', mono && 'font-mono text-[11px]')}>
        {children}
      </div>
    </div>
  )
}

function SectionBar({
  icon,
  title,
  hint,
  actions,
  children,
  className
}: {
  icon?: React.ReactNode
  title: string
  hint?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex min-h-9 flex-wrap items-center gap-2 px-3.5 py-1.5', className)}>
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-[12px] font-medium text-foreground">{title}</span>
      {hint && <span className="font-mono text-[10px] text-muted-foreground">{hint}</span>}
      {children}
      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </div>
  )
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1.5 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  )
}

function SnapshotRow({
  snapshot,
  onRollback,
  onDelete
}: {
  snapshot: VmSnapshot
  onRollback: (snapshot: VmSnapshot) => void
  onDelete: (snapshot: VmSnapshot) => void
}): React.JSX.Element {
  return (
    <div className="group flex items-start gap-3 border-b border-border/60 px-3 py-2.5 last:border-0">
      <div className={cn('mt-1 h-1.5 w-1.5 shrink-0', snapshot.current ? 'bg-brand' : 'bg-border-strong')} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-[12px] text-foreground">{snapshot.name}</span>
          {snapshot.current && <Badge variant="brand">当前状态</Badge>}
          {snapshot.vmstate && <Badge variant="info">含内存</Badge>}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {snapshot.current ? 'HEAD' : snapshot.snaptime ? formatFullDateTime(snapshot.snaptime * 1000) : '—'}
          </span>
        </div>
        {snapshot.description && (
          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-4 text-muted-foreground">{snapshot.description}</p>
        )}
        {snapshot.parent && <div className="mt-1 font-mono text-[10px] text-muted-foreground/80">父快照 {snapshot.parent}</div>}
      </div>
      {!snapshot.current && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onRollback(snapshot)}
            className="inline-flex h-6 items-center gap-1 px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            aria-label={`回滚到 ${snapshot.name}`}
          >
            <RotateCcw className="h-3 w-3" />
            回滚
          </button>
          <button
            type="button"
            onClick={() => onDelete(snapshot)}
            className="inline-flex h-6 items-center gap-1 px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`删除快照 ${snapshot.name}`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

function AgentInterfaceRow({ iface }: { iface: AgentInterface }): React.JSX.Element {
  return (
    <div className="border-b border-border/60 px-3 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-foreground">{iface.name}</span>
        {iface.mac && <span className="font-mono text-[10px] text-muted-foreground">{iface.mac}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {iface.ips.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">无地址</span>
          ) : (
            iface.ips.map((ip) => (
              <span key={`${ip.type}-${ip.address}`} className="font-mono text-[11px] text-foreground">
                {ip.address}
                {ip.prefix !== undefined ? `/${ip.prefix}` : ''}
              </span>
            ))
          )}
        </div>
      </div>
      {(iface.rxBytes !== undefined || iface.txBytes !== undefined) && (
        <div className="mt-1 flex gap-4 font-mono text-[10px] text-muted-foreground">
          <span>RX {formatBytes(iface.rxBytes ?? 0)}</span>
          <span>TX {formatBytes(iface.txBytes ?? 0)}</span>
        </div>
      )}
    </div>
  )
}

export function VmDetailSheet({
  open,
  onOpenChange,
  vmRef,
  refreshToken,
  actionBusy,
  storages,
  nodes,
  onRefresh,
  onAction,
  onConsole,
  onViewTask
}: VmDetailSheetProps): React.JSX.Element {
  const [detail, setDetail] = useState<VmDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('overview')
  const [metric, setMetric] = useState<'cpu' | 'memory'>('cpu')
  const [configOpen, setConfigOpen] = useState(false)
  const [addDiskOpen, setAddDiskOpen] = useState(false)
  const [resizeDisk, setResizeDisk] = useState<VmDiskInfo | null>(null)
  const [removeDisk, setRemoveDisk] = useState<VmDiskInfo | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [rollbackSnapshot, setRollbackSnapshot] = useState<VmSnapshot | null>(null)
  const [deleteSnapshot, setDeleteSnapshot] = useState<VmSnapshot | null>(null)
  const [migrateOpen, setMigrateOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [cloudInitOpen, setCloudInitOpen] = useState(false)
  const [sendKeyOpen, setSendKeyOpen] = useState(false)
  const refKey = vmRef ? `${vmRef.node}/${vmRef.type}/${vmRef.vmid}` : ''

  useEffect(() => {
    if (!open) return
    setTab('overview')
    setDetail(null)
    setError(null)
    setLoading(true)
    setRefreshing(false)
  }, [open, refKey])

  useEffect(() => {
    if (!open || !vmRef) return
    let cancelled = false
    const matchingDetail =
      detail &&
      detail.ref.node === vmRef.node &&
      detail.ref.type === vmRef.type &&
      detail.ref.vmid === vmRef.vmid
    if (matchingDetail) setRefreshing(true)
    else setLoading(true)
    unwrap(window.pvevdi.vmDetail(vmRef))
      .then((next) => {
        if (cancelled) return
        setDetail(next)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(errorDetail(err))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setRefreshing(false)
      })
    return () => {
      cancelled = true
    }
    // Intentionally refetch when refreshToken changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refKey, refreshToken])

  const target: ActionTarget | null = detail
    ? {
        node: detail.ref.node,
        type: detail.ref.type,
        vmid: detail.ref.vmid,
        name: detail.name,
        status: detail.runtime.status
      }
    : null

  const points = useMemo(() => {
    if (!detail) return []
    return detail.metrics.map((point) => ({
      time: point.time,
      value: metric === 'cpu' ? point.cpu : point.maxmem > 0 ? point.mem / point.maxmem : 0
    }))
  }, [detail, metric])

  const configEntries = useMemo(() => {
    if (!detail) return []
    return Object.entries(detail.config)
      .filter(([key]) => !HIDDEN_CONFIG_KEYS.has(key) && !/^net\d+$/.test(key) && !/^(scsi|sata|virtio|ide)\d+$/.test(key))
      .sort(([a], [b]) => a.localeCompare(b))
  }, [detail])

  const networks = useMemo(() => {    if (!detail) return []
    return Object.entries(detail.config)
      .filter(([key]) => /^net\d+$/.test(key))
      .map(([key, value]) => ({ key, value: String(value), parsed: parseNetwork(value) }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [detail])

  // cloud-init 磁盘只能落在支持 images 内容的存储上。
  const ciStorages = useMemo(() => {
    if (!detail) return []
    const names = storages
      .filter(
        (storage) =>
          storage.node === detail.ref.node &&
          storage.active &&
          storage.content.includes('images')
      )
      .map((storage) => storage.storage)
    return Array.from(new Set(names)).sort()
  }, [storages, detail])

  const memoryRatio = detail && detail.runtime.maxmem > 0 ? detail.runtime.mem / detail.runtime.maxmem : 0
  const cpuDisplay = detail ? formatPercent(detail.runtime.cpu, 1) : '—'
  const netin = detail?.runtime.netin ?? 0
  const netout = detail?.runtime.netout ?? 0
  const diskread = detail?.runtime.diskread ?? 0
  const diskwrite = detail?.runtime.diskwrite ?? 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[760px]">
        <div className="shrink-0 border-b border-border px-5 pb-4 pt-4 pr-14">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{vmRef?.type?.toUpperCase() ?? 'QEMU'}</span>
            <span className="text-border-strong">/</span>
            <span className="font-mono">{vmRef?.vmid ?? '—'}</span>
            {detail && <VmStatusBadge status={detail.runtime.status} />}
            {refreshing && <Loader2 className="h-3 w-3 spin text-muted-foreground" aria-label="正在刷新" />}
            <span className="ml-auto flex items-center gap-2 font-mono">
              <span>{vmRef?.node ?? '—'}</span>
              <span className="text-border-strong">·</span>
              <span>QEMU {detail?.runtime.runningQemu ?? '—'}</span>
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2.5">
            {detail && <OsIcon os={detail.os} size="md" />}
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-[19px] font-semibold leading-6 tracking-[-0.01em]">
                {detail?.name ?? (loading ? '正在读取虚拟机…' : '虚拟机详情')}
              </SheetTitle>
              <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {detail ? (
                  <>
                    <span>{detail.os.name}{detail.os.version ? ` ${detail.os.version}` : ''}</span>
                    {detail.runtime.runningMachine && (
                      <>
                        <span className="text-border-strong">·</span>
                        <span className="font-mono">{detail.runtime.runningMachine}</span>
                      </>
                    )}
                    {detail.runtime.tags.length > 0 && (
                      <>
                        <span className="text-border-strong">·</span>
                        <span className="font-mono">{detail.runtime.tags.join(' / ')}</span>
                      </>
                    )}
                  </>
                ) : (
                  <span>{vmRef?.node ?? '—'}</span>
                )}
              </SheetDescription>
            </div>
          </div>

          {target && (
            <div className="mt-3 space-y-2">
              <VmDetailActionBar
                target={target}
                onAction={onAction}
                onConsole={onConsole}
                busy={actionBusy}
              />
              {/* 生命周期之外的运维操作，统一收在第二行，避免和启停按钮混在一起。 */}
              <div className="-ml-2 flex flex-wrap items-center gap-0.5">
                <ToolbarButton
                  icon={<Camera className="h-3.5 w-3.5" />}
                  label="快照"
                  onClick={() => {
                    setTab('snapshots')
                    setSnapshotOpen(true)
                  }}
                />
                <ToolbarButton
                  icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                  label="迁移"
                  disabled={nodes.length === 0}
                  onClick={() => setMigrateOpen(true)}
                />
                <ToolbarButton
                  icon={<Package className="h-3.5 w-3.5" />}
                  label={detail?.runtime.template ? '取消模板' : '转模板'}
                  onClick={() => setTemplateOpen(true)}
                />
                {detail?.ref.type === 'qemu' && (
                  <>
                    <ToolbarButton
                      icon={<CloudCog className="h-3.5 w-3.5" />}
                      label="cloud-init"
                      onClick={() => setCloudInitOpen(true)}
                    />
                    <ToolbarButton
                      icon={<Keyboard className="h-3.5 w-3.5" />}
                      label="组合键"
                      onClick={() => setSendKeyOpen(true)}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-5">
            <TabsList className="w-full gap-0 border-b border-border">
              {[
                ['overview', '概览'],
                ['hardware', '硬件'],
                ['network', '网络'],
                ['snapshots', '快照'],
                ['tasks', '任务']
              ].map(([value, label]) => (
                <TabsTrigger key={value} value={value} className="mr-5 flex-none">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading && !detail ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} className="h-[98px]" />
                  ))}
                </div>
                <Skeleton className="h-[230px]" />
                <Skeleton className="h-28" />
              </div>
            ) : error && !detail ? (
              <div className="border border-destructive/35 bg-destructive/[0.06] p-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-destructive">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  无法加载虚拟机状态
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setError(null)
                    setLoading(true)
                    if (vmRef) {
                      unwrap(window.pvevdi.vmDetail(vmRef))
                        .then(setDetail)
                        .catch((err) => setError(errorDetail(err)))
                        .finally(() => setLoading(false))
                    }
                  }}
                >
                  重试
                </Button>
              </div>
            ) : detail ? (
              <>
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <div className="grid grid-cols-2 border-y border-border/70 sm:grid-cols-4">
                    <MetricTile
                      label="CPU"
                      value={cpuDisplay}
                      suffix={`/ ${detail.runtime.cpus || '—'} vCPU`}
                      icon={<Cpu className="h-3 w-3" />}
                      detail={`压力 ${(detail.runtime.pressureCpu ?? 0).toFixed(1)}%`}
                    />
                    <MetricTile
                      label="内存"
                      value={formatBytes(detail.runtime.mem)}
                      suffix={`/ ${formatBytes(detail.runtime.maxmem)}`}
                      icon={<MemoryStick className="h-3 w-3" />}
                      progress={memoryRatio}
                      detail={`Balloon ${detail.runtime.balloon ? formatBytes(detail.runtime.balloon) : '未启用'}`}
                    />
                    <MetricTile
                      label="磁盘 I/O"
                      value={formatBytes(diskread + diskwrite)}
                      icon={<HardDrive className="h-3 w-3" />}
                      detail={`读 ${formatBytes(diskread)} · 写 ${formatBytes(diskwrite)}`}
                      className="sm:border-t-0 border-t border-border/60"
                    />
                    <MetricTile
                      label="网络"
                      value={formatBytes(netin + netout)}
                      icon={<Network className="h-3 w-3" />}
                      detail={`↓ ${formatBytes(netin)} · ↑ ${formatBytes(netout)}`}
                      className="border-t border-border/60 sm:border-t-0"
                    />
                  </div>

                  <div className="border-t border-border/70">
                    <SectionBar
                      icon={<Activity className="h-3.5 w-3.5" />}
                      title="性能遥测"
                      hint="最近 1 小时"
                      actions={
                        <div className="flex items-center">
                          {[
                            ['cpu', 'CPU'],
                            ['memory', '内存']
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setMetric(value as 'cpu' | 'memory')}
                              className={cn(
                                'h-6 px-2 text-[11px] transition-colors',
                                metric === value
                                  ? 'text-foreground underline decoration-brand decoration-2 underline-offset-4'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      }
                    />
                    <div className="px-2 pb-2 pt-3">
                      <AreaChart
                        points={points}
                        height={150}
                        color={metric === 'cpu' ? 'var(--brand)' : 'var(--info)'}
                        formatValue={(value) => formatPercent(value, 1)}
                        emptyLabel="RRD 遥测数据不足"
                      />
                    </div>
                  </div>

                  <div className="border-t border-border/70">
                    <SectionBar icon={<Info className="h-3.5 w-3.5" />} title="运行信息" />
                    <div className="grid grid-cols-2 gap-x-6 px-3 py-1.5 sm:grid-cols-4">
                      <Field label="运行时长" mono>{formatUptime(detail.runtime.uptime)}</Field>
                      <Field label="QMP 状态" mono>{detail.runtime.qmpStatus ?? '—'}</Field>
                      <Field label="Guest Agent">
                        <span className={detail.runtime.agentEnabled ? 'text-success' : 'text-muted-foreground'}>
                          {detail.runtime.agentEnabled ? '已启用' : '未启用'}
                        </span>
                      </Field>
                      <Field label="HA 托管" mono>{detail.runtime.haManaged ? 'YES' : 'NO'}</Field>
                      <Field label="进程 PID" mono>{detail.runtime.pid ?? '—'}</Field>
                      <Field label="宿主内存" mono>{detail.runtime.memhost ? formatBytes(detail.runtime.memhost) : '—'}</Field>
                      <Field label="I/O 压力" mono>{(detail.runtime.pressureIo ?? 0).toFixed(1)}%</Field>
                      <Field label="内存压力" mono>{(detail.runtime.pressureMemory ?? 0).toFixed(1)}%</Field>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="hardware" className="mt-0 space-y-4">
                  <div className="grid grid-cols-1 divide-y divide-border/70 border-y border-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                    <div className="px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">CPU 拓扑</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-mono text-[17px] font-medium text-foreground">
                          {String(detail.config.cores ?? '—')} × {String(detail.config.sockets ?? 1)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">cores × sockets</span>
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">{String(detail.config.cpu ?? '默认 CPU 类型')}</div>
                    </div>
                    <div className="px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">内存配置</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-mono text-[17px] font-medium text-foreground">{formatBytes(detail.runtime.maxmem)}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">MAX</span>
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {detail.runtime.balloon ? `Balloon ${formatBytes(detail.runtime.balloon)}` : '未配置 Balloon'}
                      </div>
                    </div>
                  </div>

                  {detail.runtime.status === 'running' && (
                    <div className="flex items-start gap-2 border border-warning/25 bg-warning/[0.05] px-3 py-2 text-[11px] leading-5 text-warning">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      虚拟机关机后才能修改配置、添加或移除磁盘；磁盘扩容也受此限制。
                    </div>
                  )}

                  <div className="border-t border-border/70">
                    <SectionBar
                      icon={<HardDrive className="h-3.5 w-3.5" />}
                      title="存储设备"
                      hint={detail.disks.length > 0 ? `${detail.disks.length}` : undefined}
                      actions={
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfigOpen(true)}
                            disabled={detail.runtime.status === 'running'}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            编辑配置
                          </Button>
                          {detail.ref.type === 'qemu' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAddDiskOpen(true)}
                              disabled={detail.runtime.status === 'running'}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              添加磁盘
                            </Button>
                          )}
                        </>
                      }
                    />
                    <div className="divide-y divide-border/60">
                      {detail.disks.length === 0 ? (
                        <div className="px-3 py-4 text-[11px] text-muted-foreground">未找到磁盘配置。</div>
                      ) : (
                        detail.disks.map((disk) => {
                          const normalDisk = /^(scsi|virtio|sata|ide)\d+$/.test(disk.key)
                          const canRemove = normalDisk || disk.isCdrom
                          return (
                            <div key={disk.key} className="flex items-center gap-2 px-3 py-2">
                              <span className="w-[52px] shrink-0 font-mono text-[11px] text-muted-foreground">{disk.key}</span>
                              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground" title={disk.volume}>
                                {disk.volume || '—'}
                              </span>
                              {disk.size !== undefined && (
                                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatBytes(disk.size)}</span>
                              )}
                              {disk.format && <span className="shrink-0 font-mono text-[10px] text-muted-foreground/80">{disk.format}</span>}
                              {disk.isCdrom && <Badge variant="info">CD-ROM</Badge>}
                              <div className="flex shrink-0 items-center gap-0.5">
                                {normalDisk && !disk.isCdrom && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`调整 ${disk.key} 容量`}
                                    title="调整容量"
                                    onClick={() => setResizeDisk(disk)}
                                    disabled={detail.runtime.status === 'running'}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canRemove && !(detail.ref.type === 'lxc' && disk.key === 'rootfs') && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`移除 ${disk.key}`}
                                    title="移除磁盘"
                                    onClick={() => setRemoveDisk(disk)}
                                    disabled={detail.runtime.status === 'running'}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="border-t border-border/70">
                    <SectionBar icon={<Server className="h-3.5 w-3.5" />} title="虚拟机配置" />
                    <div className="grid grid-cols-1 gap-x-6 px-3 py-1.5 sm:grid-cols-2">
                      {configEntries.map(([key, value]) => (
                        <DataRow key={key} label={CONFIG_LABELS[key] ?? key} mono={key !== 'description'}>
                          <span className="line-clamp-3 break-all">{displayConfigValue(key, value)}</span>
                        </DataRow>
                      ))}
                    </div>
                  </div>

                  <details className="border-t border-border/70">
                    <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground">
                      原始配置数据
                    </summary>
                    <pre className="max-h-64 overflow-auto border-t border-border bg-muted/40 p-3 font-mono text-[10px] leading-5 text-foreground">
                      {JSON.stringify(detail.config, null, 2)}
                    </pre>
                  </details>
                </TabsContent>

                <TabsContent value="network" className="mt-0 space-y-4">
                  <div className="flex flex-wrap items-center gap-4 border-y border-border/70 px-3 py-2 text-[11px]">
                    <span className="flex items-center gap-1.5 font-mono text-foreground">
                      <ArrowDownToLine className="h-3 w-3 text-success" />
                      RX {formatBytes(netin)}
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-foreground">
                      <ArrowUpFromLine className="h-3 w-3 text-info" />
                      TX {formatBytes(netout)}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {networks.length} 个虚拟接口
                    </span>
                  </div>

                  {networks.length === 0 ? (
                    <EmptyState icon={<Network className="h-5 w-5" />} title="没有网络接口" description="此虚拟机尚未配置虚拟网卡。" />
                  ) : (
                    <div className="border-t border-border/70">
                      <SectionBar icon={<Network className="h-3.5 w-3.5" />} title="虚拟网卡" hint={`${networks.length} 个`} />
                      <div className="divide-y divide-border/60">
                        {networks.map((network) => (
                          <div key={network.key} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">{network.key}</span>
                              <span className="font-mono text-[12px] text-foreground">{network.parsed.model}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">{network.parsed.mac ?? '自动 MAC'}</span>
                              {network.parsed.options.tag && <Badge variant="outline">VLAN {network.parsed.options.tag}</Badge>}
                              {network.parsed.options.firewall === '1' && <Badge variant="success">Firewall</Badge>}
                            </div>
                            <div className="mt-1.5 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
                              <Field label="桥接" mono>{network.parsed.options.bridge ?? '—'}</Field>
                              <Field label="速率限制" mono>{network.parsed.options.rate ?? '不限制'}</Field>
                              <Field label="MTU" mono>{network.parsed.options.mtu ?? '默认'}</Field>
                              <Field label="队列" mono>{network.parsed.options.queues ?? '默认'}</Field>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-border/70">
                    <SectionBar
                      icon={<Network className="h-3.5 w-3.5" />}
                      title="Guest Agent 网络"
                      hint="来自客户机"
                    />
                    <div>
                      {detail.agentInterfaces.length === 0 ? (
                        <div className="flex items-start gap-2 px-3 py-3 text-[11px] text-muted-foreground">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {detail.agentError ?? '客户机没有报告任何网络接口。'}
                        </div>
                      ) : (
                        detail.agentInterfaces.map((iface) => <AgentInterfaceRow key={iface.name} iface={iface} />)
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="snapshots" className="mt-0 space-y-3">
                  <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2">
                    <span className="text-[11px] text-muted-foreground">
                      显示 PVE 快照链，当前状态标记为 HEAD。悬停可回滚或删除。
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{detail.snapshots.length}</span>
                      <Button size="sm" variant="outline" onClick={() => setSnapshotOpen(true)}>
                        <Camera className="mr-1.5 h-3 w-3" />
                        新建快照
                      </Button>
                    </div>
                  </div>
                  {detail.snapshots.length === 0 ? (
                    <EmptyState
                      icon={<Clock className="h-5 w-5" />}
                      title="没有快照"
                      description="此虚拟机还没有创建快照，或当前账户无权读取快照信息。"
                    />
                  ) : (
                    <div className="border-y border-border/70">
                      {detail.snapshots.map((snapshot) => (
                        <SnapshotRow
                          key={snapshot.name}
                          snapshot={snapshot}
                          onRollback={setRollbackSnapshot}
                          onDelete={setDeleteSnapshot}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="tasks" className="mt-0 space-y-2">
                  <div className="flex items-center justify-between border-b border-border/70 pb-2">
                    <span className="text-[11px] text-muted-foreground">最近 12 条与 VMID 相关的任务。</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{detail.tasks.length}</span>
                  </div>
                  {detail.tasks.length === 0 ? (
                    <EmptyState icon={<Terminal className="h-5 w-5" />} title="没有任务记录" description="与当前虚拟机相关的任务尚未产生。" />
                  ) : (
                    <div className="divide-y divide-border/60 border-y border-border/70">
                      {detail.tasks.map((task) => (
                        <button
                          key={task.upid}
                          type="button"
                          onClick={() => onViewTask(task)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/60"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-foreground">{TASK_TYPE_LABELS[task.type] ?? task.type}</span>
                              <TaskStatusBadge status={task.status} />
                            </div>
                            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                              {formatFullDateTime(task.startTime * 1000)} · {formatDuration(task.duration)} · {task.user}
                            </div>
                          </div>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </>
            ) : null}
          </div>
        </Tabs>

        {detail && (
          <>
            <VmConfigDialog
              open={configOpen}
              onOpenChange={setConfigOpen}
              detail={detail}
              onSaved={onRefresh}
            />
            <AddDiskDialog
              open={addDiskOpen}
              onOpenChange={setAddDiskOpen}
              detail={detail}
              storages={storages}
              onSaved={onRefresh}
            />
            {resizeDisk && (
              <ResizeDiskDialog
                open={Boolean(resizeDisk)}
                onOpenChange={(open) => {
                  if (!open) setResizeDisk(null)
                }}
                detail={detail}
                disk={resizeDisk}
                onSaved={onRefresh}
              />
            )}
            {removeDisk && (
              <RemoveDiskDialog
                open={Boolean(removeDisk)}
                onOpenChange={(open) => {
                  if (!open) setRemoveDisk(null)
                }}
                detail={detail}
                disk={removeDisk}
                onSaved={onRefresh}
              />
            )}
            <SnapshotDialog
              open={snapshotOpen}
              onOpenChange={setSnapshotOpen}
              detail={detail}
              onSaved={onRefresh}
            />
            <SnapshotRollbackDialog
              open={Boolean(rollbackSnapshot)}
              onOpenChange={(open) => {
                if (!open) setRollbackSnapshot(null)
              }}
              detail={detail}
              snapshot={rollbackSnapshot}
              onSaved={onRefresh}
            />
            <SnapshotDeleteDialog
              open={Boolean(deleteSnapshot)}
              onOpenChange={(open) => {
                if (!open) setDeleteSnapshot(null)
              }}
              detail={detail}
              snapshot={deleteSnapshot}
              onSaved={onRefresh}
            />
            <MigrateDialog
              open={migrateOpen}
              onOpenChange={setMigrateOpen}
              detail={detail}
              nodes={nodes}
              onSaved={onRefresh}
            />
            <TemplateDialog
              open={templateOpen}
              onOpenChange={setTemplateOpen}
              detail={detail}
              onSaved={onRefresh}
            />
            <CloudInitDialog
              open={cloudInitOpen}
              onOpenChange={setCloudInitOpen}
              detail={detail}
              storages={ciStorages}
              onSaved={onRefresh}
            />
            <SendKeyDialog
              open={sendKeyOpen}
              onOpenChange={setSendKeyOpen}
              ref={detail.ref}
              vmName={detail.name}
              onSent={onRefresh}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
