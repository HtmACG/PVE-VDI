import { Progress } from '@renderer/components/ui/primitives'
import { cn } from '@renderer/lib/utils'
import { clamp01, formatBytes, formatPercent } from '@renderer/lib/format'

export function MetricBar({
  label,
  value,
  max,
  valueLabel,
  color = 'bg-brand',
  className,
  compact = false
}: {
  label?: string
  value: number
  max: number
  valueLabel?: string
  color?: string
  className?: string
  compact?: boolean
}): React.JSX.Element {
  const ratio = max > 0 ? clamp01(value / max) : 0
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-4">
        {label && <span className={cn('text-muted-foreground', compact ? 'text-[10px]' : 'text-[11px]')}>{label}</span>}
        <span className={cn('ml-auto font-mono tabular text-foreground', compact ? 'text-[10px]' : 'text-[11px]')}>
          {valueLabel ?? `${formatPercent(ratio)}`}
        </span>
      </div>
      <Progress value={ratio * 100} className={compact ? 'h-[2px]' : 'h-1'} indicatorClassName={color} />
    </div>
  )
}

export function StorageBar({
  used,
  total,
  className
}: {
  used: number
  total: number
  className?: string
}): React.JSX.Element {
  const ratio = total > 0 ? clamp01(used / total) : 0
  const color = ratio >= 0.9 ? 'bg-destructive' : ratio >= 0.75 ? 'bg-warning' : 'bg-foreground'
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] text-muted-foreground">{formatBytes(total)} 总量</span>
        <span className="font-mono text-[10px] text-foreground">{formatPercent(ratio, 1)}</span>
      </div>
      <Progress value={ratio * 100} className="h-[3px]" indicatorClassName={color} />
      <div className="flex justify-between font-mono text-[9px] text-muted-foreground/80">
        <span>{formatBytes(used)} 已用</span>
        <span>{formatBytes(Math.max(0, total - used))} 可用</span>
      </div>
    </div>
  )
}
