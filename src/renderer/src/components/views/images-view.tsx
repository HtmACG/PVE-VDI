import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Disc3,
  Download,
  FileImage,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload
} from 'lucide-react'
import type {
  DashboardData,
  IsoImageInfo,
  IsoImageList,
  IsoStorageInfo,
  IsoUrlInput,
  PickedIsoFile
} from '@shared/types'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
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
import { EmptyState, StatTile } from '@renderer/components/common'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { formatBytes, formatDateTime } from '@renderer/lib/format'
import { toast } from 'sonner'

const ALL_STORAGES = '__all__'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <div className="text-[11px] leading-4 text-muted-foreground">{hint}</div>}
    </div>
  )
}

function activeStorages(storages: IsoStorageInfo[]): IsoStorageInfo[] {
  return storages.filter((storage) => storage.active)
}

function UploadIsoDialog({
  open,
  onOpenChange,
  file,
  node,
  storages,
  onDone
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: PickedIsoFile | null
  node: string
  storages: IsoStorageInfo[]
  onDone: () => void
}): React.JSX.Element {
  const available = activeStorages(storages)
  const [storage, setStorage] = useState(available[0]?.storage ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const defaultStorage = available[0]?.storage ?? ''

  useEffect(() => {
    if (!open) return
    setStorage(defaultStorage)
    setError(null)
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file?.path, defaultStorage])

  const upload = async (): Promise<void> => {
    if (!file) return
    if (!storage) {
      setError('请选择 ISO 存储。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await unwrap(
        window.pvevdi.uploadIso({ node, storage, filePath: file.path })
      )
      toast.success(result.message, { description: result.upid ?? 'PVE 正在写入镜像。' })
      onOpenChange(false)
      onDone()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent
        className="max-w-[560px]"
        onInteractOutside={(event) => {
          if (busy) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <DialogHeader className="pr-10">
          <DialogTitle>上传 ISO 镜像</DialogTitle>
          <DialogDescription>把本地 ISO 文件上传到 PVE 存储；大文件可能需要较长时间。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="border border-destructive/35 bg-destructive/[0.05] p-3 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          )}
          {file && (
            <div className="flex items-start gap-3 border border-border bg-panel/30 p-3">
              <Disc3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate text-[12px] text-foreground" title={file.name}>
                  {file.name}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{formatBytes(file.size)}</span>
                  <span className="h-3 w-px bg-border" />
                  <span className="truncate font-mono">{file.path}</span>
                </div>
              </div>
            </div>
          )}
          <Field label="目标存储" hint="只列出启用了 ISO 内容类型的活动存储。">
            <Select value={storage} onValueChange={setStorage} disabled={busy || available.length === 0}>
              <SelectTrigger aria-label="ISO 目标存储">
                <SelectValue placeholder="选择 ISO 存储" />
              </SelectTrigger>
              <SelectContent>
                {available.map((item) => (
                  <SelectItem key={item.storage} value={item.storage}>
                    {item.storage} · {formatBytes(item.avail)} 可用
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {available.length === 0 && (
            <div className="text-[11px] text-destructive">当前节点没有可用的 ISO 存储，请先在 PVE 中启用 ISO 内容。</div>
          )}
          {busy && (
            <div className="flex items-center gap-2 border border-info/25 bg-info/[0.05] p-3 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 spin text-brand" />
              正在上传，请勿关闭应用或对话框。
            </div>
          )}
        </div>
        <DialogFooter className="bg-panel/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void upload()} loading={busy} disabled={!file || available.length === 0}>
            <Upload className="h-3.5 w-3.5" />
            开始上传
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UrlIsoDialog({
  open,
  onOpenChange,
  node,
  storages,
  onDone
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: string
  storages: IsoStorageInfo[]
  onDone: () => void
}): React.JSX.Element {
  const available = activeStorages(storages)
  const [storage, setStorage] = useState(available[0]?.storage ?? '')
  const [url, setUrl] = useState('')
  const [filename, setFilename] = useState('')
  const [checksum, setChecksum] = useState('')
  const [algorithm, setAlgorithm] = useState<IsoUrlInput['checksumAlgorithm']>('sha256')
  const [verifyCertificates, setVerifyCertificates] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const defaultStorage = available[0]?.storage ?? ''

  useEffect(() => {
    if (!open) return
    setStorage(defaultStorage)
    setUrl('')
    setFilename('')
    setChecksum('')
    setAlgorithm('sha256')
    setVerifyCertificates(true)
    setError(null)
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultStorage])

  const updateUrl = (value: string): void => {
    setUrl(value)
    if (filename) return
    try {
      const parsed = new URL(value)
      const name = decodeURIComponent(parsed.pathname.split('/').pop() ?? '')
      if (name && /\.(iso|img)$/i.test(name)) setFilename(name)
    } catch {
      // The user is still typing; filename can be entered manually.
    }
  }

  const submit = async (): Promise<void> => {
    if (!url.trim()) {
      setError('请输入 ISO 下载地址。')
      return
    }
    if (!filename.trim()) {
      setError('请输入保存后的文件名。')
      return
    }
    if (!storage) {
      setError('请选择 ISO 存储。')
      return
    }
    if (checksum.trim() && !algorithm) {
      setError('请选择校验算法。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await unwrap(
        window.pvevdi.importIsoUrl({
          node,
          storage,
          url: url.trim(),
          filename: filename.trim(),
          checksum: checksum.trim() || undefined,
          checksumAlgorithm: checksum.trim() ? algorithm : undefined,
          verifyCertificates
        })
      )
      toast.success(result.message, { description: result.upid ?? 'PVE 正在后台下载镜像。' })
      onOpenChange(false)
      onDone()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-[560px]">
        <DialogHeader className="pr-10">
          <DialogTitle>从 URL 导入 ISO</DialogTitle>
          <DialogDescription>由 PVE 节点下载 ISO 文件并保存到指定存储。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="border border-destructive/35 bg-destructive/[0.05] p-3 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          )}
          <Field label="下载地址" hint="支持 HTTP / HTTPS。">
            <Input
              value={url}
              onChange={(event) => updateUrl(event.target.value)}
              placeholder="https://example.com/ubuntu-24.04.iso"
              className="font-mono text-[12px]"
              aria-label="ISO 下载地址"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="保存文件名">
              <Input
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                placeholder="ubuntu-24.04.iso"
                className="font-mono text-[12px]"
                aria-label="ISO 保存文件名"
              />
            </Field>
            <Field label="目标存储">
              <Select value={storage} onValueChange={setStorage} disabled={busy || available.length === 0}>
                <SelectTrigger aria-label="ISO 目标存储">
                  <SelectValue placeholder="选择 ISO 存储" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((item) => (
                    <SelectItem key={item.storage} value={item.storage}>
                      {item.storage} · {formatBytes(item.avail)} 可用
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[150px_1fr]">
            <Field label="校验算法">
              <Select
                value={algorithm ?? 'sha256'}
                onValueChange={(value) => setAlgorithm(value as IsoUrlInput['checksumAlgorithm'])}
                disabled={busy}
              >
                <SelectTrigger aria-label="校验算法">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="md5">MD5</SelectItem>
                  <SelectItem value="sha1">SHA-1</SelectItem>
                  <SelectItem value="sha224">SHA-224</SelectItem>
                  <SelectItem value="sha256">SHA-256</SelectItem>
                  <SelectItem value="sha384">SHA-384</SelectItem>
                  <SelectItem value="sha512">SHA-512</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="校验值" hint="可选；填写后 PVE 会校验下载内容。">
              <Input
                value={checksum}
                onChange={(event) => setChecksum(event.target.value)}
                placeholder="留空表示不校验"
                className="font-mono text-[12px]"
                aria-label="ISO 校验值"
              />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-4 border border-border bg-panel/30 px-3 py-2.5">
            <div>
              <div className="text-[12px] text-foreground">验证 HTTPS 证书</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">关闭后允许下载使用自签名证书的地址。</div>
            </div>
            <Switch checked={verifyCertificates} onCheckedChange={setVerifyCertificates} aria-label="验证 HTTPS 证书" />
          </div>
          {available.length === 0 && (
            <div className="text-[11px] text-destructive">当前节点没有可用的 ISO 存储。</div>
          )}
        </div>
        <DialogFooter className="bg-panel/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={available.length === 0}>
            <Download className="h-3.5 w-3.5" />
            开始导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ImagesView({
  dashboard,
  onRefresh
}: {
  dashboard: DashboardData
  onRefresh: () => void
}): React.JSX.Element {
  const nodes = useMemo(() => dashboard.nodes.filter((node) => node.status === 'online'), [dashboard.nodes])
  const [node, setNode] = useState(nodes[0]?.node ?? dashboard.nodes[0]?.node ?? '')
  const [data, setData] = useState<IsoImageList | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storageFilter, setStorageFilter] = useState(ALL_STORAGES)
  const [query, setQuery] = useState('')
  const [uploadFile, setUploadFile] = useState<PickedIsoFile | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<IsoImageInfo | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(
    async (silent = false): Promise<void> => {
      if (!node) {
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      setRefreshing(true)
      setError(null)
      try {
        const next = await unwrap(window.pvevdi.isoImages(node))
        setData(next)
        setStorageFilter((previous) =>
          previous === ALL_STORAGES || next.storages.some((storage) => storage.storage === previous)
            ? previous
            : ALL_STORAGES
        )
      } catch (err) {
        setError(errorDetail(err))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [node]
  )

  useEffect(() => {
    setData(null)
    setLoading(true)
    setStorageFilter(ALL_STORAGES)
    setQuery('')
    void load()
  }, [load])

  const images = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (data?.images ?? []).filter((image) => {
      if (storageFilter !== ALL_STORAGES && image.storage !== storageFilter) return false
      if (!needle) return true
      return image.name.toLowerCase().includes(needle) || image.volid.toLowerCase().includes(needle)
    })
  }, [data, query, storageFilter])

  const totalSize = images.reduce((sum, image) => sum + image.size, 0)
  const isoStorages = data?.storages ?? []
  const activeIsoStorages = activeStorages(isoStorages)

  const chooseFile = async (): Promise<void> => {
    if (activeIsoStorages.length === 0) {
      toast.error('没有可用的 ISO 存储', { description: '请先在 PVE 存储中启用 ISO 内容类型。' })
      return
    }
    try {
      const file = await unwrap(window.pvevdi.pickIsoFile())
      if (!file) return
      setUploadFile(file)
      setUploadOpen(true)
    } catch (err) {
      toast.error('无法选择 ISO 文件', { description: errorDetail(err) })
    }
  }

  const remove = async (): Promise<void> => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await unwrap(window.pvevdi.deleteIso(deleteTarget.node, deleteTarget.storage, deleteTarget.volid))
      toast.success('ISO 镜像已删除')
      setDeleteTarget(null)
      await load(true)
      onRefresh()
    } catch (err) {
      toast.error('无法删除 ISO', { description: errorDetail(err) })
    } finally {
      setDeleting(false)
    }
  }

  const refreshAfterTask = (): void => {
    window.setTimeout(() => {
      void load(true)
      onRefresh()
    }, 1500)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="镜像"
        description="管理 PVE 存储中的 ISO 镜像，可上传本地文件或从 URL 导入。"
        actions={
          <>
            <Select value={node} onValueChange={setNode} disabled={nodes.length === 0}>
              <SelectTrigger className="h-8 w-[150px] text-[12px]" aria-label="镜像节点">
                <SelectValue placeholder="选择节点" />
              </SelectTrigger>
              <SelectContent align="end">
                {nodes.map((item) => (
                  <SelectItem key={item.node} value={item.node}>
                    {item.node}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="surface" size="sm" onClick={() => void load()} loading={refreshing}>
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </Button>
            <Button variant="surface" size="sm" onClick={() => setUrlOpen(true)} disabled={activeIsoStorages.length === 0}>
              <Link2 className="h-3.5 w-3.5" />
              从 URL 导入
            </Button>
            <Button size="sm" onClick={() => void chooseFile()} disabled={activeIsoStorages.length === 0}>
              <Upload className="h-3.5 w-3.5" />
              上传 ISO
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="ISO 镜像" value={String(images.length)} detail={`共 ${data?.images.length ?? 0} 个`} />
        <StatTile label="占用空间" value={formatBytes(totalSize)} detail="当前筛选结果" />
        <StatTile label="ISO 存储" value={String(isoStorages.length)} detail={`${activeIsoStorages.length} 个已启用`} />
        <StatTile label="节点" value={node || '—'} detail={`${nodes.length} 个在线节点`} />
      </div>

      {error && (
        <div className="flex items-start gap-2 border border-destructive/35 bg-destructive/[0.05] px-3 py-2 text-[11px] leading-5 text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            重试
          </Button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="text-[12px] font-medium text-foreground">镜像列表</div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索镜像"
                aria-label="搜索 ISO 镜像"
                className="h-8 w-[180px] pl-7 text-[12px]"
              />
            </div>
            <Select value={storageFilter} onValueChange={setStorageFilter}>
              <SelectTrigger className="h-8 w-[170px] text-[12px]" aria-label="ISO 存储筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={ALL_STORAGES}>全部存储</SelectItem>
                {isoStorages.map((storage) => (
                  <SelectItem key={storage.storage} value={storage.storage}>
                    {storage.storage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex items-center gap-2 px-4 py-10 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 spin" />
            正在读取 ISO 镜像
          </div>
        ) : images.length === 0 ? (
          <EmptyState
            icon={<FileImage className="h-5 w-5" />}
            title={data?.images.length === 0 ? '没有 ISO 镜像' : '没有匹配的镜像'}
            description="上传本地 ISO 或从 URL 导入后，可在这里查看和管理。"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">镜像</th>
                  <th className="px-3 py-2.5 font-medium">存储</th>
                  <th className="px-3 py-2.5 font-medium">格式</th>
                  <th className="px-3 py-2.5 font-medium">大小</th>
                  <th className="px-3 py-2.5 font-medium">上传时间</th>
                  <th className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {images.map((image) => (
                  <tr key={image.volid} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Disc3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="max-w-[320px] truncate text-[12px] text-foreground" title={image.name}>
                            {image.name}
                          </div>
                          <div className="mt-0.5 max-w-[320px] truncate font-mono text-[10px] text-muted-foreground">
                            {image.volid}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-[11px] text-foreground">{image.storage}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{image.node}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{image.format ?? 'iso'}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-foreground">{formatBytes(image.size)}</td>
                    <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">
                      {image.ctime ? formatDateTime(image.ctime * 1000) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`删除 ${image.name}`}
                          onClick={() => setDeleteTarget(image)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UploadIsoDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        file={uploadFile}
        node={node}
        storages={isoStorages}
        onDone={refreshAfterTask}
      />
      <UrlIsoDialog
        open={urlOpen}
        onOpenChange={setUrlOpen}
        node={node}
        storages={isoStorages}
        onDone={refreshAfterTask}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 ISO 镜像？</AlertDialogTitle>
            <AlertDialogDescription>
              将从存储中删除 <span className="font-mono text-foreground">{deleteTarget?.name}</span>。此操作不可恢复，引用该 ISO 的虚拟机可能无法启动。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={deleting}
              onClick={(event) => {
                event.preventDefault()
                void remove()
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
