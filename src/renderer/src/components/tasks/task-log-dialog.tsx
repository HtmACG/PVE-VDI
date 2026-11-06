import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, FileBox, Loader2, RefreshCw } from 'lucide-react'
import type { TaskLogLine, TaskSummary } from '@shared/types'
import { TASK_TYPE_LABELS } from '@shared/ipc'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { TaskStatusBadge } from '@renderer/components/status-badges'
import { formatDuration, formatFullDateTime } from '@renderer/lib/format'
import { errorDetail, unwrap } from '@renderer/lib/api'

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '')
}

export function TaskLogDialog({
  task,
  open,
  onOpenChange
}: {
  task: TaskSummary | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [lines, setLines] = useState<TaskLogLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sequence = useRef(0)

  const load = async (silent = false): Promise<void> => {
    if (!task) return
    const current = ++sequence.current
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const result = await unwrap(window.pvevdi.taskLog(task.node, task.upid))
      if (sequence.current !== current) return
      setLines(result)
      setError(null)
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    } catch (err) {
      if (sequence.current === current) setError(errorDetail(err))
    } finally {
      if (sequence.current === current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    if (!open || !task) return
    setLines([])
    setError(null)
    void load()
  }, [open, task?.upid])

  useEffect(() => {
    if (!open || !task || task.status !== 'running') return
    const timer = window.setInterval(() => void load(true), 2200)
    return () => window.clearInterval(timer)
  }, [open, task?.upid, task?.status])

  const body = useMemo(() => lines.map((line) => stripAnsi(line.t)).join('\n'), [lines])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[76vh] max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileBox className="h-4 w-4 text-brand" />
            <DialogTitle>任务日志</DialogTitle>
            {task && <TaskStatusBadge status={task.status} />}
          </div>
          <DialogDescription className="font-mono break-all">{task?.upid ?? '—'}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 border-b border-border px-5 py-3 sm:grid-cols-4">
          {[
            ['类型', task ? TASK_TYPE_LABELS[task.type] ?? task.type : '—'],
            ['节点', task?.node ?? '—'],
            ['时长', task ? formatDuration(task.duration) : '—'],
            ['开始', task ? formatFullDateTime(task.startTime * 1000) : '—']
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="mt-1 truncate font-mono text-[12px] text-foreground">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-b border-border px-5 py-2">
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            {refreshing ? <Loader2 className="h-3 w-3 spin text-brand" /> : <CheckCircle2 className="h-3 w-3" />}
            {lines.length} 行输出
          </div>
          <Button variant="surface" size="sm" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'spin' : ''}`} />
            刷新
          </Button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-muted/50 p-4 dark:bg-[#07080a] dark:text-zinc-300">
          {loading && lines.length === 0 ? (
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 spin" />
              正在读取任务输出…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/[0.06] p-3 text-[12px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          ) : lines.length === 0 ? (
            <div className="font-mono text-[11px] text-muted-foreground">任务尚未产生输出。</div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.75] text-foreground">
              {body}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span className="font-mono">task/{task?.id ?? '—'} · {task?.user ?? ''}</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-1 text-[11px] text-foreground hover:text-brand"
          >
            关闭
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
