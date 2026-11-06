import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Cpu,
  HardDrive,
  MemoryStick,
  Settings2,
  Trash2
} from 'lucide-react'
import type {
  StorageSummary,
  VmConfigPatchInput,
  VmDetail,
  VmDiskInfo
} from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input, Textarea } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { formatBytes } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'

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

function Section({
  icon,
  title,
  description,
  children
}: {
  icon: React.ReactNode
  title: string
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div>
          <h3 className="text-[12px] font-medium text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function DialogError({ message }: { message: string | null }): React.JSX.Element | null {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 border border-destructive/35 bg-destructive/[0.05] p-3 text-[12px] leading-5 text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  )
}

export function VmConfigDialog({
  open,
  onOpenChange,
  detail,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: VmDetail
  onSaved: () => void
}): React.JSX.Element {
  const [cores, setCores] = useState('1')
  const [sockets, setSockets] = useState('1')
  const [memory, setMemory] = useState('1024')
  const [balloon, setBalloon] = useState('')
  const [cpu, setCpu] = useState('')
  const [machine, setMachine] = useState('')
  const [bios, setBios] = useState('seabios')
  const [boot, setBoot] = useState('')
  const [vga, setVga] = useState('')
  const [agent, setAgent] = useState(false)
  const [onboot, setOnboot] = useState(false)
  const [numa, setNuma] = useState(false)
  const [description, setDescription] = useState('')
  const [hostname, setHostname] = useState('')
  const [swap, setSwap] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isQemu = detail.ref.type === 'qemu'
  const running = detail.runtime.status === 'running'

  useEffect(() => {
    if (!open) return
    const config = detail.config
    setCores(String(config.cores ?? 1))
    setSockets(String(config.sockets ?? 1))
    setMemory(String(config.memory ?? 1024))
    setBalloon(config.balloon === undefined ? '' : String(config.balloon))
    setCpu(String(config.cpu ?? ''))
    setMachine(String(config.machine ?? ''))
    setBios(String(config.bios ?? 'seabios'))
    setBoot(String(config.boot ?? ''))
    setVga(String(config.vga ?? ''))
    setAgent(config.agent === 1 || config.agent === '1')
    setOnboot(config.onboot === 1 || config.onboot === '1')
    setNuma(config.numa === 1 || config.numa === '1')
    setDescription(String(config.description ?? ''))
    setHostname(String(config.hostname ?? detail.name ?? ''))
    setSwap(String(config.swap ?? 0))
    setError(null)
    setBusy(false)
  }, [open, detail])

  const save = async (): Promise<void> => {
    if (running) {
      setError('请先关闭虚拟机，再修改配置。')
      return
    }
    const coreCount = Number(cores)
    const socketCount = Number(sockets)
    const memoryValue = Number(memory)
    if (!Number.isInteger(coreCount) || coreCount < 1 || coreCount > 128) {
      setError('CPU 核心数必须在 1-128 之间。')
      return
    }
    if (!Number.isInteger(socketCount) || socketCount < 1 || socketCount > 8) {
      setError('CPU 插槽数必须在 1-8 之间。')
      return
    }
    if (!Number.isInteger(memoryValue) || memoryValue < 16 || memoryValue > 1_048_576) {
      setError('内存必须在 16 MiB - 1 TiB 之间。')
      return
    }
    const patch: VmConfigPatchInput['patch'] = isQemu
      ? {
          cores: coreCount,
          sockets: socketCount,
          memory: memoryValue,
          ...(balloon.trim() ? { balloon: Number(balloon) } : {}),
          ...(cpu.trim() ? { cpu: cpu.trim() } : {}),
          ...(machine.trim() ? { machine: machine.trim() } : {}),
          bios,
          ...(boot.trim() ? { boot: boot.trim() } : {}),
          ...(vga.trim() ? { vga: vga.trim() } : {}),
          agent: agent ? 1 : 0,
          onboot: onboot ? 1 : 0,
          numa: numa ? 1 : 0,
          description: description.trim()
        }
      : {
          cores: coreCount,
          memory: memoryValue,
          swap: Number(swap) || 0,
          hostname: hostname.trim(),
          onboot: onboot ? 1 : 0,
          description: description.trim()
        }

    setBusy(true)
    setError(null)
    try {
      const result = await unwrap(
        window.pvevdi.vmConfigUpdate({
          node: detail.ref.node,
          type: detail.ref.type,
          vmid: detail.ref.vmid,
          digest: typeof detail.config.digest === 'string' ? detail.config.digest : undefined,
          patch
        })
      )
      toast.success(result.message)
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>编辑虚拟机配置 · {detail.name}</DialogTitle>
          <DialogDescription>
            {running ? '虚拟机正在运行。请先关机，配置修改才会生效。' : '修改关机状态下的 CPU、内存和启动选项。'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <DialogError message={error} />
          {running && (
            <div className="flex items-start gap-2 border border-warning/25 bg-warning/[0.05] p-3 text-[11px] leading-5 text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              当前虚拟机正在运行，请先在详情页关机后再保存。
            </div>
          )}

          <Section icon={<Cpu className="h-3.5 w-3.5" />} title="计算" description="CPU 与内存配置。">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="CPU 核心">
                <Input value={cores} onChange={(event) => setCores(event.target.value)} inputMode="numeric" className="font-mono text-[12px]" aria-label="CPU 核心" />
              </Field>
              {isQemu && (
                <Field label="CPU 插槽">
                  <Input value={sockets} onChange={(event) => setSockets(event.target.value)} inputMode="numeric" className="font-mono text-[12px]" aria-label="CPU 插槽" />
                </Field>
              )}
              <Field label="内存 (MiB)">
                <Input value={memory} onChange={(event) => setMemory(event.target.value)} inputMode="numeric" className="font-mono text-[12px]" aria-label="内存 MiB" />
              </Field>
              {isQemu ? (
                <Field label="Balloon (MiB)" hint="留空表示不设置">
                  <Input value={balloon} onChange={(event) => setBalloon(event.target.value)} inputMode="numeric" className="font-mono text-[12px]" aria-label="内存气球 MiB" />
                </Field>
              ) : (
                <Field label="Swap (MiB)">
                  <Input value={swap} onChange={(event) => setSwap(event.target.value)} inputMode="numeric" className="font-mono text-[12px]" aria-label="Swap MiB" />
                </Field>
              )}
            </div>
          </Section>

          {isQemu && (
            <Section icon={<Settings2 className="h-3.5 w-3.5" />} title="CPU 与固件" description="修改 CPU 类型、机器类型和固件需要关机。">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="CPU 类型" hint="例如 host、x86-64-v2-AES">
                  <Input value={cpu} onChange={(event) => setCpu(event.target.value)} placeholder="默认" className="font-mono text-[12px]" aria-label="CPU 类型" />
                </Field>
                <Field label="机器类型" hint="例如 pc、q35">
                  <Input value={machine} onChange={(event) => setMachine(event.target.value)} placeholder="默认" className="font-mono text-[12px]" aria-label="机器类型" />
                </Field>
                <Field label="固件">
                  <Select value={bios} onValueChange={setBios}>
                    <SelectTrigger aria-label="固件类型">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seabios">SeaBIOS (BIOS)</SelectItem>
                      <SelectItem value="ovmf">OVMF (UEFI)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="显示设备" hint="例如 std、virtio、qxl">
                  <Input value={vga} onChange={(event) => setVga(event.target.value)} placeholder="默认" className="font-mono text-[12px]" aria-label="显示设备" />
                </Field>
              </div>
            </Section>
          )}

          {isQemu && (
            <Section icon={<MemoryStick className="h-3.5 w-3.5" />} title="启动与运行" description="启动顺序与 Guest Agent 选项。">
              <Field label="启动顺序" hint="例如 order=scsi0;ide2;net0">
                <Input value={boot} onChange={(event) => setBoot(event.target.value)} placeholder="默认启动顺序" className="font-mono text-[12px]" aria-label="启动顺序" />
              </Field>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { label: 'Guest Agent', value: agent, set: setAgent },
                  { label: '随机启动', value: onboot, set: setOnboot },
                  { label: 'NUMA', value: numa, set: setNuma }
                ].map((item) => (
                  <div key={item.label} className="flex h-9 items-center justify-between gap-3 border border-border bg-panel/30 px-3">
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">{item.label}</span>
                    <Switch checked={item.value} onCheckedChange={item.set} aria-label={item.label} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!isQemu && (
            <Section icon={<Settings2 className="h-3.5 w-3.5" />} title="容器" description="容器主机名和启动选项。">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="主机名">
                  <Input value={hostname} onChange={(event) => setHostname(event.target.value)} className="font-mono text-[12px]" aria-label="主机名" />
                </Field>
                <div className="flex h-9 items-center justify-between gap-3 border border-border bg-panel/30 px-3 sm:mt-6">
                  <span className="text-[11px] text-muted-foreground">随机启动</span>
                  <Switch checked={onboot} onCheckedChange={setOnboot} aria-label="随机启动" />
                </div>
              </div>
            </Section>
          )}

          <Section icon={<HardDrive className="h-3.5 w-3.5" />} title="描述" description="可选，仅保存在 PVE 配置中。">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="虚拟机用途、维护说明等"
              aria-label="虚拟机描述"
            />
          </Section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void save()} loading={busy} disabled={running}>
            保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AddDiskDialog({
  open,
  onOpenChange,
  detail,
  storages,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: VmDetail
  storages: StorageSummary[]
  onSaved: () => void
}): React.JSX.Element {
  const available = useMemo(
    () =>
      storages.filter(
        (storage) =>
          storage.node === detail.ref.node &&
          storage.active &&
          storage.content.includes('images')
      ),
    [detail.ref.node, storages]
  )
  const [storage, setStorage] = useState(available[0]?.storage ?? '')
  const [size, setSize] = useState('32')
  const [bus, setBus] = useState<'scsi' | 'virtio' | 'sata'>('scsi')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = detail.runtime.status === 'running'
  const defaultStorage = available[0]?.storage ?? ''

  useEffect(() => {
    if (!open) return
    setStorage(defaultStorage)
    setSize('32')
    setBus('scsi')
    setError(null)
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detail.ref.vmid, defaultStorage])

  const add = async (): Promise<void> => {
    if (running) {
      setError('请先关闭虚拟机。')
      return
    }
    const sizeValue = Number(size)
    if (!Number.isInteger(sizeValue) || sizeValue < 1 || sizeValue > 4096) {
      setError('磁盘大小必须在 1-4096 GiB 之间。')
      return
    }
    if (!storage) {
      setError('请选择磁盘存储。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await unwrap(
        window.pvevdi.vmDiskAdd({
          node: detail.ref.node,
          vmid: detail.ref.vmid,
          storage,
          sizeGiB: sizeValue,
          bus
        })
      )
      toast.success(result.message)
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader className="pr-10">
          <DialogTitle>添加磁盘 · {detail.name}</DialogTitle>
          <DialogDescription>为关机状态的 QEMU 虚拟机添加一块新磁盘。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">
          <DialogError message={error} />
          {running && (
            <div className="border border-warning/25 bg-warning/[0.05] p-3 text-[11px] leading-5 text-warning">
              虚拟机正在运行，请先关机。
            </div>
          )}
          {detail.ref.type !== 'qemu' ? (
            <div className="text-[11px] text-muted-foreground">容器磁盘请在 PVE 的容器资源中管理。</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="目标存储" hint="仅列出启用了 images 内容的活动存储。">
                  <Select value={storage} onValueChange={setStorage} disabled={busy || available.length === 0}>
                    <SelectTrigger aria-label="磁盘存储">
                      <SelectValue placeholder="选择存储" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((item) => (
                        <SelectItem key={item.storage} value={item.storage}>
                          {item.storage} · {item.type} · {formatBytes(item.avail)} 可用
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="容量 (GiB)">
                  <Input value={size} onChange={(event) => setSize(event.target.value)} inputMode="numeric" className="font-mono text-[12px]" aria-label="磁盘容量 GiB" />
                </Field>
                <Field label="总线类型">
                  <Select value={bus} onValueChange={(value) => setBus(value as 'scsi' | 'virtio' | 'sata')}>
                    <SelectTrigger aria-label="磁盘总线类型">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scsi">SCSI</SelectItem>
                      <SelectItem value="virtio">VirtIO Block</SelectItem>
                      <SelectItem value="sata">SATA</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-end">
                  <div className="flex h-9 w-full items-center justify-between border border-border bg-panel/30 px-3">
                    <span className="text-[11px] text-muted-foreground">精简分配</span>
                    <span className="font-mono text-[10px] text-muted-foreground">由 PVE 存储决定</span>
                  </div>
                </div>
              </div>
              {available.length === 0 && (
                <div className="text-[11px] text-destructive">当前节点没有可用的虚拟机磁盘存储。</div>
              )}
              <div className="flex items-start gap-2 border border-info/25 bg-info/[0.05] p-3 text-[11px] leading-5 text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                新磁盘会自动分配下一个空闲总线位置，保存后需在客户机内分区和格式化。
              </div>
            </>
          )}
        </div>
        <DialogFooter className="bg-panel/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void add()} loading={busy} disabled={running || available.length === 0 || detail.ref.type !== 'qemu'}>
            添加磁盘
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ResizeDiskDialog({
  open,
  onOpenChange,
  detail,
  disk,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: VmDetail
  disk: VmDiskInfo
  onSaved: () => void
}): React.JSX.Element {
  const [size, setSize] = useState('+10G')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = detail.runtime.status === 'running'

  useEffect(() => {
    if (!open) return
    setSize('+10G')
    setError(null)
    setBusy(false)
  }, [open, disk.key])

  const resize = async (): Promise<void> => {
    if (running) {
      setError('请先关闭虚拟机。')
      return
    }
    const value = size.trim()
    if (!/^\+?\d+(\.\d+)?[KMGT]?$/.test(value)) {
      setError('容量格式无效，例如 +10G 或 64G。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await unwrap(
        window.pvevdi.vmDiskResize({
          node: detail.ref.node,
          type: detail.ref.type,
          vmid: detail.ref.vmid,
          disk: disk.key,
          size: value
        })
      )
      toast.success(result.message, { description: result.upid ?? 'PVE 正在扩容磁盘。' })
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader className="pr-10">
          <DialogTitle>调整磁盘容量 · {disk.key}</DialogTitle>
          <DialogDescription>只能扩容，不能缩小磁盘。修改需要虚拟机处于关机状态。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">
          <DialogError message={error} />
          {running && (
            <div className="border border-warning/25 bg-warning/[0.05] p-3 text-[11px] leading-5 text-warning">
              虚拟机正在运行，请先关机。
            </div>
          )}
          <div className="flex items-center justify-between border border-border bg-panel/30 px-3 py-2.5">
            <span className="text-[11px] text-muted-foreground">当前容量</span>
            <span className="font-mono text-[12px] text-foreground">{disk.size ? formatBytes(disk.size) : '未知'}</span>
          </div>
          <Field label="新容量" hint="带 + 表示增量，例如 +10G；不带 + 表示目标总容量，例如 64G。">
            <Input
              value={size}
              onChange={(event) => setSize(event.target.value)}
              placeholder="+10G 或 64G"
              className="font-mono text-[12px]"
              aria-label="新磁盘容量"
              autoFocus
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {['+10G', '+50G', '+100G', '+500G'].map((preset) => (
              <Button key={preset} variant="outline" size="sm" onClick={() => setSize(preset)} disabled={busy}>
                {preset}
              </Button>
            ))}
          </div>
          <div className="text-[10px] leading-4 text-muted-foreground">
            磁盘卷：<span className="font-mono">{disk.volume}</span>
          </div>
        </div>
        <DialogFooter className="bg-panel/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void resize()} loading={busy} disabled={running}>
            扩容
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RemoveDiskDialog({
  open,
  onOpenChange,
  detail,
  disk,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: VmDetail
  disk: VmDiskInfo
  onSaved: () => void
}): React.JSX.Element {
  const [destroy, setDestroy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = detail.runtime.status === 'running'
  const canDestroy = !disk.isCdrom && Boolean(disk.volume && disk.volume.includes(':') && disk.volume !== 'none')

  useEffect(() => {
    if (!open) return
    setDestroy(false)
    setError(null)
    setBusy(false)
  }, [open, disk.key])

  const remove = async (): Promise<void> => {
    if (running) {
      setError('请先关闭虚拟机。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await unwrap(
        window.pvevdi.vmDiskRemove({
          node: detail.ref.node,
          type: detail.ref.type,
          vmid: detail.ref.vmid,
          disk: disk.key,
          destroy
        })
      )
      toast.success(result.message)
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader className="pr-10">
          <DialogTitle>移除磁盘 · {disk.key}</DialogTitle>
          <DialogDescription>从虚拟机配置中移除磁盘；可选择同时删除底层数据卷。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">
          <DialogError message={error} />
          {running && (
            <div className="border border-warning/25 bg-warning/[0.05] p-3 text-[11px] leading-5 text-warning">
              虚拟机正在运行，请先关机。
            </div>
          )}
          <div className="space-y-1.5 border border-border bg-panel/30 p-3 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">磁盘</span>
              <span className="font-mono text-foreground">{disk.key}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">卷</span>
              <span className="max-w-[300px] truncate font-mono text-foreground" title={disk.volume}>
                {disk.volume || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">容量</span>
              <span className="font-mono text-foreground">{disk.size ? formatBytes(disk.size) : '未知'}</span>
            </div>
          </div>
          {canDestroy && (
            <div className="flex items-center justify-between gap-4 border border-destructive/25 bg-destructive/[0.04] px-3 py-2.5">
              <div>
                <div className="text-[12px] text-foreground">同时删除数据卷</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">不可恢复。若磁盘被快照引用，PVE 可能拒绝删除。</div>
              </div>
              <Switch checked={destroy} onCheckedChange={setDestroy} aria-label="同时删除数据卷" />
            </div>
          )}
          <div className="flex items-start gap-2 text-[10px] leading-4 text-muted-foreground">
            <Trash2 className="mt-0.5 h-3 w-3 shrink-0" />
            仅移除配置而保留数据卷时，磁盘会继续占用存储空间。
          </div>
        </div>
        <DialogFooter className="bg-panel/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button variant="destructive" onClick={() => void remove()} loading={busy} disabled={running}>
            移除磁盘
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
