import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  HardDrive,
  Info,
  Loader2,
  MemoryStick,
  Network,
  Plus,
  Server
} from 'lucide-react'
import type { CreateOptions, DashboardData, VmAction } from '@shared/types'
import { GUEST_TYPES } from '@shared/ipc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Progress, Separator } from '@renderer/components/ui/primitives'
import { errorDetail, ClientApiError, unwrap } from '@renderer/lib/api'
import { formatBytes } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'

const NONE = '__none__'
const AUTO = '__auto__'

interface CreateVmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboard: DashboardData | null
  initialNode: string
  onCreated: (target: { node: string; vmid: number; type: 'qemu'; action?: VmAction }) => void
  onRefresh: () => void
}

type Mode = 'create' | 'clone'

interface FormState {
  node: string
  vmid: string
  name: string
  cores: string
  sockets: string
  memory: string
  ostype: string
  diskStorage: string
  diskSize: string
  iso: string
  bridge: string
  vlan: string
  start: boolean
  agent: boolean
  onboot: boolean
}

interface CloneState {
  node: string
  template: string
  vmid: string
  name: string
  storage: string
  full: boolean
  start: boolean
}

function Field({
  label,
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
    </div>
  )
}

function FormSection({
  icon,
  title,
  description,
  children
}: {
  index?: string
  icon: React.ReactNode
  title: string
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="border-b border-border px-5 py-4 last:border-b-0">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-panel text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-[12px] font-medium text-foreground">{title}</h3>
          {description && <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border border-border/80 bg-panel/40 px-2.5 py-2">
      <div>
        <div className="text-[12px] text-foreground">{title}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  )
}

export function CreateVmDialog({
  open,
  onOpenChange,
  dashboard,
  initialNode,
  onCreated,
  onRefresh
}: CreateVmDialogProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('create')
  const [options, setOptions] = useState<CreateOptions | null>(null)
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitDetail, setSubmitDetail] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    node: initialNode,
    vmid: '',
    name: '',
    cores: '2',
    sockets: '1',
    memory: '4096',
    ostype: 'l26',
    diskStorage: '',
    diskSize: '32',
    iso: NONE,
    bridge: '',
    vlan: '',
    start: true,
    agent: true,
    onboot: false
  })
  const [clone, setClone] = useState<CloneState>({
    node: initialNode,
    template: '',
    vmid: '',
    name: '',
    storage: AUTO,
    full: true,
    start: true
  })

  const onlineNodes = useMemo(
    () => (dashboard?.nodes ?? []).filter((node) => node.status === 'online'),
    [dashboard]
  )

  const watchNode = mode === 'clone' ? clone.node : form.node

  useEffect(() => {
    if (!open) return
    setSubmitError(null)
    setSubmitDetail(null)
    setMode('create')
    setOptions(null)
    setOptionsError(null)
    setForm((previous) => ({
      ...previous,
      node: initialNode || onlineNodes[0]?.node || previous.node,
      vmid: '',
      name: '',
      diskStorage: '',
      bridge: '',
      iso: NONE,
      vlan: ''
    }))
    setClone((previous) => ({
      ...previous,
      node: initialNode || onlineNodes[0]?.node || previous.node,
      template: '',
      vmid: '',
      name: '',
      storage: AUTO
    }))
    // Reset is intentionally scoped to opening the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !watchNode) return
    let cancelled = false
    setOptionsLoading(true)
    setOptionsError(null)
    unwrap(window.pvevdi.createOptions(watchNode))
      .then((next) => {
        if (cancelled) return
        setOptions(next)
        setForm((previous) => ({
          ...previous,
          vmid: previous.vmid || String(next.nextId),
          diskStorage:
            previous.diskStorage && next.storages.some((storage) => storage.storage === previous.diskStorage)
              ? previous.diskStorage
              : next.storages[0]?.storage ?? '',
          bridge:
            previous.bridge && next.bridges.some((bridge) => bridge.iface === previous.bridge)
              ? previous.bridge
              : next.bridges[0]?.iface ?? ''
        }))
        setClone((previous) => ({
          ...previous,
          vmid: previous.vmid || String(next.nextId)
        }))
      })
      .catch((err) => {
        if (cancelled) return
        setOptions(null)
        setOptionsError(errorDetail(err))
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, watchNode])

  const changeNode = (node: string): void => {
    if (mode === 'clone') {
      setClone((previous) => ({ ...previous, node }))
      setClone((previous) => ({ ...previous, template: '', vmid: '', storage: AUTO }))
    } else {
      setForm((previous) => ({ ...previous, node }))
    }
  }

  const changeTemplate = (value: string): void => {
    const template = options?.templates.find((item) => String(item.vmid) === value)
    setClone((previous) => ({
      ...previous,
      template: value,
      node: template?.node ?? previous.node,
      name: previous.name || (template ? `${template.name}-clone` : ''),
      vmid: previous.vmid || String(options?.nextId ?? '')
    }))
  }

  const createBlank = async (): Promise<void> => {
    if (!options) return
    if (!form.name.trim()) {
      setSubmitError('请输入虚拟机名称。')
      return
    }
    if (!form.diskStorage) {
      setSubmitError('请选择磁盘存储。')
      return
    }
    if (!form.bridge) {
      setSubmitError('请选择网络桥接。')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setSubmitDetail(null)
    try {
      const result = await unwrap(
        window.pvevdi.createVm({
          node: form.node,
          vmid: Number(form.vmid),
          name: form.name.trim(),
          cores: Number(form.cores),
          sockets: Number(form.sockets),
          memory: Number(form.memory),
          ostype: form.ostype,
          diskStorage: form.diskStorage,
          diskSize: Number(form.diskSize),
          iso: form.iso === NONE ? null : form.iso,
          bridge: form.bridge,
          vlanTag: form.vlan.trim() ? Number(form.vlan) : null,
          start: form.start,
          agent: form.agent,
          onboot: form.onboot
        })
      )
      toast.success(result.message, {
        description: result.warnings.length > 0 ? result.warnings.join(' ') : `节点 ${result.node} · 任务已提交`
      })
      onOpenChange(false)
      onRefresh()
      onCreated({ node: result.node, vmid: result.vmid, type: 'qemu' })
    } catch (err) {
      if (err instanceof ClientApiError) {
        setSubmitError(err.message)
        setSubmitDetail(err.detail ?? null)
      } else {
        setSubmitError(errorDetail(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const cloneTemplate = async (): Promise<void> => {
    if (!options) return
    if (!clone.template) {
      setSubmitError('请选择源模板。')
      return
    }
    if (!clone.name.trim()) {
      setSubmitError('请输入虚拟机名称。')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setSubmitDetail(null)
    try {
      const result = await unwrap(
        window.pvevdi.cloneVm({
          node: clone.node,
          templateVmid: Number(clone.template),
          vmid: Number(clone.vmid),
          name: clone.name.trim(),
          storage: clone.full && clone.storage !== AUTO ? clone.storage : null,
          full: clone.full,
          start: clone.start
        })
      )
      toast.success(result.message, {
        description: result.warnings.length > 0 ? result.warnings.join(' ') : `节点 ${result.node} · 任务已提交`
      })
      onOpenChange(false)
      onRefresh()
      onCreated({ node: result.node, vmid: result.vmid, type: 'qemu' })
    } catch (err) {
      if (err instanceof ClientApiError) {
        setSubmitError(err.message)
        setSubmitDetail(err.detail ?? null)
      } else {
        setSubmitError(errorDetail(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const selectedStorage = options?.storages.find((item) => item.storage === form.diskStorage)
  const selectedIso = options?.isos.find((item) => item.volid === form.iso)
  const selectedTemplate = options?.templates.find((item) => String(item.vmid) === clone.template)
  const noDisk = Boolean(options && options.storages.length === 0)
  const noBridge = Boolean(options && options.bridges.length === 0)
  const noTemplates = Boolean(options && options.templates.length === 0)
  const canSubmit = !submitting && Boolean(options) && !noDisk && !noBridge

  const createSummary = `${form.cores}C / ${form.memory} MiB / ${form.diskSize} GiB`

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next)
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] max-w-[880px] flex-col"
        onInteractOutside={(event) => {
          if (submitting) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0 pr-12">
          <DialogTitle>创建虚拟机</DialogTitle>
          <DialogDescription>
            通过 PVE API 创建新的 QEMU 虚拟机，或从现有模板克隆虚拟机。
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-stretch border-b border-border">
          {[
            { value: 'create' as const, label: '空白创建', description: '自定义硬件', icon: Plus },
            { value: 'clone' as const, label: '从模板克隆', description: '快速交付', icon: Copy }
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.value}
                type="button"
                disabled={submitting}
                onClick={() => setMode(item.value)}
                className={cn(
                  'relative flex flex-1 items-center gap-2.5 border-r border-border px-5 py-3 text-left transition-colors last:border-r-0',
                  mode === item.value ? 'bg-panel text-foreground' : 'text-muted-foreground hover:bg-panel/50'
                )}
              >
                {mode === item.value && <span className="absolute inset-x-0 top-0 h-[2px] bg-brand" />}
                <Icon className={cn('h-4 w-4', mode === item.value ? 'text-brand' : '')} />
                <span>
                  <span className="block text-[12px] font-medium">{item.label}</span>
                  <span className="block text-[10px] text-muted-foreground">{item.description}</span>
                </span>
                {mode === item.value && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
              </button>
            )
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {optionsLoading && !options && (
            <div className="mx-5 mt-4 flex items-center gap-2 border border-border bg-panel/40 px-3 py-2.5">
              <Loader2 className="h-3.5 w-3.5 spin text-brand" />
              <span className="text-[11px] text-muted-foreground">正在从 PVE 读取节点、存储与网络选项…</span>
            </div>
          )}

          {optionsError && (
            <div className="m-5 flex items-start gap-2 border border-destructive/35 bg-destructive/[0.06] p-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <div>
                <div className="text-[12px] text-destructive">无法加载创建选项</div>
                <div className="mt-1 text-[11px] text-destructive/80">{optionsError}</div>
              </div>
            </div>
          )}

          {submitError && (
            <div className="mx-5 mt-4 flex items-start gap-2 border border-destructive/35 bg-destructive/[0.06] p-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <div className="min-w-0">
                <div className="text-[12px] text-destructive">{submitError}</div>
                {submitDetail && <div className="mt-1 break-words font-mono text-[10px] text-destructive/70">{submitDetail}</div>}
              </div>
            </div>
          )}

          {mode === 'create' ? (
            <>
              <FormSection
                index="01"
                icon={<Server className="h-3.5 w-3.5" />}
                title="位置与标识"
                description="选择运行节点，并为新的虚拟机分配集群内唯一的 ID。"
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="目标节点" hint="NODE">
                    <Select value={form.node} onValueChange={changeNode} disabled={submitting || onlineNodes.length === 0}>
                      <SelectTrigger aria-label="目标节点">
                        <SelectValue placeholder="选择节点" />
                      </SelectTrigger>
                      <SelectContent>
                        {onlineNodes.map((node) => (
                          <SelectItem key={node.node} value={node.node}>
                            {node.node} · {node.maxcpu} 线程
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="虚拟机 ID" hint="VMID">
                    <Input
                      value={form.vmid}
                      onChange={(event) => setForm((previous) => ({ ...previous, vmid: event.target.value }))}
                      className="font-mono"
                      inputMode="numeric"
                      aria-label="虚拟机 ID"
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="名称" hint="MAX 64">
                    <Input
                      value={form.name}
                      onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                      placeholder="例如 vdi-win11-01"
                      aria-label="名称"
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="客户机类型" hint="OSTYPE">
                    <Select
                      value={form.ostype}
                      onValueChange={(value) => setForm((previous) => ({ ...previous, ostype: value }))}
                      disabled={submitting}
                    >
                      <SelectTrigger aria-label="客户机类型">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GUEST_TYPES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </FormSection>

              <FormSection
                index="02"
                icon={<Cpu className="h-3.5 w-3.5" />}
                title="计算与存储"
                description="CPU 采用 host 级性能策略，磁盘以精简卷创建。"
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <Field label="CPU 核心">
                    <Input
                      type="number"
                      min={1}
                      max={128}
                      value={form.cores}
                      onChange={(event) => setForm((previous) => ({ ...previous, cores: event.target.value }))}
                      className="font-mono"
                      aria-label="CPU 核心"
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="CPU 插槽">
                    <Input
                      type="number"
                      min={1}
                      max={8}
                      value={form.sockets}
                      onChange={(event) => setForm((previous) => ({ ...previous, sockets: event.target.value }))}
                      className="font-mono"
                      aria-label="CPU 插槽"
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="内存 (MiB)">
                    <Input
                      type="number"
                      min={256}
                      step={256}
                      value={form.memory}
                      onChange={(event) => setForm((previous) => ({ ...previous, memory: event.target.value }))}
                      className="font-mono"
                      aria-label="内存 MiB"
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="磁盘 (GiB)">
                    <Input
                      type="number"
                      min={1}
                      max={4096}
                      value={form.diskSize}
                      onChange={(event) => setForm((previous) => ({ ...previous, diskSize: event.target.value }))}
                      className="font-mono"
                      aria-label="磁盘 GiB"
                      disabled={submitting}
                    />
                  </Field>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <Field
                    label="磁盘存储"
                    hint={selectedStorage ? `${formatBytes(selectedStorage.avail)} 可用` : 'STORAGE'}
                  >
                    <Select
                      value={form.diskStorage}
                      onValueChange={(value) => setForm((previous) => ({ ...previous, diskStorage: value }))}
                      disabled={submitting || !options || options.storages.length === 0}
                    >
                      <SelectTrigger aria-label="磁盘存储">
                        <SelectValue placeholder={optionsLoading ? '加载存储…' : '选择镜像存储'} />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.storages.map((storage) => (
                          <SelectItem key={storage.storage} value={storage.storage}>
                            {storage.storage} · {storage.type} · {formatBytes(storage.avail)} 可用
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="space-y-1">
                    <Label className="opacity-0">容量</Label>
                    <div className="flex h-8 items-center gap-2 border border-border bg-panel/40 px-2.5">
                      <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-[12px] text-foreground">{form.diskSize} GiB</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">VirtIO SCSI</span>
                    </div>
                  </div>
                </div>
                {noDisk && (
                  <div className="mt-2 text-[11px] text-destructive">没有可用作虚拟机磁盘的存储，请先在 PVE 中启用 images 存储。</div>
                )}
              </FormSection>

              <FormSection
                index="03"
                icon={<Network className="h-3.5 w-3.5" />}
                title="网络与安装介质"
                description="默认使用 VirtIO 网卡与防火墙保护。可在创建后继续调整。"
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="网络桥接" hint="BRIDGE">
                    <Select
                      value={form.bridge}
                      onValueChange={(value) => setForm((previous) => ({ ...previous, bridge: value }))}
                      disabled={submitting || !options || options.bridges.length === 0}
                    >
                      <SelectTrigger aria-label="网络桥接">
                        <SelectValue placeholder={optionsLoading ? '加载网桥…' : '选择网络桥接'} />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.bridges.map((bridge) => (
                          <SelectItem key={bridge.iface} value={bridge.iface}>
                            {bridge.iface}
                            {bridge.comment ? ` · ${bridge.comment}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="VLAN 标记" hint="OPTIONAL">
                    <Input
                      type="number"
                      min={1}
                      max={4094}
                      value={form.vlan}
                      onChange={(event) => setForm((previous) => ({ ...previous, vlan: event.target.value }))}
                      placeholder="留空表示不标记"
                      className="font-mono"
                      aria-label="VLAN 标记"
                      disabled={submitting}
                    />
                  </Field>
                  <Field
                    label="安装镜像"
                    hint={selectedIso ? `${formatBytes(selectedIso.size)}` : 'OPTIONAL'}
                    className="col-span-2"
                  >
                    <Select
                      value={form.iso}
                      onValueChange={(value) => setForm((previous) => ({ ...previous, iso: value }))}
                      disabled={submitting || !options}
                    >
                      <SelectTrigger aria-label="安装镜像">
                        <SelectValue placeholder="不挂载安装镜像" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>不挂载安装镜像</SelectItem>
                        {options?.isos.map((iso) => (
                          <SelectItem key={iso.volid} value={iso.volid}>
                            {iso.label} · {formatBytes(iso.size)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                {form.iso !== NONE && (
                  <div className="mt-3 flex items-start gap-2 border border-info/25 bg-info/[0.05] p-2.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      已挂载 ISO，启动顺序将设为{' '}
                      <span className="font-mono text-foreground">IDE2 → SCSI0 → NET0</span>，
                      以便进入安装程序。安装完成后请在 PVE 中调整为磁盘优先。
                    </p>
                  </div>
                )}
              </FormSection>

              <FormSection
                index="04"
                icon={<MemoryStick className="h-3.5 w-3.5" />}
                title="运行选项"
                description="创建任务完成后执行启动操作。任务最长等待约 3 分钟。"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <ToggleRow
                    title="创建后启动"
                    description="等待任务完成后立即开机"
                    checked={form.start}
                    onCheckedChange={(checked) => setForm((previous) => ({ ...previous, start: checked }))}
                  />
                  <ToggleRow
                    title="启用 Guest Agent"
                    description="允许读取 IP 与客户机状态"
                    checked={form.agent}
                    onCheckedChange={(checked) => setForm((previous) => ({ ...previous, agent: checked }))}
                  />
                  <ToggleRow
                    title="随机启动"
                    description="PVE 启动时一并启动"
                    checked={form.onboot}
                    onCheckedChange={(checked) => setForm((previous) => ({ ...previous, onboot: checked }))}
                  />
                </div>
                {noBridge && (
                  <div className="mt-2 text-[11px] text-destructive">节点上没有活动网桥，无法创建带网络的虚拟机。</div>
                )}
              </FormSection>
            </>
          ) : (
            <>
              <FormSection
                index="01"
                icon={<Copy className="h-3.5 w-3.5" />}
                title="选择模板"
                description="模板必须位于目标节点，并已转换为 PVE template。"
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field
                    label="源模板"
                    hint={optionsLoading ? 'LOADING' : `${options?.templates.length ?? 0} AVAILABLE`}
                    className="col-span-2"
                  >
                    <Select
                      value={clone.template}
                      onValueChange={changeTemplate}
                      disabled={submitting || !options || noTemplates}
                    >
                      <SelectTrigger aria-label="源模板">
                        <SelectValue placeholder={optionsLoading ? '加载模板…' : noTemplates ? '没有可用模板' : '选择模板'} />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.templates.map((template) => (
                          <SelectItem key={template.vmid} value={String(template.vmid)}>
                            {template.vmid} · {template.name} ({template.node})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="目标节点" hint="TARGET">
                    <Select
                      value={clone.node}
                      onValueChange={changeNode}
                      disabled={submitting || onlineNodes.length === 0}
                    >
                      <SelectTrigger aria-label="克隆目标节点">
                        <SelectValue placeholder="选择节点" />
                      </SelectTrigger>
                      <SelectContent>
                        {onlineNodes.map((node) => (
                          <SelectItem key={node.node} value={node.node}>
                            {node.node}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="模板操作系统" hint="OSTYPE">
                    <div className="flex h-8 items-center gap-2 border border-border bg-panel/40 px-2.5 text-[12px] text-muted-foreground">
                      {selectedTemplate?.ostype
                        ? GUEST_TYPES.find((item) => item.value === selectedTemplate.ostype)?.label ?? selectedTemplate.ostype
                        : '—'}
                    </div>
                  </Field>
                </div>
                {noTemplates && (
                  <div className="mt-2 text-[11px] text-muted-foreground">此节点暂无可用模板。请先在 PVE 中将虚拟机转换为模板。</div>
                )}
              </FormSection>

              <FormSection
                index="02"
                icon={<Server className="h-3.5 w-3.5" />}
                title="新虚拟机标识"
                description="分配集群内唯一 ID，并设置新的虚拟机名称。"
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="虚拟机 ID" hint="VMID">
                    <Input
                      value={clone.vmid}
                      onChange={(event) => setClone((previous) => ({ ...previous, vmid: event.target.value }))}
                      className="font-mono"
                      inputMode="numeric"
                      aria-label="克隆虚拟机 ID"
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="名称" hint="MAX 64">
                    <Input
                      value={clone.name}
                      onChange={(event) => setClone((previous) => ({ ...previous, name: event.target.value }))}
                      placeholder="例如 vdi-win11-02"
                      aria-label="克隆名称"
                      disabled={submitting}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                index="03"
                icon={<HardDrive className="h-3.5 w-3.5" />}
                title="克隆选项"
                description="完整克隆会复制全部磁盘到独立卷；链接克隆依赖模板保留。"
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="目标存储" hint="FULL CLONE">
                    <Select
                      value={clone.storage}
                      onValueChange={(value) => setClone((previous) => ({ ...previous, storage: value }))}
                      disabled={submitting || !options || !clone.full}
                    >
                      <SelectTrigger aria-label="克隆目标存储">
                        <SelectValue placeholder="自动选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTO}>与模板相同 / 自动</SelectItem>
                        {options?.storages.map((storage) => (
                          <SelectItem key={storage.storage} value={storage.storage}>
                            {storage.storage} · {formatBytes(storage.avail)} 可用
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="space-y-1">
                    <Label className="opacity-0">类型</Label>
                    <div className="flex h-8 items-center gap-2 border border-border bg-panel/40 px-2.5">
                      <span className="text-[12px] text-foreground">{clone.full ? '完整克隆' : '链接克隆'}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {clone.full ? '独立磁盘' : '依赖模板'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ToggleRow
                    title="完整克隆"
                    description="复制全部磁盘，模板变更不影响新虚拟机"
                    checked={clone.full}
                    onCheckedChange={(checked) =>
                      setClone((previous) => ({ ...previous, full: checked, storage: checked ? previous.storage : AUTO }))
                    }
                  />
                  <ToggleRow
                    title="克隆后启动"
                    description="任务完成后立即启动新虚拟机"
                    checked={clone.start}
                    onCheckedChange={(checked) => setClone((previous) => ({ ...previous, start: checked }))}
                  />
                </div>
              </FormSection>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 bg-panel/30">
          {submitting ? (
            <div className="mr-auto flex min-w-0 flex-1 items-center gap-3">
              <Loader2 className="h-4 w-4 shrink-0 spin text-brand" />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-foreground">正在执行 PVE 任务，请勿关闭窗口</div>
                <div className="mt-1 h-px w-full overflow-hidden bg-border">
                  <div className="animate-pulse-line h-full w-1/3 bg-brand" />
                </div>
              </div>
            </div>
          ) : (
            <div className="mr-auto hidden items-center gap-3 text-[10px] text-muted-foreground sm:flex">
              <span className="font-mono">
                {mode === 'create' ? createSummary : selectedTemplate ? `TEMPLATE ${selectedTemplate.vmid}` : 'TEMPLATE —'}
              </span>
              <Separator orientation="vertical" className="h-3" />
              <span>任务由 PVE 异步执行</span>
            </div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={() => void (mode === 'create' ? createBlank() : cloneTemplate())}
            disabled={!canSubmit || (mode === 'clone' && !clone.template)}
            loading={submitting}
          >
            {mode === 'create' ? '创建虚拟机' : '开始克隆'}
            {!submitting && <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
