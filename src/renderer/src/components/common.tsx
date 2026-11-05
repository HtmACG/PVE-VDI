import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center border border-border bg-panel text-muted-foreground">
        {icon}
      </div>
      <div className="text-[13px] font-medium text-foreground">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <kbd className="border border-border bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">{children}</kbd>
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
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('text-right text-[11px] text-foreground', mono && 'font-mono text-[10px]')}>{children}</span>
    </div>
  )
}
