import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  CloudCog,
  HardDrive,
  Keyboard,
  Package,
  TriangleAlert
} from 'lucide-react'
import type {
  CloudInitInput,
  MigrateInput,
  SnapshotInput,
  TemplateInput,
  VmDetail,
  VmRef,
  VmSendKeyInput,
  VmSnapshot
} from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input, Textarea } from '@renderer/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogField,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { formatFullDateTime } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] leading-[16px] text-foreground/80">{label}</div>
        {hint && <p className="mt-0.5 text-[10.5px] leading-[16px] text-muted-foreground/85">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        className="mt-0.5"
      />
    </div>
  )
}

function DialogError({ message }: { message: string | null }): React.JSX.Element | null {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 border border-destructive/35 bg-destructive/[0.06] px-3 py-2 text-[11px] leading-4 text-destructive">
      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

/** 供调用方统一处理「提交 → 成功提示 → 刷新」的样板流程。 */
function useSubmit(onSaved: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (
    task: () => Promise<{ message: string; detail?: string }>,
    onDone: () => void
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await task()
      toast.success(result.message, result.detail ? { description: result.detail } : undefined)
      onDone()
      onSaved()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, setError, run }
}

/* ------------------------------------------------------------------ 快照 */

export function SnapshotDialog({
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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [vmstate, setVmstate] = useState(false)
  const { busy, error, setError, run } = useSubmit(onSaved)

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setVmstate(false)
    setError(null)
  }, [open, setError])

  const running = detail.runtime.status === 'running'

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请填写快照名称。')
      return
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(trimmed)) {
      setError('快照名称只能包含字母、数字、下划线、点和短横线，且以字母或数字开头。')
      return
    }
    const input: SnapshotInput = {
      ref: detail.ref,
      name: trimmed,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(vmstate ? { vmstate: true } : {})
    }
    void run(
      async () => {
        const result = await unwrap(window.pvevdi.vmSnapshot(input))
        return { message: result.message, detail: result.upid }
      },
      () => onOpenChange(false)
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>新建快照</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground/70">{detail.name}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            记录当前磁盘状态，回滚时恢复到该时间点。
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <DialogField label="快照名称" hint="创建后不可重命名，建议带上时间或版本标识。">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="before-upgrade"
              autoFocus
              className="font-mono text-[12px]"
              aria-label="快照名称"
            />
          </DialogField>

          <DialogField label="描述" hint="可选，用于记录本次快照的动机。">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="升级系统前保留的状态"
              className="min-h-[68px] resize-none text-[12px] leading-5"
              aria-label="快照描述"
            />
          </DialogField>

          <div className="border-t border-border/70 pt-3.5">
            <ToggleRow
              label="同时保存内存状态"
              hint={
                running
                  ? '保存内存会让快照体积显著变大，但回滚后可直接继续运行。'
                  : '虚拟机未运行，仅保存磁盘状态。'
              }
              checked={vmstate}
              onChange={setVmstate}
              disabled={!running}
            />
          </div>

          <DialogError message={error} />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} loading={busy}>
            创建快照
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SnapshotRollbackDialog({
  open,
  onOpenChange,
  detail,
  snapshot,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: VmDetail
  snapshot: VmSnapshot | null
  onSaved: () => void
}): React.JSX.Element {
  const { busy, error, run } = useSubmit(onSaved)

  if (!snapshot) return <></>

  const submit = (): void => {
    void run(
      async () => {
        const result = await unwrap(
          window.pvevdi.vmSnapshot({ ref: detail.ref, name: snapshot.name, rollback: snapshot.name })
        )
        return { message: result.message, detail: result.upid }
      },
      () => onOpenChange(false)
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>回滚到快照</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground/70">{snapshot.name}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            当前磁盘状态会被覆盖，此后创建的快照将失效。
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <dl className="space-y-2 border-l-2 border-border-strong/70 pl-3">
            <div className="flex gap-3 text-[11.5px] leading-[18px]">
              <dt className="w-16 shrink-0 text-muted-foreground">快照时间</dt>
              <dd className="font-mono text-foreground">
                {snapshot.snaptime ? formatFullDateTime(snapshot.snaptime * 1000) : '—'}
              </dd>
            </div>
            {snapshot.description && (
              <div className="flex gap-3 text-[11.5px] leading-[18px]">
                <dt className="w-16 shrink-0 text-muted-foreground">备注</dt>
                <dd className="min-w-0 flex-1 text-foreground">{snapshot.description}</dd>
              </div>
            )}
            {snapshot.parent && (
              <div className="flex gap-3 text-[11.5px] leading-[18px]">
                <dt className="w-16 shrink-0 text-muted-foreground">父快照</dt>
                <dd className="font-mono text-foreground">{snapshot.parent}</dd>
              </div>
            )}
          </dl>

          <div className="flex items-start gap-2 border border-warning/35 bg-warning/[0.06] px-3 py-2 text-[11px] leading-4 text-warning">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            <span>回滚不可撤销，建议先对当前状态另行创建快照。</span>
          </div>
          <DialogError message={error} />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button variant="destructive" onClick={submit} loading={busy}>
            确认回滚
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SnapshotDeleteDialog({
  open,
  onOpenChange,
  detail,
  snapshot,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: VmDetail
  snapshot: VmSnapshot | null
  onSaved: () => void
}): React.JSX.Element {
  const { busy, error, run } = useSubmit(onSaved)

  if (!snapshot) return <></>

  const submit = (): void => {
    void run(
      async () => {
        const result = await unwrap(
          window.pvevdi.vmSnapshot({ ref: detail.ref, name: snapshot.name, delete: snapshot.name })
        )
        return { message: result.message, detail: result.upid }
      },
      () => onOpenChange(false)
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>删除快照</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground/70">{snapshot.name}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            删除后该时间点无法再回滚。
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex items-start gap-2 border border-destructive/35 bg-destructive/[0.06] px-3 py-2 text-[11px] leading-4 text-destructive">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              将删除快照「{snapshot.name}」及其占用的磁盘差异。
              {snapshot.vmstate && '该快照包含内存状态，删除后一并丢失。'}
            </span>
          </div>
          <DialogError message={error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button variant="destructive" onClick={submit} loading={busy}>
            删除快照
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ 迁移 */

export function MigrateDialog({
  open,
  onOpenChange,
  detail,
  nodes,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: VmDetail
  nodes: string[]
  onSaved: () => void
}): React.JSX.Element {
  const [target, setTarget] = useState('')
  const [online, setOnline] = useState(true)
  const [withLocalDisks, setWithLocalDisks] = useState(true)
  const [force, setForce] = useState(false)
  const { busy, error, setError, run } = useSubmit(onSaved)

  const candidates = useMemo(
    () => nodes.filter((node) => node && node !== detail.ref.node),
    [nodes, detail.ref.node]
  )

  useEffect(() => {
    if (!open) return
    setTarget(candidates[0] ?? '')
    setOnline(detail.runtime.status === 'running')
    setWithLocalDisks(true)
    setForce(false)
    setError(null)
  }, [open, candidates, detail.runtime.status, setError])

  const submit = (): void => {
    if (!target) {
      setError('请选择目标节点。')
      return
    }
    const input: MigrateInput = {
      ref: detail.ref,
      target,
      online,
      withLocalDisks,
      ...(force ? { force: true } : {})
    }
    void run(
      async () => {
        const result = await unwrap(window.pvevdi.vmMigrate(input))
        return { message: result.message, detail: result.upid }
      },
      () => onOpenChange(false)
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>迁移虚拟机</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground/70">{detail.name}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            当前位于 {detail.ref.node}，迁移由 PVE 任务队列执行。
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <DialogField label="目标节点">
            {candidates.length === 0 ? (
              <div className="border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                集群中没有其他可用节点。
              </div>
            ) : (
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger aria-label="目标节点">
                  <SelectValue placeholder="选择目标节点" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((node) => (
                    <SelectItem key={node} value={node}>
                      {node}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </DialogField>

          <div className="space-y-3 border-t border-border/70 pt-3.5">
            <ToggleRow
              label="在线迁移"
              hint="运行中的虚拟机不停机迁移；关闭则先停机再迁移。"
              checked={online}
              onChange={setOnline}
            />
            <ToggleRow
              label="迁移本地磁盘"
              hint="虚拟机磁盘位于本地存储时必须开启，否则会失败。"
              checked={withLocalDisks}
              onChange={setWithLocalDisks}
            />
            <ToggleRow
              label="强制迁移"
              hint="忽略部分前置检查，仅在明确知道后果时使用。"
              checked={force}
              onChange={setForce}
            />
          </div>

          <DialogError message={error} />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} loading={busy} disabled={candidates.length === 0}>
            开始迁移
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ 模板 */

export function TemplateDialog({
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
  const [template, setTemplate] = useState(true)
  const { busy, error, run } = useSubmit(onSaved)
  const running = detail.runtime.status === 'running'

  useEffect(() => {
    if (!open) return
    setTemplate(!detail.runtime.template)
  }, [open, detail.runtime.template])

  const submit = (): void => {
    const input: TemplateInput = { ref: detail.ref, template }
    void run(
      async () => {
        const result = await unwrap(window.pvevdi.vmTemplate(input))
        return { message: result.message, detail: result.upid }
      },
      () => onOpenChange(false)
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{template ? '转换为模板' : '取消模板标记'}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground/70">{detail.name}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            {template
              ? '模板用于克隆新虚拟机，转换后无法直接启动。'
              : '取消后会恢复为普通虚拟机，可以再次启动。'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex items-start gap-2 text-[11.5px] leading-[18px] text-muted-foreground">
            <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {template
                ? '转换前虚拟机会被标记为模板，磁盘仍占用原存储空间。'
                : '取消模板标记不会改动磁盘内容。'}
            </span>
          </div>
          {template && running && (
            <div className="flex items-start gap-2 border border-warning/35 bg-warning/[0.06] px-3 py-2 text-[11px] leading-4 text-warning">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>虚拟机正在运行，请先停机后再转换，否则 PVE 会拒绝该操作。</span>
            </div>
          )}
          <DialogError message={error} />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} loading={busy} disabled={template && running}>
            {template ? '转换为模板' : '取消模板标记'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------- cloud-init */

const CI_DEFAULTS = {
  user: '',
  password: '',
  sshKeys: '',
  ipconfig0: '',
  nameserver: '',
  searchdomain: '',
  citype: 'nocloud' as 'nocloud' | 'configdrive2'
}

export function CloudInitDialog({
  open,
  onOpenChange,
  detail,
  storages,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: VmDetail
  storages: string[]
  onSaved: () => void
}): React.JSX.Element {
  const [drive, setDrive] = useState('')
  const [user, setUser] = useState(CI_DEFAULTS.user)
  const [password, setPassword] = useState(CI_DEFAULTS.password)
  const [sshKeys, setSshKeys] = useState(CI_DEFAULTS.sshKeys)
  const [ipconfig0, setIpconfig0] = useState(CI_DEFAULTS.ipconfig0)
  const [nameserver, setNameserver] = useState(CI_DEFAULTS.nameserver)
  const [searchdomain, setSearchdomain] = useState(CI_DEFAULTS.searchdomain)
  const [citype, setCitype] = useState<'nocloud' | 'configdrive2'>(CI_DEFAULTS.citype)
  const { busy, error, setError, run } = useSubmit(onSaved)

  const config = detail.config
  const existingDrive = typeof config.ide2 === 'string' ? config.ide2 : ''

  useEffect(() => {
    if (!open) return
    setDrive(existingDrive)
    setUser(String(config.ciuser ?? ''))
    setPassword(String(config.cipassword ?? ''))
    setSshKeys(String(config.sshkeys ?? ''))
    setIpconfig0(String(config.ipconfig0 ?? ''))
    setNameserver(String(config.nameserver ?? ''))
    setSearchdomain(String(config.searchdomain ?? ''))
    const raw = String(config.citype ?? '')
    setCitype(raw === 'configdrive2' ? 'configdrive2' : 'nocloud')
    setError(null)
    // 仅在打开时用当前配置回填，避免编辑过程中被外部刷新覆盖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, setError])

  const submit = (): void => {
    const input: CloudInitInput = { ref: detail.ref }
    if (drive.trim()) input.addDrive = drive.trim()
    if (user.trim()) input.ciuser = user.trim()
    if (password) input.password = password
    if (sshKeys.trim()) input.sshKeys = sshKeys.trim()
    if (ipconfig0.trim()) input.ipconfig0 = ipconfig0.trim()
    if (nameserver.trim()) input.nameserver = nameserver.trim()
    if (searchdomain.trim()) input.searchdomain = searchdomain.trim()
    input.citype = citype

    if (!input.addDrive && !input.ciuser && !input.password && !input.sshKeys && !input.ipconfig0) {
      setError('请至少填写云主机名、密码、公钥或网络配置中的一项。')
      return
    }

    void run(
      async () => {
        const result = await unwrap(window.pvevdi.vmCloudInit(input))
        const describe =
          result.warnings && result.warnings.length > 0 ? result.warnings.join('；') : result.upid
        return { message: result.message, detail: describe }
      },
      () => onOpenChange(false)
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>cloud-init 配置</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground/70">{detail.name}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            写入内容在下一次开机时由云镜像读取，已运行的虚拟机需重启生效。
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <DialogField
            label="cloud-init 磁盘"
            hint={
              storages.length > 0
                ? '首次配置需要挂载一块 cloud-init 驱动器，例如 local-lvm:cloudinit。'
                : '存储列表不可用，可留空表示不新建驱动器。'
            }
          >
            <Input
              value={drive}
              onChange={(event) => setDrive(event.target.value)}
              placeholder={storages[0] ? `${storages[0]}:cloudinit` : 'local-lvm:cloudinit'}
              className="font-mono text-[12px]"
              aria-label="cloud-init 磁盘"
            />
          </DialogField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DialogField label="云主机名">
              <Input
                value={user}
                onChange={(event) => setUser(event.target.value)}
                placeholder="ubuntu"
                className="font-mono text-[12px]"
                aria-label="云主机名"
              />
            </DialogField>
            <DialogField label="初始密码">
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="留空表示不修改"
                type="text"
                className="font-mono text-[12px]"
                aria-label="初始密码"
              />
            </DialogField>
          </div>

          <DialogField label="SSH 公钥" hint="支持多行，每行一把公钥。">
            <Textarea
              value={sshKeys}
              onChange={(event) => setSshKeys(event.target.value)}
              rows={3}
              placeholder="ssh-ed25519 AAAA..."
              className="min-h-[76px] resize-none font-mono text-[11px] leading-5"
              aria-label="SSH 公钥"
            />
          </DialogField>

          <DialogField label="网络配置" hint="格式如 ip=10.0.0.20/24,gw=10.0.0.1，使用 DHCP 可填 ip=dhcp。">
            <Input
              value={ipconfig0}
              onChange={(event) => setIpconfig0(event.target.value)}
              placeholder="ip=dhcp"
              className="font-mono text-[12px]"
              aria-label="网络配置"
            />
          </DialogField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DialogField label="DNS 服务器">
              <Input
                value={nameserver}
                onChange={(event) => setNameserver(event.target.value)}
                placeholder="1.1.1.1 8.8.8.8"
                className="font-mono text-[12px]"
                aria-label="DNS 服务器"
              />
            </DialogField>
            <DialogField label="搜索域">
              <Input
                value={searchdomain}
                onChange={(event) => setSearchdomain(event.target.value)}
                placeholder="example.local"
                className="font-mono text-[12px]"
                aria-label="搜索域"
              />
            </DialogField>
          </div>

          <DialogField label="配置类型">
            <Select value={citype} onValueChange={(value) => setCitype(value as 'nocloud' | 'configdrive2')}>
              <SelectTrigger aria-label="配置类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nocloud">NoCloud</SelectItem>
                <SelectItem value="configdrive2">ConfigDrive v2</SelectItem>
              </SelectContent>
            </Select>
          </DialogField>

          <DialogError message={error} />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} loading={busy}>
            写入配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------------------------------------- 发送按键 */

const CTRL_ALT_DEL: Array<{ label: string; keys: string[] }> = [
  { label: 'Ctrl+Alt+Del', keys: ['ctrl', 'alt', 'delete'] },
  { label: 'Ctrl+Alt+Backspace', keys: ['ctrl', 'alt', 'backspace'] },
  { label: 'Ctrl+Alt+F2', keys: ['ctrl', 'alt', 'f2'] },
  { label: 'Alt+F4', keys: ['alt', 'f4'] }
]

const SEND_KEY_DEFAULTS = { ctrl: false, alt: false, shift: false, meta: false, key: '' }

export function SendKeyDialog({
  open,
  onOpenChange,
  ref: vmRef,
  vmName,
  onSent
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ref: VmRef
  vmName: string
  onSent: () => void
}): React.JSX.Element {
  const [mods, setMods] = useState(SEND_KEY_DEFAULTS)
  const [lastKeys, setLastKeys] = useState<string | null>(null)
  const { busy, error, setError, run } = useSubmit(onSent)

  useEffect(() => {
    if (!open) return
    setMods(SEND_KEY_DEFAULTS)
    setLastKeys(null)
    setError(null)
  }, [open, setError])

  const send = (keys: string[]): void => {
    const payload: VmSendKeyInput = { ref: vmRef, keys }
    void run(
      async () => {
        await unwrap(window.pvevdi.vmSendKey(payload))
        return { message: `已发送 ${keys.join('+')}` }
      },
      () => {
        // 连续发送多个组合键时保持弹窗打开，只回显上一次发送的内容。
        setLastKeys(keys.join('+'))
        onSent()
      }
    )
  }

  const sendCustom = (): void => {
    const keys: string[] = []
    if (mods.ctrl) keys.push('ctrl')
    if (mods.alt) keys.push('alt')
    if (mods.shift) keys.push('shift')
    if (mods.meta) keys.push('meta')
    const key = mods.key.trim()
    if (key) keys.push(key.toLowerCase())
    if (keys.length === 0) {
      setError('请至少选择一个修饰键或输入一个按键。')
      return
    }
    send(keys)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>发送组合键</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground/70">{vmName}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            按键直接送达虚拟键盘，不依赖控制台窗口是否打开。
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div>
            <div className="mb-2 text-[11.5px] font-medium text-foreground/80">常用组合</div>
            <div className="grid grid-cols-2 gap-2">
              {CTRL_ALT_DEL.map((item) => (
                <Button
                  key={item.label}
                  variant="outline"
                  size="sm"
                  className="justify-start font-mono text-[11px]"
                  disabled={busy}
                  onClick={() => send(item.keys)}
                >
                  <Keyboard className="mr-1.5 h-3 w-3" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/70 pt-3.5">
            <div className="mb-2 text-[11.5px] font-medium text-foreground/80">自定义组合</div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['ctrl', 'Ctrl'],
                  ['alt', 'Alt'],
                  ['shift', 'Shift'],
                  ['meta', 'Meta']
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMods((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className={cn(
                    'border px-2.5 py-1 font-mono text-[11px] transition-colors',
                    mods[key]
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground'
                  )}
                  aria-pressed={mods[key]}
                >
                  {label}
                </button>
              ))}
            </div>
            <Input
              value={mods.key}
              onChange={(event) => setMods((prev) => ({ ...prev, key: event.target.value }))}
              placeholder="按键，例如 delete / f2 / a"
              className="mt-2 font-mono text-[12px]"
              aria-label="按键"
            />
          </div>

          <DialogError message={error} />
          {lastKeys && !error && (
            <div className="border border-success/30 bg-success/[0.06] px-3 py-2 font-mono text-[11px] text-success">
              已发送 {lastKeys}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            关闭
          </Button>
          <Button onClick={sendCustom} loading={busy}>
            发送
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------- 快照行内操作菜单 */
