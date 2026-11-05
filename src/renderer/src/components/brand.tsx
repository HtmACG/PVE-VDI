import { cn } from '@renderer/lib/utils'

export function BrandMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={cn('grid h-5 w-5 shrink-0 grid-cols-2 grid-rows-2 gap-[2px]', className)} aria-hidden="true">
      <span className="bg-brand" />
      <span className="border border-border-strong" />
      <span className="border border-border-strong" />
      <span className="border border-brand/60 bg-brand/10" />
    </span>
  )
}

export function BrandLockup({
  compact = false,
  className
}: {
  compact?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="flex items-baseline gap-1">
        <span className="text-[12px] font-semibold tracking-[0.08em] text-foreground">PVE</span>
        <span className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground">VDI</span>
        {!compact && <span className="ml-1 h-3 w-px bg-border-strong" />}
      </span>
    </span>
  )
}
