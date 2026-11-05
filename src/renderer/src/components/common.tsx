import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import elEmpty from '@renderer/assets/el-empty.svg'

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
