import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-5', className)}>
      <div className="min-w-0">
        <div className="mb-2 text-[11px] font-medium tracking-[0.02em] text-muted-foreground">{eyebrow}</div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <div className={cn('text-[12px] font-medium text-muted-foreground', className)}>{children}</div>
}

export function PanelHeader({
  title,
  description,
  actions,
  className
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex min-h-12 items-center gap-4 border-b border-border px-4 py-3', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[14px] font-medium tracking-tight text-foreground">{title}</div>
        {description && <div className="mt-1 text-[12px] text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
