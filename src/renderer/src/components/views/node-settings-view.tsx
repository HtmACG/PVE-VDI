import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Folder,
  Globe2,
  HardDrive,
  KeyRound,
  Layers3,
  ListTree,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Server,
  Settings2,
  Shield,
  Trash2,
  X
} from 'lucide-react'
import type {
  NodeCertificateInfo,
  NodeDirectoryStorage,
  NodeDiskInfo,
  NodeDnsSettings,
  NodeNetworkActionResult,
  NodeNetworkInput,
  NodeNetworkInterface,
  NodeNetworkType,
  NodeRepositorySummary,
  NodeSettingsData,
  NodeZfsPool
} from '@shared/types'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Input, Textarea } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Progress } from '@renderer/components/ui/primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { EmptyState } from '@renderer/components/common'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { formatBytes, formatDateTime, formatPercent } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'

type SectionId =
  | 'network'
  | 'certificates'
  | 'dns'
  | 'hostname'
  | 'options'
  | 'time'
  | 'syslog'
  | 'repositories'
  | 'firewall-options'
  | 'firewall-log'
  | 'lvm'
  | 'lvmthin'
  | 'directory'
  | 'zfs'

interface SettingsGroup {
  id: string
  label: string
  icon: LucideIcon
  items: Array<{ id: SectionId; label: string; icon: LucideIcon }>
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: 'system',
    label: '系统',
    icon: Settings2,
    items: [
      { id: 'network', label: '网络', icon: Network },
      { id: 'certificates', label: '凭据', icon: KeyRound },
      { id: 'dns', label: 'DNS', icon: Globe2 },
      { id: 'hostname', label: '主机', icon: Server },
      { id: 'options', label: '选项', icon: Settings2 },
      { id: 'time', label: '时间', icon: Clock3 },
      { id: 'syslog', label: '系统日志', icon: ScrollText }
    ]
  },
  {
    id: 'updates',
    label: '更新',
    icon: RefreshCw,
    items: [{ id: 'repositories', label: '存储库', icon: Database }]
  },
  {
    id: 'firewall',
    label: '防火墙',
    icon: Shield,
    items: [
      { id: 'firewall-options', label: '选项', icon: Settings2 },
      { id: 'firewall-log', label: '日志', icon: ScrollText }
    ]
  },
  {
    id: 'disks',
    label: '磁盘',
    icon: HardDrive,
    items: [
      { id: 'lvm', label: 'LVM', icon: Layers3 },
      { id: 'lvmthin', label: 'LVM-Thin', icon: Layers3 },
      { id: 'directory', label: '目录', icon: Folder },
      { id: 'zfs', label: 'ZFS', icon: Database }
    ]
  }
]

const SECTION_TITLES: Record<SectionId, string> = {
  network: '网络',
  certificates: '凭据',
  dns: 'DNS',
  hostname: '主机',
  options: '选项',
  time: '时间',
  syslog: '系统日志',
  repositories: '存储库',
  'firewall-options': '防火墙选项',
  'firewall-log': '防火墙日志',
  lvm: 'LVM',
  lvmthin: 'LVM-Thin',
  directory: '目录存储',
  zfs: 'ZFS'
}

const SECTION_DESCRIPTIONS: Record<SectionId, string> = {
  network: '查看和编辑节点网络接口。修改先写入待应用配置，应用后生效。',
  certificates: '节点证书信息，不显示私钥或完整证书内容。',
  dns: '配置节点的 DNS 搜索域与上游服务器。',
  hostname: '节点主机名与网络身份。',
  options: '节点描述与基础运行选项。',
  time: '节点时区与当前时间。',
  syslog: '节点系统日志。',
  repositories: 'APT 软件源配置。',
  'firewall-options': '节点防火墙运行参数。',
  'firewall-log': '节点防火墙日志。',
  lvm: 'LVM 卷组与剩余空间。',
  lvmthin: 'LVM-Thin 池使用情况。',
  directory: '目录类型存储。',
  zfs: 'ZFS 池与使用情况。'
}

function typeLabel(type: string): string {
  return (
    {
      bridge: '网桥',
      bond: 'Bond',
      eth: '物理网卡',
      vlan: 'VLAN',
      alias: '别名',
      OVSBridge: 'OVS 网桥',
      OVSBond: 'OVS Bond',
      OVSPort: 'OVS 端口',
      OVSIntPort: 'OVS 内部端口',
      vnet: 'SDN VNet',
      unknown: '未知'
    }[type] ?? type
  )
}

function interfaceAddress(iface: NodeNetworkInterface): string {
  if (iface.cidr) return iface.cidr
  if (iface.address) {
    return iface.netmask ? `${iface.address}/${iface.netmask}` : iface.address
  }
  if (iface.cidr6) return iface.cidr6
  return '未分配'
}

function networkPorts(iface: NodeNetworkInterface): string {
  return iface.bridge_ports || iface.slaves || iface['vlan-raw-device'] || '—'
}

function formatDate(seconds: number | undefined): string {
  if (!seconds) return '—'
  return formatDateTime(seconds * 1000, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function SectionShell({
  title,
  description,
  actions,
  children
}: {
  title: string
  description: string
  actions?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium text-foreground">{title}</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  className
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <div className="text-[10px] leading-4 text-muted-foreground">{hint}</div>}
    </div>
  )
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
  busy = false
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  destructive?: boolean
  busy?: boolean
}): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void onConfirm()
            }}
          >
            {busy ? '处理中…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface NetworkFormState {
  iface: string
  type: NodeNetworkType
  comments: string
  autostart: boolean
  mtu: string
  cidr: string
  gateway: string
  cidr6: string
  gateway6: string
  bridgePorts: string
  bridgeStp: boolean
  bridgeVlanAware: boolean
  bridgeVids: string
  slaves: string
  bondMode: string
  bondXmitHashPolicy: string
  vlanId: string
  vlanRawDevice: string
}

function formForInterface(iface: NodeNetworkInterface | null): NetworkFormState {
  return {
    iface: iface?.iface ?? '',
    type: ((iface?.type as NodeNetworkType) ?? 'bridge') as NodeNetworkType,
    comments: iface?.comments ?? '',
    autostart: iface?.autostart ?? true,
    mtu: iface?.mtu ? String(iface.mtu) : '',
    cidr:
      iface?.cidr ??
      (iface?.address ? (iface.netmask ? `${iface.address}/${iface.netmask}` : iface.address) : ''),
    gateway: iface?.gateway ?? '',
    cidr6: iface?.cidr6 ?? '',
    gateway6: iface?.gateway6 ?? '',
    bridgePorts: iface?.bridge_ports ?? '',
    bridgeStp: iface?.bridge_stp !== 'off',
    bridgeVlanAware: iface?.bridge_vlan_aware ?? false,
    bridgeVids: iface?.bridge_vids ?? '',
    slaves: iface?.slaves ?? '',
    bondMode: iface?.bond_mode ?? 'balance-rr',
    bondXmitHashPolicy: iface?.bond_xmit_hash_policy ?? 'layer2',
    vlanId: iface?.['vlan-id'] ? String(iface['vlan-id']) : '',
    vlanRawDevice: iface?.['vlan-raw-device'] ?? ''
  }
}

function NetworkEditorDialog({
  node,
  open,
  initial,
  onOpenChange,
  onSaved
}: {
  node: string
  open: boolean
  initial: NodeNetworkInterface | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<NetworkFormState>(() => formForInterface(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const existing = Boolean(initial)

  useEffect(() => {
    if (open) {
      setForm(formForInterface(initial))
      setError(null)
    }
  }, [open, initial])

  const set = <K extends keyof NetworkFormState>(key: K, value: NetworkFormState[K]): void =>
    setForm((previous) => ({ ...previous, [key]: value }))

  const save = async (): Promise<void> => {
    const iface = form.iface.trim()
    if (!iface) {
      setError('请输入网络接口名称。')
      return
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(iface)) {
      setError('接口名称只能包含字母、数字、点、下划线和短横线。')
      return
    }
    if (form.type === 'vlan' && (!form.vlanId || Number(form.vlanId) < 1 || Number(form.vlanId) > 4094)) {
      setError('VLAN ID 必须在 1 到 4094 之间。')
      return
    }
    if (form.mtu && (!Number.isInteger(Number(form.mtu)) || Number(form.mtu) < 576)) {
      setError('MTU 必须是大于等于 576 的整数。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const input: NodeNetworkInput = {
        node,
        iface,
        type: form.type,
        existing,
        comments: form.comments || undefined,
        autostart: form.autostart,
        mtu: form.mtu ? Number(form.mtu) : undefined,
        cidr: form.cidr || undefined,
        gateway: form.gateway || undefined,
        cidr6: form.cidr6 || undefined,
        gateway6: form.gateway6 || undefined,
        bridgePorts: form.bridgePorts || undefined,
        bridgeStp: form.bridgeStp,
        bridgeVlanAware: form.bridgeVlanAware,
        bridgeVids: form.bridgeVids || undefined,
        slaves: form.slaves || undefined,
        bondMode: form.bondMode || undefined,
        bondXmitHashPolicy: form.bondXmitHashPolicy || undefined,
        vlanId: form.vlanId ? Number(form.vlanId) : undefined,
        vlanRawDevice: form.vlanRawDevice || undefined
      }
      await unwrap(window.pvevdi.nodeNetworkSave(input))
      toast.success(existing ? '网络接口已更新' : '网络接口已创建', {
        description: '配置已写入 PVE 待应用队列，请点击“应用配置”后生效。'
      })
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? `编辑网络接口 · ${initial?.iface}` : '添加网络接口'}</DialogTitle>
          <DialogDescription>
            {existing ? '修改接口参数。保存后仍需在列表上方应用配置。' : '创建新的网桥、VLAN 或 Bond 接口。'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="border border-destructive/35 bg-destructive/[0.05] p-3 text-[11px] leading-5 text-destructive">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="接口名称">
              <Input
                value={form.iface}
                onChange={(event) => set('iface', event.target.value)}
                placeholder="例如 vmbr1"
                className="font-mono text-[11px]"
                disabled={existing}
                autoFocus
              />
            </Field>
            <Field label="类型">
              <Select
                value={form.type}
                onValueChange={(value) => set('type', value as NodeNetworkType)}
                disabled={existing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bridge">网桥</SelectItem>
                  <SelectItem value="vlan">VLAN</SelectItem>
                  <SelectItem value="bond">Bond</SelectItem>
                  <SelectItem value="eth">物理网卡</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="IPv4 CIDR" hint="留空表示不配置地址，例如 192.0.2.10/24。">
              <Input
                value={form.cidr}
                onChange={(event) => set('cidr', event.target.value)}
                placeholder="192.0.2.10/24"
                className="font-mono text-[11px]"
              />
            </Field>
            <Field label="IPv4 网关">
              <Input
                value={form.gateway}
                onChange={(event) => set('gateway', event.target.value)}
                placeholder="192.0.2.1"
                className="font-mono text-[11px]"
              />
            </Field>
            <Field label="IPv6 CIDR">
              <Input
                value={form.cidr6}
                onChange={(event) => set('cidr6', event.target.value)}
                placeholder="2001:db8::10/64"
                className="font-mono text-[11px]"
              />
            </Field>
            <Field label="IPv6 网关">
              <Input
                value={form.gateway6}
                onChange={(event) => set('gateway6', event.target.value)}
                placeholder="2001:db8::1"
                className="font-mono text-[11px]"
              />
            </Field>
            <Field label="MTU" hint="留空使用系统默认值。">
              <Input
                value={form.mtu}
                onChange={(event) => set('mtu', event.target.value)}
                inputMode="numeric"
                className="font-mono text-[11px]"
              />
            </Field>
            <div className="flex items-end">
              <div className="flex h-9 w-full items-center justify-between border border-border bg-panel/30 px-3">
                <span className="text-[11px] text-muted-foreground">随节点自动启动</span>
                <Switch checked={form.autostart} onCheckedChange={(value) => set('autostart', value)} />
              </div>
            </div>
          </div>

          {form.type === 'bridge' && (
            <div className="border-t border-border pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="桥接端口" hint="使用空格分隔多个接口，例如 enp1s0。">
                  <Input
                    value={form.bridgePorts}
                    onChange={(event) => set('bridgePorts', event.target.value)}
                    placeholder="enp1s0"
                    className="font-mono text-[11px]"
                  />
                </Field>
                <Field label="允许的 VLAN">
                  <Input
                    value={form.bridgeVids}
                    onChange={(event) => set('bridgeVids', event.target.value)}
                    placeholder="2-4094"
                    className="font-mono text-[11px]"
                    disabled={!form.bridgeVlanAware}
                  />
                </Field>
                <div className="flex h-9 items-center justify-between border border-border bg-panel/30 px-3">
                  <span className="text-[11px] text-muted-foreground">生成树协议 STP</span>
                  <Switch checked={form.bridgeStp} onCheckedChange={(value) => set('bridgeStp', value)} />
                </div>
                <div className="flex h-9 items-center justify-between border border-border bg-panel/30 px-3">
                  <span className="text-[11px] text-muted-foreground">VLAN 感知</span>
                  <Switch
                    checked={form.bridgeVlanAware}
                    onCheckedChange={(value) => set('bridgeVlanAware', value)}
                  />
                </div>
              </div>
            </div>
          )}

          {form.type === 'vlan' && (
            <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <Field label="VLAN ID">
                <Input
                  value={form.vlanId}
                  onChange={(event) => set('vlanId', event.target.value)}
                  inputMode="numeric"
                  placeholder="100"
                  className="font-mono text-[11px]"
                />
              </Field>
              <Field label="父接口">
                <Input
                  value={form.vlanRawDevice}
                  onChange={(event) => set('vlanRawDevice', event.target.value)}
                  placeholder="例如 enp1s0"
                  className="font-mono text-[11px]"
                />
              </Field>
            </div>
          )}

          {form.type === 'bond' && (
            <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <Field label="Bond 成员">
                <Input
                  value={form.slaves}
                  onChange={(event) => set('slaves', event.target.value)}
                  placeholder="使用空格分隔接口"
                  className="font-mono text-[11px]"
                />
              </Field>
              <Field label="Bond 模式">
                <Select value={form.bondMode} onValueChange={(value) => set('bondMode', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['balance-rr', 'active-backup', 'balance-xor', 'broadcast', '802.3ad', 'balance-tlb', 'balance-alb'].map(
                      (mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="哈希策略">
                <Select
                  value={form.bondXmitHashPolicy}
                  onValueChange={(value) => set('bondXmitHashPolicy', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="layer2">layer2</SelectItem>
                    <SelectItem value="layer2+3">layer2+3</SelectItem>
                    <SelectItem value="layer3+4">layer3+4</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          <Field label="备注">
            <Textarea
              value={form.comments}
              onChange={(event) => set('comments', event.target.value)}
              rows={3}
              placeholder="可选，填写接口用途"
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NetworkSection({
  node,
  data,
  onChanged
}: {
  node: string
  data: NodeSettingsData
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<NodeNetworkInterface | null>(null)
  const [deleting, setDeleting] = useState<NodeNetworkInterface | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [revertOpen, setRevertOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const startEdit = (iface: NodeNetworkInterface | null): void => {
    setEditing(iface)
    setEditorOpen(true)
  }

  const deleteIface = async (): Promise<void> => {
    if (!deleting) return
    setBusy(true)
    setActionError(null)
    try {
      await unwrap(window.pvevdi.nodeNetworkDelete(node, deleting.iface))
      toast.success('网络接口已删除', { description: '删除同样需要应用配置后生效。' })
      setDeleting(null)
      await onChanged()
    } catch (err) {
      setActionError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  const apply = async (): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      const result = await unwrap(window.pvevdi.nodeNetworkApply(node))
      toast.success('网络配置已提交', { description: result.upid ?? '请稍后确认节点网络状态。' })
      setApplyOpen(false)
      await onChanged()
    } catch (err) {
      setActionError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  const revert = async (): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      await unwrap(window.pvevdi.nodeNetworkRevert(node))
      toast.success('未应用的网络配置已还原')
      setRevertOpen(false)
      await onChanged()
    } catch (err) {
      setActionError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium text-foreground">网络</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">
            管理节点的物理网卡、网桥、VLAN 和 Bond。修改先写入待应用配置，应用后才会生效。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void onChanged()}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRevertOpen(true)}>
            还原未应用
          </Button>
          <Button variant="outline" size="sm" onClick={() => setApplyOpen(true)}>
            应用配置
          </Button>
          <Button size="sm" onClick={() => startEdit(null)}>
            <Plus className="h-3.5 w-3.5" />
            添加接口
          </Button>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-start gap-2 border border-warning/25 bg-warning/[0.035] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="text-[10px] leading-5 text-muted-foreground">
            应用网络配置可能会短暂中断节点管理连接。请确认当前有带外管理或本地终端访问能力后再操作。
          </div>
        </div>
        {actionError && (
          <div className="mb-3 border border-destructive/35 bg-destructive/[0.05] p-3 text-[11px] text-destructive">
            {actionError}
          </div>
        )}
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-border bg-panel/40 text-[10px] text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">接口</th>
                <th className="px-3 py-2.5 font-medium">类型</th>
                <th className="px-3 py-2.5 font-medium">地址</th>
                <th className="px-3 py-2.5 font-medium">网关</th>
                <th className="px-3 py-2.5 font-medium">端口 / 从属</th>
                <th className="px-3 py-2.5 font-medium">备注</th>
                <th className="px-3 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.network.map((iface) => (
                <tr key={iface.iface} className="border-b border-border/60 last:border-b-0">
                  <td className="px-3 py-3">
                    <div className="font-mono text-[11px] text-foreground">{iface.iface}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {iface.active ? '已启用' : '未启用'} · {iface.autostart ? '自动启动' : '手动启动'}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[11px] text-foreground">{typeLabel(iface.type)}</td>
                  <td className="px-3 py-3 font-mono text-[10px] text-foreground">{interfaceAddress(iface)}</td>
                  <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">{iface.gateway ?? '—'}</td>
                  <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">{networkPorts(iface)}</td>
                  <td className="max-w-[180px] truncate px-3 py-3 text-[10px] text-muted-foreground" title={iface.comments}>
                    {iface.comments?.trim() || '—'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`编辑 ${iface.iface}`} onClick={() => startEdit(iface)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {iface.type !== 'eth' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`删除 ${iface.iface}`}
                          onClick={() => setDeleting(iface)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.network.length === 0 && (
          <EmptyState icon={<Network className="h-5 w-5" />} title="没有网络接口" description="点击添加接口创建第一个网桥。" />
        )}
      </div>

      <NetworkEditorDialog
        node={node}
        open={editorOpen}
        initial={editing}
        onOpenChange={setEditorOpen}
        onSaved={() => void onChanged()}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title={`删除网络接口 ${deleting?.iface ?? ''}？`}
        description="删除会写入 PVE 待应用配置，不会立即生效。如果该接口承载当前管理连接，应用后可能失去节点访问。"
        confirmLabel="删除接口"
        destructive
        busy={busy}
        onConfirm={deleteIface}
      />
      <ConfirmDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        title="应用网络配置？"
        description="PVE 将重载网络配置。当前管理连接可能短暂中断，请确认你仍能通过其他方式访问节点。"
        confirmLabel="应用配置"
        busy={busy}
        onConfirm={apply}
      />
      <ConfirmDialog
        open={revertOpen}
        onOpenChange={setRevertOpen}
        title="还原未应用的网络配置？"
        description="尚未应用的网络接口修改会被丢弃，不会影响当前运行中的网络。"
        confirmLabel="还原配置"
        busy={busy}
        onConfirm={revert}
      />
    </div>
  )
}

function DnsSection({
  node,
  dns,
  onChanged
}: {
  node: string
  dns: NodeDnsSettings | null
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const [form, setForm] = useState<NodeDnsSettings>(dns ?? {})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(dns ?? {})
  }, [dns])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await unwrap(window.pvevdi.nodeDnsUpdate(node, form))
      toast.success('DNS 配置已保存')
      await onChanged()
    } catch (err) {
      toast.error('保存 DNS 失败', { description: errorDetail(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionShell
      title="DNS"
      description="配置节点的搜索域和 DNS 服务器。留空表示不设置该项。"
      actions={
        <Button size="sm" onClick={() => void save()} loading={saving}>
          保存 DNS
        </Button>
      }
    >
      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="搜索域" className="sm:col-span-2" hint="例如 example.com。">
          <Input
            value={form.search ?? ''}
            onChange={(event) => setForm((previous) => ({ ...previous, search: event.target.value }))}
            className="font-mono text-[11px]"
            placeholder="example.com"
          />
        </Field>
        <Field label="DNS 1">
          <Input
            value={form.dns1 ?? ''}
            onChange={(event) => setForm((previous) => ({ ...previous, dns1: event.target.value }))}
            className="font-mono text-[11px]"
            placeholder="192.0.2.53"
          />
        </Field>
        <Field label="DNS 2">
          <Input
            value={form.dns2 ?? ''}
            onChange={(event) => setForm((previous) => ({ ...previous, dns2: event.target.value }))}
            className="font-mono text-[11px]"
            placeholder="198.51.100.53"
          />
        </Field>
        <Field label="DNS 3">
          <Input
            value={form.dns3 ?? ''}
            onChange={(event) => setForm((previous) => ({ ...previous, dns3: event.target.value }))}
            className="font-mono text-[11px]"
            placeholder="203.0.113.53"
          />
        </Field>
      </div>
    </SectionShell>
  )
}

function TimeSection({
  node,
  time,
  onChanged
}: {
  node: string
  time: NodeSettingsData['time']
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const [timezone, setTimezone] = useState(time?.timezone ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTimezone(time?.timezone ?? '')
  }, [time?.timezone])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await unwrap(window.pvevdi.nodeTimeUpdate(node, timezone))
      toast.success('时区已保存')
      await onChanged()
    } catch (err) {
      toast.error('保存时区失败', { description: errorDetail(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionShell
      title="时间"
      description="设置节点时区。PVE 会自动同步系统时间。"
      actions={
        <Button size="sm" onClick={() => void save()} loading={saving} disabled={!timezone.trim()}>
          保存时区
        </Button>
      }
    >
      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="时区" hint="IANA 时区名称，例如 Asia/Shanghai；留空表示跟随系统。">
          <Input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Asia/Shanghai"
            className="font-mono text-[11px]"
          />
        </Field>
        <div className="border border-border bg-panel/30 p-3">
          <div className="text-[10px] text-muted-foreground">节点当前时间</div>
          <div className="mt-1 text-[12px] text-foreground">
            {time ? formatDateTime(time.localtime * 1000) : '—'}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {time && Math.abs(time.time - time.localtime) > 60 ? '节点时间与浏览器时间存在差异' : '时间已同步'}
          </div>
        </div>
      </div>
    </SectionShell>
  )
}

function OptionsSection({
  node,
  description,
  onChanged
}: {
  node: string
  description: string
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState(description)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(description)
  }, [description])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await unwrap(window.pvevdi.nodeOptionsUpdate(node, draft))
      toast.success('节点描述已保存')
      await onChanged()
    } catch (err) {
      toast.error('保存节点配置失败', { description: errorDetail(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionShell
      title="节点选项"
      description="节点描述和基础信息。网络相关选项请使用网络页面。"
      actions={
        <Button size="sm" onClick={() => void save()} loading={saving}>
          保存描述
        </Button>
      }
    >
      <div className="max-w-3xl space-y-4">
        <Field label="节点描述">
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="border border-border bg-panel/30 p-3">
            <div className="text-[10px] text-muted-foreground">节点名称</div>
            <div className="mt-1 font-mono text-[11px] text-foreground">{node}</div>
          </div>
          <div className="border border-border bg-panel/30 p-3">
            <div className="text-[10px] text-muted-foreground">启动行为</div>
            <div className="mt-1 text-[11px] text-foreground">由 PVE 节点配置管理</div>
          </div>
        </div>
      </div>
    </SectionShell>
  )
}

function HostnameSection({
  node,
  dns,
  network
}: {
  node: string
  dns: NodeDnsSettings | null
  network: NodeNetworkInterface[]
}): React.JSX.Element {
  const addresses = network
    .filter((item) => interfaceAddress(item) !== '未分配')
    .map((item) => ({ iface: item.iface, address: interfaceAddress(item) }))

  return (
    <SectionShell title="主机" description="节点主机名和网络身份。主机名由 PVE 系统管理。">
      <div className="max-w-3xl">
        <div className="border border-border">
          {[
            ['主机名', node],
            ['DNS 搜索域', dns?.search ?? '—'],
            ['管理地址', addresses.map((entry) => `${entry.iface}: ${entry.address}`).join('  ·  ') || '—']
          ].map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-6 border-b border-border/60 px-3 py-2.5 last:border-b-0">
              <span className="text-[11px] text-muted-foreground">{label}</span>
              <span className="max-w-[70%] text-right font-mono text-[11px] text-foreground">{value}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
          修改节点主机名需要同时更新系统主机名和网络配置，当前版本仅展示，避免误操作导致节点失联。
        </p>
      </div>
    </SectionShell>
  )
}

function CertificatesSection({ certificates }: { certificates: NodeCertificateInfo[] }): React.JSX.Element {
  return (
    <SectionShell title="凭据" description="节点证书的主体、签发者、有效期与指纹。不返回私钥或 PEM 内容。">
      {certificates.length === 0 ? (
        <EmptyState icon={<KeyRound className="h-5 w-5" />} title="没有证书信息" description="节点未返回证书详情。" />
      ) : (
        <div className="space-y-3">
          {certificates.map((cert) => (
            <div key={cert.filename} className="border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-[11px] text-foreground">{cert.filename}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(cert.notbefore)} — {formatDate(cert.notafter)}
                </span>
              </div>
              <dl className="px-3 py-2 text-[11px]">
                {[
                  ['主体', cert.subject ?? '—'],
                  ['签发者', cert.issuer ?? '—'],
                  ['指纹', cert.fingerprint ?? '—'],
                  ['公钥', `${cert.publicKeyType ?? '—'} ${cert.publicKeyBits ?? ''}`.trim()],
                  ['SAN', cert.san.join(', ') || '—']
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-6 border-b border-border/50 py-1.5 last:border-b-0">
                    <dt className="shrink-0 text-muted-foreground">{label}</dt>
                    <dd className="max-w-[76%] break-all text-right font-mono text-[10px] text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function RepositoriesSection({ repositories }: { repositories: NodeRepositorySummary | null }): React.JSX.Element {
  return (
    <SectionShell title="存储库" description="节点 APT 软件源。当前版本只展示，不直接修改存储库配置。">
      {!repositories ? (
        <EmptyState icon={<Database className="h-5 w-5" />} title="无法读取存储库" />
      ) : (
        <div className="space-y-4">
          {repositories.errors.length > 0 && (
            <div className="border border-warning/25 bg-warning/[0.035] p-3 text-[10px] leading-5 text-warning">
              {repositories.errors.join(' · ')}
            </div>
          )}
          {repositories.standardRepos.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-medium text-foreground">标准组件</div>
              <div className="flex flex-wrap gap-2">
                {repositories.standardRepos.map((repo) => (
                  <span key={repo.handle} className="border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    {repo.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
            {repositories.sources.map((source) => (
              <div key={source.path} className="border border-border">
                <div className="border-b border-border px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  {source.path}
                  {source.fileType ? ` · ${source.fileType}` : ''}
                </div>
                <div className="divide-y divide-border/60">
                  {source.repositories.map((repo, index) => (
                    <div key={`${source.path}-${index}`} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={repo.enabled ? 'text-[10px] text-success' : 'text-[10px] text-muted-foreground'}>
                          {repo.enabled ? '启用' : '禁用'}
                        </span>
                        <span className="font-mono text-[10px] text-foreground">
                          {repo.uris.join(' ')} {repo.suites.join(' ')} {repo.components.join(' ')}
                        </span>
                      </div>
                      {repo.comment && <div className="mt-1 text-[10px] text-muted-foreground">{repo.comment}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionShell>
  )
}

function FirewallOptionsSection({ options }: { options: Record<string, unknown> | null }): React.JSX.Element {
  const entries = options ? Object.entries(options).filter(([key]) => key !== 'digest') : []
  return (
    <SectionShell title="防火墙选项" description="节点防火墙运行参数。当前版本只展示，不直接修改防火墙规则。">
      {entries.length === 0 ? (
        <EmptyState icon={<Shield className="h-5 w-5" />} title="没有防火墙选项" />
      ) : (
        <dl className="max-w-3xl border border-border">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-start justify-between gap-6 border-b border-border/60 px-3 py-2.5 last:border-b-0">
              <dt className="font-mono text-[10px] text-muted-foreground">{key}</dt>
              <dd className="max-w-[68%] break-all text-right font-mono text-[10px] text-foreground">
                {Array.isArray(value) ? value.join(', ') : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </SectionShell>
  )
}

function LogsSection({ node, title, kind }: { node: string; title: string; kind: 'syslog' | 'firewall' }): React.JSX.Element {
  const [lines, setLines] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const entries = await unwrap(window.pvevdi.nodeLogs(node, kind))
      setLines(entries.map((entry) => entry.t))
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLines(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, kind])

  return (
    <SectionShell
      title={title}
      description={kind === 'syslog' ? '节点系统日志，最近 200 行。' : '节点防火墙日志，最近 200 行。'}
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      }
    >
      {error ? (
        <div className="border border-destructive/30 bg-destructive/[0.05] p-3 text-[11px] text-destructive">{error}</div>
      ) : lines === null || loading ? (
        <div className="flex items-center gap-2 py-6 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 spin" />
          正在读取日志
        </div>
      ) : (
        <pre className="max-h-[540px] overflow-auto border border-border bg-background p-3 font-mono text-[10px] leading-5 text-foreground">
          {lines.length ? lines.join('\n') : '没有日志。'}
        </pre>
      )}
    </SectionShell>
  )
}

function LvmSection({ groups }: { groups: NodeSettingsData['lvm'] }): React.JSX.Element {
  return (
    <SectionShell title="LVM" description="LVM 卷组容量与剩余空间。">
      {groups.length === 0 ? (
        <EmptyState icon={<Layers3 className="h-5 w-5" />} title="没有 LVM 卷组" />
      ) : (
        <div className="border border-border">
          {groups.map((group) => (
            <div key={group.name} className="border-b border-border/60 px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[12px] text-foreground">{group.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {formatBytes(group.free)} 可用 / {formatBytes(group.size)}
                </span>
              </div>
              <Progress value={group.size > 0 ? ((group.size - group.free) / group.size) * 100 : 0} className="mt-2 h-1" />
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function LvmThinSection({ pools }: { pools: NodeSettingsData['lvmthin'] }): React.JSX.Element {
  return (
    <SectionShell title="LVM-Thin" description="LVM-Thin 池容量与元数据使用情况。">
      {pools.length === 0 ? (
        <EmptyState icon={<Layers3 className="h-5 w-5" />} title="没有 LVM-Thin 池" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {pools.map((pool) => (
            <div key={`${pool.vg}/${pool.lv}`} className="border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[12px] text-foreground">{pool.vg}/{pool.lv}</span>
                <span className="text-[10px] text-muted-foreground">{formatPercent(pool.lvSize > 0 ? pool.used / pool.lvSize : 0, 1)}</span>
              </div>
              <Progress value={pool.lvSize > 0 ? (pool.used / pool.lvSize) * 100 : 0} className="mt-2 h-1" />
              <div className="mt-2 text-[10px] text-muted-foreground">
                {formatBytes(pool.used)} / {formatBytes(pool.lvSize)} · 元数据 {pool.metadataSize ? formatBytes(pool.metadataUsed ?? 0) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function DirectorySection({ directories }: { directories: NodeDirectoryStorage[] }): React.JSX.Element {
  return (
    <SectionShell title="目录存储" description="目录类型存储及其容量。">
      {directories.length === 0 ? (
        <EmptyState icon={<Folder className="h-5 w-5" />} title="没有目录存储" />
      ) : (
        <div className="border border-border">
          {directories.map((entry) => (
            <div key={entry.path} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-b-0">
              <div>
                <div className="font-mono text-[11px] text-foreground">{entry.path}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {entry.storage ?? entry.type ?? '目录'}
                </div>
              </div>
              <div className="text-right text-[10px] text-muted-foreground">
                {entry.used !== undefined && entry.total !== undefined
                  ? `${formatBytes(entry.used)} / ${formatBytes(entry.total)}`
                  : '容量不可用'}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function ZfsSection({ pools }: { pools: NodeZfsPool[] }): React.JSX.Element {
  return (
    <SectionShell title="ZFS" description="ZFS 池容量与健康状态。">
      {pools.length === 0 ? (
        <EmptyState icon={<Database className="h-5 w-5" />} title="没有 ZFS 池" />
      ) : (
        <div className="border border-border">
          {pools.map((pool) => (
            <div key={pool.name} className="border-b border-border/60 px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[12px] text-foreground">{pool.name}</span>
                <span className="text-[10px] text-muted-foreground">{pool.health ?? '—'}</span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {pool.size ? `${formatBytes(pool.alloc ?? (pool.size - (pool.free ?? 0)))} / ${formatBytes(pool.size)}` : '容量不可用'}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

export function NodeSettingsView({
  node,
  clusterName,
  onBack
}: {
  node: string
  clusterName: string
  onBack: () => void
}): React.JSX.Element {
  const [data, setData] = useState<NodeSettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<SectionId>('network')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    system: true,
    updates: true,
    firewall: true,
    disks: true
  })

  const load = async (): Promise<void> => {
    setRefreshing(true)
    setError(null)
    try {
      const next = await unwrap(window.pvevdi.nodeSettings(node))
      setData(next)
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setData(null)
    setLoading(true)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])

  const sectionContent = (): React.ReactNode => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 px-5 py-10 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 spin" />
          正在读取节点设置
        </div>
      )
    }
    if (error) {
      return (
        <div className="px-5 py-10">
          <div className="border border-destructive/35 bg-destructive/[0.05] p-4 text-[11px] text-destructive">{error}</div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            重试
          </Button>
        </div>
      )
    }
    if (!data) return null

    switch (active) {
      case 'network':
        return <NetworkSection node={node} data={data} onChanged={load} />
      case 'dns':
        return <DnsSection node={node} dns={data.dns} onChanged={load} />
      case 'time':
        return <TimeSection node={node} time={data.time} onChanged={load} />
      case 'options':
        return (
          <OptionsSection
            node={node}
            description={typeof data.config?.description === 'string' ? data.config.description : ''}
            onChanged={load}
          />
        )
      case 'hostname':
        return <HostnameSection node={node} dns={data.dns} network={data.network} />
      case 'certificates':
        return <CertificatesSection certificates={data.certificates} />
      case 'repositories':
        return <RepositoriesSection repositories={data.repositories} />
      case 'firewall-options':
        return <FirewallOptionsSection options={data.firewallOptions} />
      case 'firewall-log':
        return <LogsSection node={node} title="防火墙日志" kind="firewall" />
      case 'syslog':
        return <LogsSection node={node} title="系统日志" kind="syslog" />
      case 'lvm':
        return <LvmSection groups={data.lvm} />
      case 'lvmthin':
        return <LvmThinSection pools={data.lvmthin} />
      case 'directory':
        return <DirectorySection directories={data.directories} />
      case 'zfs':
        return <ZfsSection pools={data.zfs} />
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${clusterName} 集群`}
        title="节点设置"
        description={`${node} · 网络、系统、防火墙与磁盘配置`}
        actions={
          <>
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" />
              返回节点
            </Button>
            <Button variant="outline" onClick={() => void load()} loading={refreshing}>
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </Button>
          </>
        }
      />

      <div className="grid overflow-hidden border border-border bg-card xl:grid-cols-[222px_minmax(0,1fr)]">
        <aside className="border-b border-border xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-2 border-b border-border px-3 py-3">
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-[11px] text-foreground">{node}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">节点</span>
          </div>
          <nav className="py-2">
            {SETTINGS_GROUPS.map((group) => {
              const GroupIcon = group.icon
              const isExpanded = expanded[group.id]
              return (
                <div key={group.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => setExpanded((previous) => ({ ...previous, [group.id]: !isExpanded }))}
                    className="flex h-7 w-full items-center gap-2 px-3 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <GroupIcon className="h-3.5 w-3.5" />
                    <span>{group.label}</span>
                  </button>
                  {isExpanded && (
                    <div>
                      {group.items.map((item) => {
                        const Icon = item.icon
                        const selected = active === item.id
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-section={item.id}
                            onClick={() => setActive(item.id)}
                            className={cn(
                              'relative flex h-8 w-full items-center gap-2.5 pl-9 pr-3 text-left text-[11px] transition-colors',
                              selected
                                ? 'bg-panel text-foreground'
                                : 'text-muted-foreground hover:bg-panel/60 hover:text-foreground'
                            )}
                          >
                            {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-brand" />}
                            <Icon className={cn('h-3.5 w-3.5', selected ? 'text-brand' : 'text-muted-foreground')} />
                            <span>{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          {data && data.warnings.length > 0 && (
            <div className="flex items-start gap-2 border-b border-warning/25 bg-warning/[0.035] px-5 py-2.5 text-[10px] leading-5 text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {data.warnings.join(' · ')}
            </div>
          )}
          {sectionContent()}
        </div>
      </div>
    </div>
  )
}
