import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  ExternalLink,
  PauseCircle,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react'
import type { DashboardData, TaskSummary } from '@shared/types'
import { TASK_TYPE_LABELS } from '@shared/ipc'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/common'
import { TaskStatusBadge } from '@renderer/components/status-badges'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { formatDuration, formatFullDateTime, relativeTime } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'

type TaskFilter = 'all' | 'running' | 'ok' | 'error'

const FILTERS: Array<{ value: TaskFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '运行中' },
  { value: 'ok', label: '成功' },
  { value: 'error', label: '失败' }
]

const RANGES: Array<{ value: string; label: string; seconds: number }> = [
  { value: '1h', label: '最近 1 小时', seconds: 3600 },
  { value: '24h', label: '最近 24 小时', seconds: 86400 },
  { value: '7d', label: '最近 7 天', seconds: 604800 },
  { value: 'all', label: '全部时间', seconds: 0 }
]

function truncateUpid(upid: string): string {
  if (upid.length <= 42) return upid
  return `${upid.slice(0, 20)}…${upid.slice(-18)}`
}

export function TasksView({
  dashboard,
  onRefresh,
  onOpenTask
}: {
  dashboard: DashboardData
  onRefresh: () => void
  onOpenTask: (task: TaskSummary) => void
}): React.JSX.Element {
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [query, setQuery] = useState('')
  const [node, setNode] = useState('all')
  const [range, setRange] = useState('24h')
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TaskSummary | null>(null)
  const [busyUpid, setBusyUpid] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const seconds = RANGES.find((item) => item.value === range)?.seconds ?? 0
      const since = seconds > 0 ? Math.floor(Date.now() / 1000) - seconds : undefined
      const result = await unwrap(
        window.pvevdi.taskList({
          limit: 500,
          ...(node === 'all' ? {} : { node }),
          ...(since ? { since } : {}),
          ...(filter === 'error' ? { errorsOnly: true } : {})
        })
      )
      setTasks(result.tasks)
      setWarnings(result.warnings)
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
    }
  }, [node, range, filter])

  useEffect(() => {
    void load()
  }, [load])

  const nodes = useMemo(
    () => (dashboard.nodes.length > 0 ? dashboard.nodes.map((item) => item.node) : []).sort(),
    [dashboard.nodes]
  )

  const counts = useMemo(
    () => ({
      all: tasks.length,
      running: tasks.filter((task) => task.status === 'running').length,
      ok: tasks.filter((task) => task.status === 'ok').length,
      error: tasks.filter((task) => task.status === 'error').length
    }),
    [tasks]
  )

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return tasks
      .filter((task) => filter === 'all' || task.status === filter)
      .filter((task) => {
        if (!q) return true
        return (
          task.type.toLowerCase().includes(q) ||
          (task.id ?? '').includes(q) ||
          task.user.toLowerCase().includes(q) ||
          task.upid.toLowerCase().includes(q) ||
          (TASK_TYPE_LABELS[task.type] ?? '').includes(deferredQuery.trim())
        )
      })
  }, [tasks, deferredQuery, filter])

  const hasFilters = Boolean(query) || filter !== 'all' || node !== 'all' || range !== '24h'

  const stopTask = async (task: TaskSummary): Promise<void> => {
    setBusyUpid(task.upid)
    try {
      await unwrap(window.pvevdi.taskStop(task.node, task.upid))
      toast.success('已请求停止任务', { description: truncateUpid(task.upid) })
      await load()
    } catch (err) {
      toast.error('停止失败', { description: errorDetail(err) })
    } finally {
      setBusyUpid(null)
    }
  }

  const deleteTask = async (): Promise<void> => {
    if (!confirmDelete) return
    setBusyUpid(confirmDelete.upid)
    setDialogError(null)
    try {
      await unwrap(window.pvevdi.taskDelete(confirmDelete.node, confirmDelete.upid))
      toast.success('任务记录已删除')
      setConfirmDelete(null)
      await load()
      onRefresh()
    } catch (err) {
      setDialogError(errorDetail(err))
    } finally {
      setBusyUpid(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="任务"
        description="跨节点查看 PVE 任务执行记录，可停止运行中的任务或清理历史归档。"
        actions={
          <Button variant="surface" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        }
      />

      <div className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
        {[
          ['全部任务', counts.all],
          ['运行中', counts.running],
          ['成功', counts.ok],
          ['失败', counts.error]
        ].map(([label, value]) => (
          <div key={String(label)} className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0">
            <div className="text-[12px] text-muted-foreground">{label}</div>
            <div className="mt-1.5 font-mono text-[19px] text-foreground">{value}</div>
          </div>
        ))}
      </div>

      <div className="border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <div className="flex items-center border border-border">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  'flex h-8 items-center gap-1.5 border-r border-border px-2.5 text-[12px] transition-colors last:border-r-0',
                  filter === item.value
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {item.label}
                <span className="font-mono text-[11px] opacity-65">{counts[item.value]}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:ml-auto sm:w-[250px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索类型、VMID、用户、UPID…"
              className="h-8 pl-8 pr-8 text-[12px]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="清除搜索"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Select value={node} onValueChange={setNode}>
            <SelectTrigger className="h-8 w-[120px] text-[12px]" aria-label="节点筛选">
              <SelectValue placeholder="节点" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有节点</SelectItem>
              {nodes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-8 w-[130px] text-[12px]" aria-label="时间范围">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery('')
                setFilter('all')
                setNode('all')
                setRange('24h')
              }}
            >
              <X className="h-3 w-3" />
              重置
            </Button>
          )}
        </div>

        {error && (
          <div className="mx-3 mt-3 flex items-start gap-2 border border-destructive/35 bg-destructive/[0.06] px-3 py-2 text-[11px] leading-4 text-destructive">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => void load()} className="shrink-0 underline">
              重试
            </button>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mx-3 mt-3 border border-warning/35 bg-warning/[0.06] px-3 py-2 text-[11px] leading-4 text-warning">
            {warnings.join('；')}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left">
            <thead>
              <tr className="border-b border-border bg-panel/30 text-[11px] text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-3 py-2.5 font-medium">任务</th>
                <th className="px-3 py-2.5 font-medium">对象</th>
                <th className="px-3 py-2.5 font-medium">节点</th>
                <th className="px-3 py-2.5 font-medium">用户</th>
                <th className="px-3 py-2.5 font-medium">开始时间</th>
                <th className="px-3 py-2.5 font-medium">时长</th>
                <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr
                  key={task.upid}
                  className="group border-b border-border/60 transition-colors last:border-b-0 hover:bg-panel/50"
                >
                  <td className="px-4 py-3">
                    <TaskStatusBadge status={task.status} />
                  </td>
                  <td className="cursor-pointer px-3 py-3" onClick={() => onOpenTask(task)}>
                    <div className="text-[12px] text-foreground">{TASK_TYPE_LABELS[task.type] ?? task.type}</div>
                    <div className="mt-1 max-w-[300px] truncate font-mono text-[10px] text-muted-foreground">
                      {truncateUpid(task.upid)}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {task.id ? (
                      <span className="font-mono text-[11px] text-foreground">{task.id}</span>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{task.node}</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{task.user || '—'}</td>
                  <td className="px-3 py-3 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                    {formatFullDateTime(task.startTime * 1000)}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                    {formatDuration(task.duration)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="inline-flex h-6 items-center gap-1 px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                        aria-label="查看日志"
                      >
                        <ExternalLink className="h-3 w-3" />
                        日志
                      </button>
                      {task.status === 'running' && (
                        <button
                          type="button"
                          disabled={busyUpid === task.upid}
                          onClick={() => void stopTask(task)}
                          className="inline-flex h-6 items-center gap-1 px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-warning/10 hover:text-warning disabled:opacity-40"
                          aria-label="停止任务"
                        >
                          <PauseCircle className="h-3 w-3" />
                          停止
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDialogError(null)
                          setConfirmDelete(task)
                        }}
                        className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="删除任务记录"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length === 0 && (
          <EmptyState
            icon={hasFilters ? <Search className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
            title={hasFilters ? '没有匹配的任务' : '没有任务记录'}
            description={
              hasFilters ? '调整筛选条件或放宽时间范围后再试。' : '集群任务会在执行电源操作、创建虚拟机或维护时出现。'
            }
          />
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <Terminal className="h-3 w-3" />
            {loading ? '正在读取任务…' : `显示 ${filtered.length} / ${tasks.length} 条任务`}
          </span>
          <span>
            最近同步 {relativeTime(Math.floor(dashboard.fetchedAt / 1000))}
            {counts.running > 0 && <span className="text-brand"> · {counts.running} 条运行中</span>}
          </span>
        </div>
      </div>

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
      >
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>删除任务记录</DialogTitle>
            <DialogDescription>只删除 PVE 中的任务记录与日志，不会影响已经执行的操作结果。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="border border-border bg-panel/30 px-3 py-2 font-mono text-[11px] leading-5 break-all text-muted-foreground">
              {confirmDelete?.upid}
            </div>
            {dialogError && (
              <div className="flex items-start gap-2 border border-destructive/35 bg-destructive/[0.06] px-3 py-2 text-[11px] leading-4 text-destructive">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{dialogError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={Boolean(busyUpid)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void deleteTask()} loading={Boolean(busyUpid)}>
              删除记录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
