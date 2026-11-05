import type { TaskSummary } from '@shared/types'
import { cn } from '@renderer/lib/utils'

const STATUS_META: Record<string, { label: string; text: string }> = {
  running: { label: '运行中', text: 'text-success' },
  stopped: { label: '已停止', text: 'text-muted-foreground' },
  paused: { label: '已暂停', text: 'text-warning' },
  suspended: { label: '已挂起', text: 'text-info' },
  unknown: { label: '未知', text: 'text-muted-foreground' }
}

export function VmStatusBadge({
  status,
  template = false,
  className
}: {
  status: string
  template?: boolean
  className?: string
}): React.JSX.Element {
  if (template) {
    return <span className={cn('inline-flex h-5 items-center text-[12px] font-medium text-info', className)}>模板</span>
  }
  const meta = STATUS_META[status] ?? STATUS_META.unknown
  return (
    <span className={cn('inline-flex h-5 items-center text-[12px] font-medium', meta.text, className)}>
      {meta.label}
    </span>
  )
}

export function NodeStatusBadge({ status }: { status: string }): React.JSX.Element {
  const online = status === 'online'
  return (
    <span className={cn('inline-flex h-5 items-center text-[12px] font-medium', online ? 'text-success' : 'text-destructive')}>
      {online ? '在线' : '离线'}
    </span>
  )
}

export function TaskStatusBadge({ status }: { status: TaskSummary['status'] }): React.JSX.Element {
  const map = {
    running: { label: '运行中', className: 'text-brand' },
    ok: { label: '成功', className: 'text-success' },
    error: { label: '失败', className: 'text-destructive' },
    unknown: { label: '未知', className: 'text-muted-foreground' }
  }[status]
  return (
    <span className={cn('inline-flex h-5 items-center text-[12px] font-medium', map.className)}>
      {map.label}
    </span>
  )
}

export function QuorumBadge({ quorate }: { quorate: boolean }): React.JSX.Element {
  return (
    <span className={cn('inline-flex h-5 items-center text-[12px] font-medium', quorate ? 'text-success' : 'text-destructive')}>
      {quorate ? 'Quorum 正常' : 'Quorum 异常'}
    </span>
  )
}
