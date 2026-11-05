import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical' }): React.JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  )
}

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn('skeleton', className)} {...props} />
}

function Progress({
  value,
  className,
  indicatorClassName
}: {
  value: number
  className?: string
  indicatorClassName?: string
}): React.JSX.Element {
  const width = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  return (
    <div className={cn('h-1 w-full overflow-hidden bg-muted', className)}>
      <div
        className={cn('h-full bg-foreground transition-[width] duration-500', indicatorClassName)}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

export { Separator, Skeleton, Progress }
