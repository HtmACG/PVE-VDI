import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  CalendarClock,
  Clock,
  Download,
  HardDriveDownload,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2
} from 'lucide-react'
import type { ApiError, BackupFile, BackupJob, BackupOverviewData, DashboardData, VmType } from '@shared/types'
import { PageHeader } from '@renderer/components/layout/page-header'
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
import { EmptyState } from '@renderer/components/common'
import { formatBytes, formatFullDateTime, relativeTime } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { PveUnavailable } from './pve-unavailable'

const MODES = [
  { value: 'snapshot', label: '快照模式（推荐）' },
  { value: 'suspend', label: '挂起模式' },
  { value: 'stop', label: '停止模式' }
]

const COMPRESS = [
  { value: 'zstd', label: 'ZSTD（推荐）' },
  { value: 'gzip', label: 'GZIP' },
  { value: 'lzo', label: 'LZO' },
  { value: 'none', label: '不压缩' }
]

interface BackupFormState {
  node: string
  storage: string
  vmid: string
  mode: 'snapshot' | 'suspend' | 'stop'
  compress: 'zstd' | 'gzip' | 'lzo' | 'none'
  removeOlder: string
}

interface RestoreFormState {
  file: BackupFile
  vmid: string
  targetStorage: string
  name: string
  unique: boolean
  start: boolean
}

interface JobFormState {
  id?: string
  storage: string
  schedule: string
  mode: string
  compress: string
  vmid: string
  comment: string
  enabled: boolean
}

function guessGuestType(file: BackupFile): VmType {
  return file.guestType ?? 'qemu'
}

export function BackupView({ dashboard, onRefresh }: { dashboard: DashboardData; onRefresh: () => void }): React.JSX.Element {
  const [overview, setOverview] = useState<BackupOverviewData | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [nodeFilter, setNodeFilter] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [backupForm, setBackupForm] = useState<BackupFormState | null>(null)
  const [restoreForm, setRestoreForm] = useState<RestoreFormState | null>(null)
  const [jobForm, setJobForm] = useState<JobFormState | null>(null)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.pvevdi.backupOverview()
    if (result.ok) {
      setOverview(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const nodes = dashboard.nodes.map((node) => node.node)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (overview?.files ?? [])
      .filter((file) => nodeFilter === 'all' || file.node === nodeFilter)
      .filter((file) => !q || file.filename.toLowerCase().includes(q) || String(file.vmid ?? '').includes(q))
  }, [overview?.files, nodeFilter, query])

  const defaultStorage = useMemo(
    () => dashboard.storages.find((storage) => storage.content.includes('backup'))?.storage ?? '',
    [dashboard.storages]
  )

  const openBackupForm = (): void => {
    setFormError('')
    setBackupForm({
      node: nodes[0] ?? '',
      storage: defaultStorage,
      vmid: '',
      mode: 'snapshot',
      compress: 'zstd',
      removeOlder: ''
    })
  }

  const submitBackup = async (): Promise<void> => {
    if (!backupForm) return
    setFormError('')
    if (!backupForm.node) return setFormError('请选择节点。')
    if (!backupForm.storage) return setFormError('请选择备份存储。')
    setBusy('backup-form')
    const result = await window.pvevdi.backupStart({
      node: backupForm.node,
      storage: backupForm.storage,
      vmid: backupForm.vmid.trim() ? Number(backupForm.vmid.trim()) : undefined,
      mode: backupForm.mode,
      compress: backupForm.compress,
      removeOlder: backupForm.removeOlder.trim() ? Number(backupForm.removeOlder.trim()) : undefined
    })
    setBusy(null)
    if (!result.ok) return setFormError(result.error.message)
    setBackupForm(null)
    setNotice(result.data.message)
    onRefresh()
    window.setTimeout(() => void load(), 3000)
  }

  const submitRestore = async (): Promise<void> => {
    if (!restoreForm) return
    setFormError('')
    const vmid = Number(restoreForm.vmid.trim())
    if (!Number.isInteger(vmid) || vmid < 100) return setFormError('请输入有效的虚拟机 ID（≥100）。')
    setBusy('restore-form')
    const result = await window.pvevdi.backupRestore({
      node: restoreForm.file.node,
      storage: restoreForm.file.storage,
      volid: restoreForm.file.volid,
      vmid,
      guestType: guessGuestType(restoreForm.file),
      unique: restoreForm.unique,
      start: restoreForm.start,
      name: restoreForm.name.trim() || undefined,
      pool: undefined
    })
    setBusy(null)
    if (!result.ok) return setFormError(result.error.message)
    setRestoreForm(null)
    setNotice(result.data.message)
    onRefresh()
  }

  const submitJob = async (): Promise<void> => {
    if (!jobForm) return
    setFormError('')
    if (!jobForm.storage) return setFormError('请选择备份存储。')
    if (!jobForm.schedule.trim()) return setFormError('请填写计划表达式。')
    setBusy('job-form')
    const result = await window.pvevdi.backupJobSave({
      id: jobForm.id,
      storage: jobForm.storage,
      schedule: jobForm.schedule.trim(),
      mode: jobForm.mode,
      compress: jobForm.compress,
      vmid: jobForm.vmid.trim() || undefined,
      comment: jobForm.comment.trim() || undefined,
      enabled: jobForm.enabled
    })
    setBusy(null)
    if (!result.ok) return setFormError(result.error.message)
    setJobForm(null)
    await load()
  }

  const removeJob = async (job: BackupJob): Promise<void> => {
    const result = await window.pvevdi.backupJobSave({
      id: job.id,
      storage: job.storage,
      schedule: job.schedule,
      delete: true
    })
    if (!result.ok) return
    await load()
  }

  const removeFile = async (file: BackupFile): Promise<void> => {
    setBusy(file.volid)
    const result = await window.pvevdi.storageContentDelete(file.node, file.storage, file.volid)
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await load()
    onRefresh()
  }

  if (error && !overview) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow={`${dashboard.cluster.name} 集群`} title="备份" description="备份状态与还原。" />
        <PveUnavailable error={error} onRetry={() => void load()} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="备份"
        description="创建 vzdump 备份、还原历史归档，并维护周期备份计划。"
        actions={
          <>
            <Button variant="surface" loading={loading} onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </Button>
            <Button variant="default" onClick={openBackupForm}>
              <Play className="h-3.5 w-3.5" />
              立即备份
            </Button>
          </>
        }
      />

      {notice && (
        <div className="flex items-center justify-between border border-success/40 bg-success/5 px-4 py-2.5 text-[12px] text-foreground">
          {notice}
          <button type="button" onClick={() => setNotice('')} className="text-[11px] text-muted-foreground hover:text-foreground">
            关闭
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
        {[
          ['归档数量', overview?.totals.count ?? 0],
          ['总占用', formatBytes(overview?.totals.size ?? 0)],
          ['备份计划', overview?.jobs.length ?? 0],
          ['启用计划', overview?.jobs.filter((job) => job.enabled).length ?? 0]
        ].map(([label, value]) => (
          <div key={String(label)} className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0">
            <div className="text-[12px] text-muted-foreground">{label}</div>
            <div className="mt-1.5 font-mono text-[19px] text-foreground">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <div className="border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
              <Archive className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">备份归档</span>
              <div className="relative ml-auto w-[220px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索文件名或 VMID…"
                  className="h-8 pl-8 text-[12px]"
                />
              </div>
              <Select value={nodeFilter} onValueChange={setNodeFilter}>
                <SelectTrigger className="h-8 w-[110px] text-[12px]">
                  <SelectValue placeholder="节点" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有节点</SelectItem>
                  {nodes.map((node) => (
                    <SelectItem key={node} value={node}>
                      {node}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-border bg-panel/30 text-[11px] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">归档</th>
                    <th className="px-3 py-2.5 font-medium">类型</th>
                    <th className="px-3 py-2.5 font-medium">VMID</th>
                    <th className="px-3 py-2.5 font-medium">大小</th>
                    <th className="px-3 py-2.5 font-medium">创建时间</th>
                    <th className="px-4 py-2.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((file) => (
                    <tr key={`${file.node}/${file.volid}`} className="border-b border-border/60 last:border-b-0 hover:bg-panel/40">
                      <td className="max-w-[320px] px-4 py-3">
                        <div className="truncate font-mono text-[11px] text-foreground">{file.filename}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {file.node} · {file.storage}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline">{file.guestType === 'lxc' ? 'LXC' : file.guestType === 'qemu' ? 'QEMU' : '未知'}</Badge>
                          {file.encrypted && <Badge variant="warning">加密</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{file.vmid ?? '—'}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-foreground">{formatBytes(file.size)}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                        {file.ctime ? formatFullDateTime(file.ctime * 1000) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFormError('')
                              setRestoreForm({
                                file,
                                vmid: String(file.vmid ?? 100),
                                targetStorage: '',
                                name: '',
                                unique: true,
                                start: false
                              })
                            }}
                          >
                            <RotateCcw className="h-3 w-3" />
                            还原
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            loading={busy === file.volid}
                            onClick={() => void removeFile(file)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <EmptyState
                icon={<Archive className="h-5 w-5" />}
                title="没有备份归档"
                description="在带「备份文件」权限的存储上执行一次备份后，归档会出现在这里。"
              />
            )}
            <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
              显示 {filtered.length} / {overview?.files.length ?? 0} 个归档
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <div className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">备份计划</span>
              <button
                type="button"
                onClick={() => {
                  setFormError('')
                  setJobForm({
                    storage: defaultStorage,
                    schedule: 'daily 02:00',
                    mode: 'snapshot',
                    compress: 'zstd',
                    vmid: '',
                    comment: '',
                    enabled: true
                  })
                }}
                className="ml-auto flex h-6 items-center gap-1 border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                新建
              </button>
            </div>
            <div className="divide-y divide-border/60">
              {(overview?.jobs ?? []).length > 0 && (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-panel/30 text-[11px] text-muted-foreground">
                      <th className="px-4 py-2 font-medium">计划</th>
                      <th className="px-3 py-2 font-medium">范围</th>
                      <th className="px-3 py-2 font-medium">目标存储</th>
                      <th className="px-3 py-2 font-medium">模式</th>
                      <th className="px-3 py-2 font-medium">下次运行</th>
                      <th className="px-3 py-2 font-medium">备注</th>
                      <th className="px-4 py-2 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.jobs ?? []).map((job) => (
                      <tr key={job.id} className="border-t border-border/60 hover:bg-panel/40">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="font-mono text-[11px] text-foreground">{job.schedule}</span>
                            {!job.enabled && <Badge variant="muted">停用</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                          {job.vmid ? `VMID ${job.vmid}` : job.all ? '全部虚拟机' : job.node ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{job.storage}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                          {job.mode} · {job.compress}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                          {job.nextRun ? formatFullDateTime(job.nextRun * 1000) : '—'}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2.5 text-[11px] text-muted-foreground">
                          {job.comment ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFormError('')
                                setJobForm({
                                  id: job.id,
                                  storage: job.storage,
                                  schedule: job.schedule,
                                  mode: job.mode,
                                  compress: job.compress,
                                  vmid: job.vmid ?? '',
                                  comment: job.comment ?? '',
                                  enabled: job.enabled
                                })
                              }}
                            >
                              编辑
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => void removeJob(job)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(overview?.jobs.length ?? 0) === 0 && (
                <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">暂无备份计划</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {overview && overview.warnings.length > 0 && (
        <div className="border border-warning/40 bg-warning/5 px-4 py-2.5 text-[11px] text-muted-foreground">
          {overview.warnings.join(' · ')}
        </div>
      )}

      <Dialog open={Boolean(backupForm)} onOpenChange={(open) => !open && setBackupForm(null)}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>立即备份</DialogTitle>
            <DialogDescription>调用 vzdump 创建备份，沿用 PVE 默认排除规则与保留策略。</DialogDescription>
          </DialogHeader>
          {backupForm && (
            <DialogBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>节点</Label>
                  <Select value={backupForm.node} onValueChange={(value) => setBackupForm({ ...backupForm, node: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择节点" />
                    </SelectTrigger>
                    <SelectContent>
                      {nodes.map((node) => (
                        <SelectItem key={node} value={node}>
                          {node}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>目标存储</Label>
                  <Select
                    value={backupForm.storage}
                    onValueChange={(value) => setBackupForm({ ...backupForm, storage: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择存储" />
                    </SelectTrigger>
                    <SelectContent>
                      {dashboard.storages
                        .filter((storage) => storage.content.includes('backup'))
                        .map((storage) => (
                          <SelectItem key={`${storage.node}/${storage.storage}`} value={storage.storage}>
                            {storage.storage} · {storage.node}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backup-vmid">虚拟机 ID</Label>
                <Input
                  id="backup-vmid"
                  value={backupForm.vmid}
                  onChange={(event) => setBackupForm({ ...backupForm, vmid: event.target.value })}
                  placeholder="留空则备份该节点全部虚拟机"
                  className="font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>备份模式</Label>
                  <Select
                    value={backupForm.mode}
                    onValueChange={(value) => setBackupForm({ ...backupForm, mode: value as BackupFormState['mode'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>压缩算法</Label>
                  <Select
                    value={backupForm.compress}
                    onValueChange={(value) =>
                      setBackupForm({ ...backupForm, compress: value as BackupFormState['compress'] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPRESS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backup-keep">只保留最近 N 份</Label>
                <Input
                  id="backup-keep"
                  value={backupForm.removeOlder}
                  onChange={(event) => setBackupForm({ ...backupForm, removeOlder: event.target.value })}
                  placeholder="留空表示不清理"
                  className="font-mono"
                />
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackupForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'backup-form'} onClick={() => void submitBackup()}>
              <HardDriveDownload className="h-3.5 w-3.5" />
              开始备份
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(restoreForm)} onOpenChange={(open) => !open && setRestoreForm(null)}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>还原备份</DialogTitle>
            <DialogDescription>
              {restoreForm ? `将从 ${restoreForm.file.filename} 还原为新的虚拟机。` : ''}
            </DialogDescription>
          </DialogHeader>
          {restoreForm && (
            <DialogBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="restore-vmid">新虚拟机 ID</Label>
                  <Input
                    id="restore-vmid"
                    value={restoreForm.vmid}
                    onChange={(event) => setRestoreForm({ ...restoreForm, vmid: event.target.value })}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="restore-name">名称</Label>
                  <Input
                    id="restore-name"
                    value={restoreForm.name}
                    onChange={(event) => setRestoreForm({ ...restoreForm, name: event.target.value })}
                    placeholder="可选"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>目标存储</Label>
                <Input
                  value={restoreForm.targetStorage}
                  onChange={(event) => setRestoreForm({ ...restoreForm, targetStorage: event.target.value })}
                  placeholder={`默认沿用 ${restoreForm.file.storage}`}
                  className="font-mono"
                />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="restore-unique"
                    checked={restoreForm.unique}
                    onCheckedChange={(checked) => setRestoreForm({ ...restoreForm, unique: checked })}
                  />
                  <Label htmlFor="restore-unique">为新虚拟机生成新的 MAC 地址</Label>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="restore-start"
                    checked={restoreForm.start}
                    onCheckedChange={(checked) => setRestoreForm({ ...restoreForm, start: checked })}
                  />
                  <Label htmlFor="restore-start">还原后立即启动</Label>
                </div>
              </div>
              <div className="border border-border bg-panel/40 px-3 py-2 font-mono text-[10px] text-muted-foreground">
                {restoreForm.file.volid}
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'restore-form'} onClick={() => void submitRestore()}>
              <Download className="h-3.5 w-3.5" />
              开始还原
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(jobForm)} onOpenChange={(open) => !open && setJobForm(null)}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{jobForm?.id ? '编辑备份计划' : '新建备份计划'}</DialogTitle>
            <DialogDescription>计划使用 PVE 日历表达式，例如 daily 02:00 或 weekly sun 03:30。</DialogDescription>
          </DialogHeader>
          {jobForm && (
            <DialogBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>目标存储</Label>
                  <Select value={jobForm.storage} onValueChange={(value) => setJobForm({ ...jobForm, storage: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择存储" />
                    </SelectTrigger>
                    <SelectContent>
                      {dashboard.storages
                        .filter((storage) => storage.content.includes('backup'))
                        .map((storage) => (
                          <SelectItem key={`${storage.node}/${storage.storage}`} value={storage.storage}>
                            {storage.storage} · {storage.node}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-schedule">计划表达式</Label>
                  <Input
                    id="job-schedule"
                    value={jobForm.schedule}
                    onChange={(event) => setJobForm({ ...jobForm, schedule: event.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>模式</Label>
                  <Select value={jobForm.mode} onValueChange={(value) => setJobForm({ ...jobForm, mode: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>压缩</Label>
                  <Select value={jobForm.compress} onValueChange={(value) => setJobForm({ ...jobForm, compress: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPRESS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-vmid">虚拟机 ID</Label>
                <Input
                  id="job-vmid"
                  value={jobForm.vmid}
                  onChange={(event) => setJobForm({ ...jobForm, vmid: event.target.value })}
                  placeholder="留空表示备份全部虚拟机"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-comment">备注</Label>
                <Input
                  id="job-comment"
                  value={jobForm.comment}
                  onChange={(event) => setJobForm({ ...jobForm, comment: event.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Switch
                  id="job-enabled"
                  checked={jobForm.enabled}
                  onCheckedChange={(checked) => setJobForm({ ...jobForm, enabled: checked })}
                />
                <Label htmlFor="job-enabled">启用该计划</Label>
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'job-form'} onClick={() => void submitJob()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
