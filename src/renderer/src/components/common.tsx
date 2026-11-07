import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { Progress } from '@renderer/components/ui/primitives'
import elEmpty from '@renderer/assets/el-empty.svg'

/**
 * 看板统计块：全站统一的「标签 + 等宽数字 + 说明」排布。
 * 工业软件读数区：12px 标签、等宽数字、细进度条、说明行，无圆角、无阴影。
 */
export function StatTile({
  label,
  value,
  unit,
  detail,
  icon,
  usage,
  indicatorClassName,
  className
}: {
  label: string
  value: string
  unit?: string
  detail?: ReactNode
  icon?: ReactNode
  usage?: number
  indicatorClassName?: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('border border-border bg-card p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
        {icon && <span className="shrink-0 text-muted-foreground/60">{icon}</span>}
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="font-mono text-[26px] font-medium leading-none tracking-[-0.03em] text-foreground tabular">
          {value}
        </span>
        {unit && <span className="font-mono text-[11px] text-muted-foreground">{unit}</span>}
      </div>
      {usage !== undefined && (
        <Progress
          value={Math.min(100, Math.max(0, usage * 100))}
          className="mt-3 h-[3px]"
          indicatorClassName={indicatorClassName}
        />
      )}
      {detail && <div className="mt-2 text-[11px] leading-[18px] text-muted-foreground">{detail}</div>}
    </div>
  )
}

export function EmptyIllustration({ className }: { className?: string }): React.JSX.Element {
  return (
    <img
      src={elEmpty}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('select-none object-contain', className)}
    />
  )
}

export function EmptyState({
  title,
  description,
  action,
  className
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <EmptyIllustration className="mb-4 h-20 w-20" />
      <div className="text-[13px] font-medium text-foreground">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[12px] leading-5 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <kbd className="border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">{children}</kbd>
  )
}

export function DataRow({
  label,
  children,
  mono = false,
  className
}: {
  label: ReactNode
  children: ReactNode
  mono?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-start justify-between gap-6 border-b border-border/60 py-2 last:border-0', className)}>
      <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className={cn('text-right text-[12px] text-foreground', mono && 'font-mono text-[11px]')}>{children}</span>
    </div>
  )
}
