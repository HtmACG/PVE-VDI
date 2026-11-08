import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Download,
  File as FileIcon,
  FilePlus2,
  Folder,
  FolderPlus,
  HardDrive,
  Loader2,
  Monitor,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import type { ApiResult, SshDirectoryListing, SshFileContent, SshTargetOverride } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { formatBytes, formatDateTime } from '@renderer/lib/format'

/**
 * SFTP 文件面板。
 *
 * 布局沿用参考图的形态：顶部是路径栏 + 工具按钮，下面是名称 / 大小 / 时间三列。
 * 点文件进预览（编辑器），点目录进目录。所有写操作都二次确认，删除更狠一点。
 */

interface SftpPanelProps {
  className?: string
  /**
   * 客户机 SSH 目标：给了就浏览**虚拟机内部**的文件，
   * 不给则是节点（沿用 PVE 登录凭据）。
   */
  guest?: SshTargetOverride
  /** 当前目录变化时通知外部（终端可以同步 cd，这里暂不启用） */
  onPathChange?: (path: string) => void
}

type SortKey = 'name' | 'size' | 'mtime'

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

export function SftpPanel({ className, guest, onPathChange }: SftpPanelProps): React.JSX.Element {
  const [listing, setListing] = useState<SshDirectoryListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })

  /**
   * 每次文件操作都带上的目标信息。
   * guest 用 JSON 序列化做依赖，避免调用方每次渲染传新对象导致无限重载。
   */
  const remote = useMemo(() => (guest?.host ? { guest } : {}), [guest?.host, guest?.username, guest?.password])

  // 预览态
  const [preview, setPreview] = useState<{ meta: SshFileContent; draft: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // 新建 / 改名
  const [prompt, setPrompt] = useState<{ mode: 'file' | 'dir' | 'rename'; value: string; target?: string } | null>(null)

  const [busy, setBusy] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    async (target?: string) => {
      setLoading(true)
      setError(null)
      try {
        const next = unwrap(await window.pvevdi.sshFsList({ ...remote, path: target }))
        if (!mounted.current) return
        setListing(next)
        setPreview(null)
        setQuery('')
        onPathChange?.(next.path)
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (mounted.current) setLoading(false)
      }
    },
    [onPathChange, remote]
  )

  useEffect(() => {
    void load()
  }, [load])

  const openEntry = async (name: string, type: SshDirectoryListing['entries'][number]['type']): Promise<void> => {
    if (!listing) return
    const full = listing.path === '/' ? `/${name}` : `${listing.path}/${name}`
    if (type === 'dir') {
      await load(full)
      return
    }
    setBusy(full)
    setError(null)
    try {
      const meta = unwrap(await window.pvevdi.sshFsRead({ ...remote, path: full }))
      if (!mounted.current) return
      setPreview({ meta, draft: meta.text ?? '' })
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const goUp = (): void => {
    if (!listing) return
    const parent = listing.path.replace(/\/+$/, '').replace(/\/[^/]+$/, '') || '/'
    if (parent === listing.path) return
    void load(parent)
  }

  const joinPath = (name: string): string => (listing ? (listing.path === '/' ? `/${name}` : `${listing.path}/${name}`) : name)

  const submitPrompt = async (): Promise<void> => {
    if (!prompt || !listing) return
    const name = prompt.value.trim()
    if (!name) return
    setBusy('prompt')
    setError(null)
    try {
      if (prompt.mode === 'dir') {
        unwrap(await window.pvevdi.sshFsCreateDir({ ...remote, path: joinPath(name) }))
      } else if (prompt.mode === 'file') {
        unwrap(await window.pvevdi.sshFsCreateFile({ ...remote, path: joinPath(name) }))
      } else if (prompt.mode === 'rename' && prompt.target) {
        // 改名只换最后一段，路径前缀保持当前目录
        unwrap(await window.pvevdi.sshFsRename({ ...remote, from: prompt.target, to: joinPath(name) }))
      }
      setPrompt(null)
      await load(listing.path)
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const remove = async (name: string, type: string): Promise<void> => {
    const full = joinPath(name)
    const label = type === 'dir' ? '目录及其全部内容' : '文件'
    if (!window.confirm(`确定删除${label}「${name}」？此操作不可撤销。`)) return
    setBusy(full)
    setError(null)
    try {
      unwrap(await window.pvevdi.sshFsRemove({ ...remote, path: full, recursive: type === 'dir' }))
      await load(listing?.path)
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const savePreview = async (): Promise<void> => {
    if (!preview) return
    setSaving(true)
    setError(null)
    try {
      unwrap(await window.pvevdi.sshFsWrite({ ...remote, path: preview.meta.path, content: preview.draft }))
      setPreview({ ...preview, meta: { ...preview.meta, size: new Blob([preview.draft]).size } })
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  const doUpload = async (): Promise<void> => {
    if (!listing) return
    setBusy('upload')
    setError(null)
    try {
      const result = unwrap(await window.pvevdi.sshFsUpload({ ...remote, remoteDir: listing.path }))
      if (result) await load(listing.path)
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const doDownload = async (name: string): Promise<void> => {
    setBusy(name)
    setError(null)
    try {
      unwrap(await window.pvevdi.sshFsDownload({ ...remote, path: joinPath(name) }))
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const entries = useMemo(() => {
    if (!listing) return []
    const filtered = query
      ? listing.entries.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()))
      : listing.entries
    const sorted = [...filtered].sort((a, b) => {
      // 目录永远排在前面，不参与排序比较
      const aDir = a.type === 'dir'
      const bDir = b.type === 'dir'
      if (aDir !== bDir) return aDir ? -1 : 1
      let delta = 0
      if (sort.key === 'name') delta = a.name.localeCompare(b.name, 'zh-CN')
      else if (sort.key === 'size') delta = a.size - b.size
      else delta = a.mtime - b.mtime
      return sort.asc ? delta : -delta
    })
    return sorted
  }, [listing, query, sort])

  const crumbs = useMemo(() => {
    if (!listing) return []
    const home = listing.home
    const rest = listing.path === home ? '' : listing.path.slice(home.length)
    return [{ label: home.split('/').pop() || '/', path: home }, ...rest.split('/').filter(Boolean).map((name, index, all) => ({
      label: name,
      path: `${home}/${all.slice(0, index + 1).join('/')}`
    }))]
  }, [listing])

  const toggleSort = (key: SortKey): void => {
    setSort((current) => (current.key === key ? { key, asc: !current.asc } : { key, asc: true }))
  }

  /**
   * 数据来源标识。
   *
   * 用户最容易搞混的一点：面板里的 /root 到底是虚拟机里的，还是 PVE 节点的？
   * 有 guest 就是虚拟机内部（显示 IP + 登录账号），没有就是节点宿主机。
   * 这个标签不参与交互，纯提示，但能省掉大量「我删错机器了」的误会。
   */
  const source = guest?.host
    ? {
        kind: 'guest' as const,
        icon: Monitor,
        label: guest.host,
        user: guest.username ?? '',
        title: `正在浏览虚拟机内部文件：${guest.username ? `${guest.username}@` : ''}${guest.host}${guest.port && guest.port !== 22 ? `:${guest.port}` : ''}`
      }
    : {
        kind: 'node' as const,
        icon: HardDrive,
        label: '节点宿主机',
        user: '',
        title: '节点 SSH 窗口：文件面板浏览的是 PVE 节点宿主机'
      }

  return (
    <div className={cn('flex min-h-0 flex-col bg-card', className)}>
      {/* 路径栏 */}
      <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goUp} title="上一级" disabled={!listing}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void load(listing?.path)} title="刷新">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          <span
            data-sftp-source={source.kind}
            title={source.title}
            className={cn(
              'mr-1 flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium',
              source.kind === 'guest'
                ? 'border-success/35 bg-success/10 text-success'
                : 'border-border bg-panel text-muted-foreground'
            )}
          >
            <source.icon className="h-3 w-3" />
            {source.user && <span className="shrink-0 font-mono opacity-70">{source.user}@</span>}
            <span className="max-w-[130px] truncate font-mono">{source.label}</span>
          </span>
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex shrink-0 items-center">
              {index > 0 && <span className="px-0.5 text-[11px] text-muted-foreground/60">/</span>}
              <button
                type="button"
                onClick={() => void load(crumb.path)}
                className="rounded px-1 py-0.5 font-mono text-[11.5px] text-foreground/80 transition-colors hover:bg-panel hover:text-foreground"
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* 工具行 */}
      <div className="flex items-center gap-1 border-b border-border px-2.5 py-1.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPrompt({ mode: 'file', value: '' })} title="新建文件">
          <FilePlus2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPrompt({ mode: 'dir', value: '' })} title="新建目录">
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void doUpload()} title="上传文件" disabled={busy === 'upload'}>
          {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        </Button>
        <div className="relative ml-1 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索当前目录"
            className="h-7 pl-7 text-[11.5px]"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/8 px-2.5 py-2 text-[11.5px] text-destructive">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {preview ? (
        <PreviewPane
          preview={preview}
          saving={saving}
          onChange={(draft) => setPreview({ ...preview, draft })}
          onClose={() => setPreview(null)}
          onSave={() => void savePreview()}
        />
      ) : (
        <>
          <div className="grid grid-cols-[1fr_72px_86px_44px] items-center gap-1 border-b border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <button type="button" onClick={() => toggleSort('name')} className="text-left hover:text-foreground">
              名称{sort.key === 'name' ? (sort.asc ? ' ↑' : ' ↓') : ''}
            </button>
            <button type="button" onClick={() => toggleSort('size')} className="text-right hover:text-foreground">
              大小{sort.key === 'size' ? (sort.asc ? ' ↑' : ' ↓') : ''}
            </button>
            <button type="button" onClick={() => toggleSort('mtime')} className="text-right hover:text-foreground">
              修改{sort.key === 'mtime' ? (sort.asc ? ' ↑' : ' ↓') : ''}
            </button>
            <span />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !listing ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                读取目录…
              </div>
            ) : entries.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-muted-foreground">
                {query ? '没有匹配的文件' : '这个目录是空的'}
              </div>
            ) : (
              entries.map((entry) => {
                const isDir = entry.type === 'dir'
                return (
                  <div
                    key={entry.path}
                    className={cn(
                      'group grid grid-cols-[minmax(0,1fr)_64px_82px_68px] items-center gap-1 overflow-hidden border-b border-border/40 px-2.5 py-[7px] transition-colors hover:bg-panel/60',
                      busy === entry.path && 'opacity-60'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void openEntry(entry.name, entry.type)}
                      className="flex min-w-0 items-center gap-2 overflow-hidden text-left"
                      title={entry.name}
                    >
                      {isDir ? (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-warning" />
                      ) : (
                        <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="block min-w-0 flex-1 truncate text-[12px] text-foreground">{entry.name}</span>
                    </button>
                    <span className="text-right font-mono text-[11px] text-muted-foreground">
                      {isDir ? '—' : formatBytes(entry.size)}
                    </span>
                    <span className="text-right font-mono text-[10.5px] text-muted-foreground">
                      {entry.mtime ? formatDateTime(entry.mtime, { second: undefined }) : '—'}
                    </span>
                    <div className="flex w-[68px] shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setPrompt({ mode: 'rename', value: entry.name, target: entry.path })}
                        className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground hover:bg-panel hover:text-foreground"
                        title="重命名"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {!isDir && (
                        <button
                          type="button"
                          onClick={() => void doDownload(entry.name)}
                          className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground hover:bg-panel hover:text-foreground"
                          title="下载"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void remove(entry.name, entry.type)}
                        className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="删除"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* 底栏：上边线由所在窗口的外层统一画，这里只负责计数与路径 */}
          <div className="shrink-0 px-2.5 py-1.5 font-mono text-[10.5px] text-muted-foreground">
            {entries.length} 项 · {listing?.path ?? '—'}
          </div>
        </>
      )}

      {prompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPrompt(null)}>
          <div
            className="w-full max-w-sm rounded-lg border border-border-strong bg-popover p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-[13px] font-medium text-foreground">
              {prompt.mode === 'dir' ? '新建目录' : prompt.mode === 'file' ? '新建文件' : '重命名'}
            </div>
            <Input
              autoFocus
              value={prompt.value}
              onChange={(event) => setPrompt({ ...prompt, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitPrompt()
                if (event.key === 'Escape') setPrompt(null)
              }}
              placeholder={prompt.mode === 'dir' ? '目录名' : '文件名'}
              className="mt-3 h-8 text-[12.5px]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPrompt(null)}>
                取消
              </Button>
              <Button size="sm" onClick={() => void submitPrompt()} disabled={busy === 'prompt'}>
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewPane({
  preview,
  saving,
  onChange,
  onClose,
  onSave
}: {
  preview: { meta: SshFileContent; draft: string }
  saving: boolean
  onChange: (value: string) => void
  onClose: () => void
  onSave: () => void
}): React.JSX.Element {
  const { meta, draft } = preview
  const dirty = meta.text !== null && draft !== meta.text

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
        <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground">{meta.path.split('/').pop()}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{formatBytes(meta.size)}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="关闭预览">
          <X className="h-3 w-3" />
        </Button>
      </div>

      {meta.truncated ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-[12px] text-muted-foreground">
          文件超过 2 MB，未加载内容。可以直接下载后查看。
        </div>
      ) : meta.binary ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-[12px] text-muted-foreground">
          二进制文件，无法以文本预览。
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2.5 font-mono text-[11.5px] leading-[1.65] text-foreground outline-none"
        />
      )}

      {meta.text !== null && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5">
          <span className={cn('text-[10.5px]', dirty ? 'text-warning' : 'text-muted-foreground')}>
            {dirty ? '有未保存改动' : '已与远端一致'}
          </span>
          <Button size="sm" variant="surface" onClick={onSave} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            保存
          </Button>
        </div>
      )}
    </div>
  )
}
