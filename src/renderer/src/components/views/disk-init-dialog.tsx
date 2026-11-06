import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, HardDrive, ShieldAlert } from 'lucide-react'
import type { DiskInitInput, DiskInitMode, NodeDiskInfo } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { formatBytes } from '@renderer/lib/format'

const MODES: Array<{ value: DiskInitMode; label: string; hint: string; storage: boolean }> = [
  { value: 'lvmthin', label: 'LVM-thin', hint: '虚拟机磁盘的默认选择，支持快照与精简分配。', storage: true },
  { value: 'lvm', label: 'LVM', hint: '传统 LVM 卷组，不支持快照与精简分配。', storage: true },
  { value: 'zfs', label: 'ZFS', hint: '带校验的文件系统，内存占用较高但数据更安全。', storage: true },
  { value: 'directory', label: '目录', hint: '把磁盘格式化为 ext4 并挂载为目录存储。', storage: true },
  { value: 'gpt', label: '仅 GPT 分区表', hint: '只写分区表，不创建存储。', storage: false },
  { value: 'wipe', label: '擦除磁盘', hint: '清除分区表与文件系统签名，磁盘变为空闲。', storage: false }
]

export function DiskInitDialog({
  open,
  onOpenChange,
  node,
  disk,
  onDone
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: string
  disk: NodeDiskInfo | null
  onDone: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState<DiskInitMode>('lvmthin')
  const [name, setName] = useState('')
  const [vgname, setVgname] = useState('')
  const [thinpool, setThinpool] = useState('data')
  const [path, setPath] = useState('')
  const [raidlevel, setRaidlevel] = useState('')
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 每次打开按磁盘重置一遍，避免上一块盘的名字残留
  useEffect(() => {
    if (!open) return
    setMode('lvmthin')
    const suggested = disk?.devpath.split('/').pop()?.replace(/[^A-Za-z0-9]/g, '') ?? ''
    setName(suggested ? `disk-${suggested}`.toLowerCase() : '')
    setVgname('')
    setThinpool('data')
    setPath('')
    setRaidlevel('')
    setForce(false)
    setError('')
  }, [open, disk?.devpath])

  const current = useMemo(() => MODES.find((item) => item.value === mode) ?? MODES[0], [mode])

  const submit = async (): Promise<void> => {
    if (!disk) return
    setError('')
    if (current.storage && !/^[A-Za-z][A-Za-z0-9._-]*$/.test(name.trim())) {
      setError('存储 ID 必须以字母开头，只能包含字母、数字、点、下划线和连字符。')
      return
    }
    const input: DiskInitInput = {
      node,
      devpath: disk.devpath,
      mode,
      ...(current.storage ? { name: name.trim() } : {}),
      ...(mode === 'lvm' || mode === 'lvmthin' ? { vgname: vgname.trim() || name.trim() } : {}),
      ...(mode === 'lvmthin' ? { thinpool: thinpool.trim() || 'data' } : {}),
      ...(mode === 'zfs' ? { zfsThin: true, raidlevel: raidlevel || undefined } : {}),
      ...(mode === 'directory' ? { path: path.trim() || `/mnt/${name.trim()}` } : {}),
      force: force || mode === 'wipe' || mode === 'gpt'
    }
    setBusy(true)
    try {
      await unwrap(window.pvevdi.diskInit(input))
      onOpenChange(false)
      onDone()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  const destructive = mode === 'wipe' || mode === 'gpt'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            初始化磁盘
          </DialogTitle>
          <DialogDescription>
            在节点 <span className="font-mono">{node}</span> 上操作{' '}
            <span className="font-mono text-foreground">{disk?.devpath ?? '—'}</span>
            {disk ? `（${formatBytes(disk.size)}）` : ''}。此操作会清空磁盘上原有的全部分区与数据。
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-1.5">
            <Label>用途</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as DiskInitMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[11px] leading-relaxed text-muted-foreground">{current.hint}</div>
          </div>

          {current.storage && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="disk-init-name">存储 ID</Label>
                <Input
                  id="disk-init-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="font-mono"
                  placeholder="disk-sda"
                />
              </div>
              {(mode === 'lvm' || mode === 'lvmthin') && (
                <div className="space-y-1.5">
                  <Label htmlFor="disk-init-vg">卷组名</Label>
                  <Input
                    id="disk-init-vg"
                    value={vgname}
                    onChange={(event) => setVgname(event.target.value)}
                    className="font-mono"
                    placeholder={name || 'disk-sda'}
                  />
                </div>
              )}
              {mode === 'lvmthin' && (
                <div className="space-y-1.5">
                  <Label htmlFor="disk-init-thin">thin 池名</Label>
                  <Input
                    id="disk-init-thin"
                    value={thinpool}
                    onChange={(event) => setThinpool(event.target.value)}
                    className="font-mono"
                    placeholder="data"
                  />
                </div>
              )}
              {mode === 'directory' && (
                <div className="space-y-1.5">
                  <Label htmlFor="disk-init-path">挂载路径</Label>
                  <Input
                    id="disk-init-path"
                    value={path}
                    onChange={(event) => setPath(event.target.value)}
                    className="font-mono"
                    placeholder={`/mnt/${name || 'data'}`}
                  />
                </div>
              )}
              {mode === 'zfs' && (
                <div className="space-y-1.5">
                  <Label>RAID 级别</Label>
                  <Select value={raidlevel || 'single'} onValueChange={(value) => setRaidlevel(value === 'single' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">单盘</SelectItem>
                      <SelectItem value="raid0">RAID0（条带）</SelectItem>
                      <SelectItem value="raid1">RAID1（镜像，需 2 块以上）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {current.storage && (
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <Switch id="disk-init-force" checked={force} onCheckedChange={setForce} />
              <Label htmlFor="disk-init-force">磁盘已有分区表，强制覆盖</Label>
            </div>
          )}

          <div
            className={
              destructive
                ? 'flex items-start gap-2 border border-destructive/30 bg-destructive/[0.05] px-3 py-2.5'
                : 'flex items-start gap-2 border border-warning/40 bg-warning/[0.05] px-3 py-2.5'
            }
          >
            {destructive ? (
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            )}
            <div className={destructive ? 'text-[11px] leading-relaxed text-destructive' : 'text-[11px] leading-relaxed text-muted-foreground'}>
              {destructive
                ? '擦除与分区表写入会立即丢弃磁盘上全部数据且不可撤销。若该磁盘仍被某个存储或虚拟机引用，请先移除引用。'
                : '初始化会重新分区并创建存储，磁盘上的现有数据将全部丢失。操作期间该磁盘不可用于其它用途。'}
            </div>
          </div>

          {disk?.used && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="warning">占用中</Badge>
              该磁盘当前已被 {disk.used} 使用，继续操作前请确认用途。
            </div>
          )}

          {error && <div className="text-[11px] text-destructive">{error}</div>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} loading={busy} onClick={() => void submit()}>
            {mode === 'wipe' ? '擦除' : mode === 'gpt' ? '写入分区表' : '初始化'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
