import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Database,
  FolderOpen,
  HardDrive,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react'
import type {
  ApiError,
  DashboardData,
  PvePoolSummary,
  StorageContentData,
  StorageContentEntry,
  StorageDefinition,
  StorageOverviewData
} from '@shared/types'
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
import { formatBytes, formatFullDateTime } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { PveUnavailable } from './pve-unavailable'

const CONTENT_TYPES = [
  { value: 'images', label: '磁盘镜像' },
  { value: 'rootdir', label: '容器目录' },
  { value: 'vztmpl', label: '容器模板' },
  { value: 'iso', label: 'ISO 镜像' },
  { value: 'backup', label: '备份文件' },
  { value: 'snippets', label: '代码片段' }
]

const STORAGE_TYPES = [
  'dir',
  'lvmthin',
  'lvm',
  'zfspool',
  'zfs',
  'nfs',
  'cifs',
  'iscsi',
  'cephfs',
  'rbd'
]

interface StorageFormState {
  storage: string
  type: string
  content: string[]
  path: string
  nodes: string
  shared: boolean
  disable: boolean
  create: boolean
}

const emptyForm = (): StorageFormState => ({
  storage: '',
  type: 'dir',
  content: ['images', 'iso'],
  path: '',
  nodes: '',
  shared: false,
  disable: false,
  create: true
})

function contentLabel(value: string): string {
  return CONTENT_TYPES.find((item) => item.value === value)?.label ?? value
}

export function StorageView({ dashboard, onRefresh }: { dashboard: DashboardData; onRefresh: () => void }): React.JSX.Element {
  const [overview, setOverview] = useState<StorageOverviewData | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<{ node: string; storage: string } | null>(null)
  const [contents, setContents] = useState<StorageContentData | null>(null)
  const [contentError, setContentError] = useState<ApiError | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentFilter, setContentFilter] = useState('')
  const [form, setForm] = useState<StorageFormState | null>(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [poolForm, setPoolForm] = useState<{ poolid: string; comment: string } | null>(null)
  const [poolError, setPoolError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.pvevdi.storageOverview()
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

  useEffect(() => {
    if (!selected) {
      setContents(null)
      return
    }
    let cancelled = false
    setContentLoading(true)
    setContentError(null)
    void window.pvevdi.storageContents(selected.node, selected.storage).then((result) => {
      if (cancelled) return
      if (result.ok) setContents(result.data)
      else {
        setContents(null)
        setContentError(result.error)
      }
      setContentLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [selected])

  const definitions = overview?.definitions ?? []
  const usageByStorage = useMemo(() => {
    const map = new Map<string, { used: number; total: number }>()
    for (const storage of dashboard.storages) {
      const prev = map.get(storage.storage)
      map.set(storage.storage, {
        used: (prev?.used ?? 0) + storage.used,
        total: Math.max(prev?.total ?? 0, storage.total)
      })
    }
    return map
  }, [dashboard.storages])

  const filteredContents = useMemo(() => {
    if (!contents) return []
    const q = contentFilter.trim().toLowerCase()
    if (!q) return contents.entries
    return contents.entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(q) ||
        entry.volid.toLowerCase().includes(q) ||
        entry.contentType.toLowerCase().includes(q)
    )
  }, [contents, contentFilter])

  const nodes = dashboard.nodes.map((node) => node.node)

  const submitStorage = async (): Promise<void> => {
    if (!form) return
    setFormError('')
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(form.storage.trim())) {
      setFormError('存储 ID 只能包含字母、数字、点、下划线与短横线。')
      return
    }
    if (form.content.length === 0) {
      setFormError('请至少选择一种内容类型。')
      return
    }
    setSaving(true)
    const result = await window.pvevdi.storageDefinitionSave({
      storage: form.storage.trim(),
      type: form.type,
      content: form.content,
      path: form.path.trim() || undefined,
      nodes: form.nodes.trim() || undefined,
      shared: form.shared,
      disable: form.disable,
      create: form.create
    })
    setSaving(false)
    if (!result.ok) {
      setFormError(result.error.message)
      return
    }
    setForm(null)
    await load()
    onRefresh()
  }

  const removeStorage = async (storage: string): Promise<void> => {
    const result = await window.pvevdi.storageDefinitionSave({
      storage,
      type: '',
      content: [],
      delete: true
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (selected?.storage === storage) setSelected(null)
    await load()
    onRefresh()
  }

  const removeContent = async (entry: StorageContentEntry): Promise<void> => {
    if (!contents) return
    const result = await window.pvevdi.storageContentDelete(contents.node, contents.storage, entry.volid)
    if (!result.ok) {
      setContentError(result.error)
      return
    }
    const reload = await window.pvevdi.storageContents(contents.node, contents.storage)
    if (reload.ok) setContents(reload.data)
    onRefresh()
  }

  const submitPool = async (): Promise<void> => {
    if (!poolForm) return
    setPoolError('')
    const poolid = poolForm.poolid.trim()
    if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(poolid)) {
      setPoolError('资源池 ID 必须以字母开头。')
      return
    }
    const result = await window.pvevdi.poolSave({
      poolid,
      comment: poolForm.comment.trim() || undefined,
      create: true
    })
    if (!result.ok) {
      setPoolError(result.error.message)
      return
    }
    setPoolForm(null)
    await load()
  }

  const removePool = async (pool: PvePoolSummary): Promise<void> => {
    const result = await window.pvevdi.poolSave({ poolid: pool.poolid, delete: true })
    if (!result.ok) {
      setError(result.error)
      return
    }
    await load()
  }

  if (error && !overview) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow={`${dashboard.cluster.name} 集群`} title="存储" description="管理集群存储定义、浏览卷内容与资源池。" />
        <PveUnavailable error={error} onRetry={() => void load()} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="存储"
        description="管理集群级存储定义、浏览各节点存储卷内容，并维护资源池分组。"
        actions={
          <>
            <Button
              variant="surface"
              loading={loading}
              onClick={() => void load()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </Button>
            <Button variant="default" onClick={() => setForm(emptyForm())}>
              <Plus className="h-3.5 w-3.5" />
              添加存储
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
        {[
          ['存储定义', definitions.length],
          ['启用中', definitions.filter((item) => !item.disable).length],
          ['资源池', overview?.pools.length ?? 0],
          ['节点存储', dashboard.storages.length]
        ].map(([label, value]) => (
          <div key={String(label)} className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0">
            <div className="text-[12px] text-muted-foreground">{label}</div>
            <div className="mt-1.5 font-mono text-[19px] text-foreground">{value}</div>
          </div>
        ))}
      </div>

      {overview && overview.warnings.length > 0 && (
        <div className="border border-warning/40 bg-warning/5 px-4 py-2.5 text-[12px] text-muted-foreground">
          {overview.warnings.join(' · ')}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <div className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />              <span className="text-[12px] font-medium text-foreground">存储定义</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{definitions.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="border-b border-border bg-panel/30 text-[11px] text-muted-foreground">
                    <th className="w-[22%] px-4 py-2.5 font-medium">存储</th>
                    <th className="w-[10%] px-3 py-2.5 font-medium">类型</th>
                    <th className="w-[26%] px-3 py-2.5 font-medium">内容</th>
                    <th className="w-[16%] px-3 py-2.5 whitespace-nowrap font-medium">用量</th>
                    <th className="px-4 py-2.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {definitions.map((definition) => {
                    const usage = usageByStorage.get(definition.storage)
                    const percent = usage && usage.total > 0 ? (usage.used / usage.total) * 100 : 0
                    return (
                      <tr key={definition.storage} className="border-b border-border/60 last:border-b-0 hover:bg-panel/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-foreground">{definition.storage}</span>
                            {definition.disable && <Badge variant="muted">停用</Badge>}
                            {definition.shared && <Badge variant="info">共享</Badge>}
                          </div>
                          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                            {definition.path || definition.nodes || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{definition.type}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {definition.content.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            ) : (
                              definition.content.slice(0, 4).map((item) => (
                                <Badge key={item} variant="outline">
                                  {contentLabel(item)}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {usage && usage.total > 0 ? (
                            <div>
                              <div className="font-mono text-[11px] text-foreground">
                                {percent.toFixed(0)}%
                              </div>
                              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                {formatBytes(usage.used)} / {formatBytes(usage.total)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelected({ node: nodes[0] ?? '', storage: definition.storage })}
                              disabled={nodes.length === 0}
                            >
                              <FolderOpen className="h-3 w-3" />
                              浏览
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setForm({
                                  storage: definition.storage,
                                  type: definition.type,
                                  content: definition.content,
                                  path: definition.path ?? '',
                                  nodes: definition.nodes ?? '',
                                  shared: definition.shared,
                                  disable: definition.disable,
                                  create: false
                                })
                              }
                            >
                              编辑
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => void removeStorage(definition.storage)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {definitions.length === 0 && !loading && (
              <EmptyState
                title="没有存储定义"
                description="先在集群中添加一个存储，才能在创建虚拟机时选择磁盘位置。"
                action={
                  <Button variant="outline" size="sm" onClick={() => setForm(emptyForm())}>
                    <Plus className="h-3 w-3" />
                    添加存储
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">资源池</span>
              <button
                type="button"
                onClick={() => {
                  setPoolError('')
                  setPoolForm({ poolid: '', comment: '' })
                }}
                className="ml-auto flex h-6 items-center gap-1 border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                新建
              </button>
            </div>
            <div className="divide-y divide-border/60">
              {(overview?.pools ?? []).map((pool) => (
                <div key={pool.poolid} className="group px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-foreground">{pool.poolid}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{pool.members.length} 成员</span>
                    <button
                      type="button"
                      onClick={() => void removePool(pool)}
                      className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      aria-label="删除资源池"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {pool.comment && <div className="mt-0.5 text-[11px] text-muted-foreground">{pool.comment}</div>}
                </div>
              ))}
              {(overview?.pools.length ?? 0) === 0 && (
                <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">暂无资源池</div>
              )}
            </div>
          </div>

          <div className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">
                {contents ? `${contents.storage} 内容` : '存储内容'}
              </span>
              {selected && (
                <Select
                  value={selected.node}
                  onValueChange={(value) => setSelected({ node: value, storage: selected.storage })}
                >
                  <SelectTrigger className="ml-auto h-7 w-[110px] text-[11px]">
                    <SelectValue placeholder="节点" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map((node) => (
                      <SelectItem key={node} value={node}>
                        {node}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {contents && (
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className={cn('flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground', !selected && 'hidden')}
                  aria-label="关闭"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {!selected && (
              <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                在左侧选择一个存储，查看其中的卷内容。
              </div>
            )}

            {selected && (
              <>
                <div className="relative border-b border-border px-3 py-2">
                  <Search className="pointer-events-none absolute left-5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={contentFilter}
                    onChange={(event) => setContentFilter(event.target.value)}
                    placeholder="搜索卷名…"
                    className="h-7 pl-7 text-[11px]"
                  />
                </div>
                {contentError && (
                  <div className="px-4 py-3 text-[11px] text-destructive">{contentError.message}</div>
                )}
                <div className="max-h-[420px] overflow-y-auto">
                  {contentLoading && (
                    <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">正在读取…</div>
                  )}
                  {!contentLoading &&
                    filteredContents.map((entry) => (
                      <div key={entry.volid} className="group border-b border-border/60 px-4 py-2.5 last:border-b-0">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                            {entry.name}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {formatBytes(entry.size)}
                          </span>
                          <button
                            type="button"
                            onClick={() => void removeContent(entry)}
                            className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            aria-label="删除卷"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                          <span>{entry.contentType || entry.format || 'unknown'}</span>
                          {entry.vmid !== undefined && <span>VMID {entry.vmid}</span>}
                          {entry.ctime && <span>{formatFullDateTime(entry.ctime * 1000)}</span>}
                        </div>
                      </div>
                    ))}
                  {!contentLoading && filteredContents.length === 0 && (
                    <div className="px-4 py-8 text-center text-[11px] text-muted-foreground">
                      该存储没有匹配的卷。
                    </div>
                  )}
                </div>
                {contents && (
                  <div className="border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
                    {contents.entries.length} 个卷 · 共 {formatBytes(contents.totalSize)}
                  </div>
                )}
              </>
            )}
          </div>
      </div>

      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{form?.create ? '添加存储' : `编辑存储 · ${form?.storage}`}</DialogTitle>
            <DialogDescription>存储定义在集群范围生效，所有节点共用配置。</DialogDescription>
          </DialogHeader>
          {form && (
            <DialogBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="storage-id">存储 ID</Label>
                  <Input
                    id="storage-id"
                    value={form.storage}
                    disabled={!form.create}
                    onChange={(event) => setForm({ ...form, storage: event.target.value })}
                    placeholder="local-lvm"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>类型</Label>
                  <Select
                    value={form.type}
                    disabled={!form.create}
                    onValueChange={(value) => setForm({ ...form, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORAGE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>内容类型</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CONTENT_TYPES.map((item) => {
                    const checked = form.content.includes(item.value)
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            content: checked
                              ? form.content.filter((value) => value !== item.value)
                              : [...form.content, item.value]
                          })
                        }
                        className={cn(
                          'border px-2 py-1 text-[11px] transition-colors',
                          checked
                            ? 'border-brand bg-brand/10 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="storage-path">路径 / 服务端</Label>
                  <Input
                    id="storage-path"
                    value={form.path}
                    onChange={(event) => setForm({ ...form, path: event.target.value })}
                    placeholder="/mnt/data 或 10.0.0.5:/export"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="storage-nodes">限定节点</Label>
                  <Input
                    id="storage-nodes"
                    value={form.nodes}
                    onChange={(event) => setForm({ ...form, nodes: event.target.value })}
                    placeholder="留空表示全部节点"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="storage-shared"
                    checked={form.shared}
                    onCheckedChange={(checked) => setForm({ ...form, shared: checked })}
                  />
                  <Label htmlFor="storage-shared">共享存储</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="storage-disable"
                    checked={form.disable}
                    onCheckedChange={(checked) => setForm({ ...form, disable: checked })}
                  />
                  <Label htmlFor="storage-disable">停用</Label>
                </div>
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button loading={saving} onClick={() => void submitStorage()}>
              {form?.create ? '创建存储' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(poolForm)} onOpenChange={(open) => !open && setPoolForm(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>新建资源池</DialogTitle>
            <DialogDescription>资源池用于把虚拟机与存储按业务分组。</DialogDescription>
          </DialogHeader>
          {poolForm && (
            <DialogBody>
              <div className="space-y-1.5">
                <Label htmlFor="pool-id">资源池 ID</Label>
                <Input
                  id="pool-id"
                  value={poolForm.poolid}
                  onChange={(event) => setPoolForm({ ...poolForm, poolid: event.target.value })}
                  className="font-mono"
                  placeholder="prod"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pool-comment">备注</Label>
                <Input
                  id="pool-comment"
                  value={poolForm.comment}
                  onChange={(event) => setPoolForm({ ...poolForm, comment: event.target.value })}
                  placeholder="生产环境"
                />
              </div>
              {poolError && <div className="text-[11px] text-destructive">{poolError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPoolForm(null)}>
              取消
            </Button>
            <Button onClick={() => void submitPool()}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
