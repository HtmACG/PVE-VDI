import { useId, useMemo, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'

export interface ChartPoint {
  time: number
  value: number
}

interface AreaChartProps {
  points: ChartPoint[]
  height?: number
  color?: string
  className?: string
  yMax?: number
  formatValue?: (value: number) => string
  formatTime?: (timestamp: number) => string
  showAxis?: boolean
  emptyLabel?: string
}

function makePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ')
}

export function AreaChart({
  points,
  height = 180,
  color = 'var(--brand)',
  className,
  yMax = 1,
  formatValue = (value) => `${(value * 100).toFixed(0)}%`,
  formatTime = (timestamp) =>
    new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(timestamp),
  showAxis = true,
  emptyLabel = '暂无遥测数据'
}: AreaChartProps): React.JSX.Element {
  const gradientId = useId().replace(/:/g, '')
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const width = 1000
  const chartHeight = 180
  const top = 10
  const bottom = showAxis ? 26 : 8
  const innerHeight = chartHeight - top - bottom
  const max = yMax > 0 ? yMax : 1

  const geometry = useMemo(() => {
    if (points.length === 0) return { line: '', area: '', coords: [], minTime: 0, maxTime: 0 }
    const sorted = [...points].sort((a, b) => a.time - b.time)
    const minTime = sorted[0]?.time ?? 0
    const maxTime = sorted[sorted.length - 1]?.time ?? minTime + 1
    const span = Math.max(1, maxTime - minTime)
    const coords = sorted.map((point) => ({
      x: ((point.time - minTime) / span) * width,
      y: top + innerHeight - (Math.min(max, Math.max(0, point.value)) / max) * innerHeight,
      data: point
    }))
    const line = makePath(coords)
    const area = coords.length
      ? `${line} L${coords[coords.length - 1]?.x.toFixed(2)},${(top + innerHeight).toFixed(2)} L${coords[0]?.x.toFixed(2)},${(top + innerHeight).toFixed(2)} Z`
      : ''
    return { line, area, coords, minTime, maxTime }
  }, [points, max, innerHeight])

  const active = hoverIndex !== null ? geometry.coords[hoverIndex] : null

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!geometry.coords.length || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const index = Math.round(ratio * (geometry.coords.length - 1))
    setHoverIndex(index)
  }

  if (points.length < 2) {
    return (
      <div
        className={cn('flex items-center justify-center border border-dashed border-border bg-panel/30', className)}
        style={{ height }}
      >
        <span className="font-mono text-[9px] tracking-[0.04em] text-muted-foreground">{emptyLabel}</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full select-none', className)}
      style={{ height }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHoverIndex(null)}
    >
      <svg viewBox={`0 0 ${width} ${chartHeight}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.015" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + innerHeight - ratio * innerHeight
          return (
            <line
              key={ratio}
              x1={0}
              x2={width}
              y1={y}
              y2={y}
              stroke="var(--chart-grid)"
              strokeWidth="1"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}

        <path d={geometry.area} fill={`url(#area-${gradientId})`} />
        <path
          d={geometry.line}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="square"
          vectorEffect="non-scaling-stroke"
        />

        {active && (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={top}
              y2={top + innerHeight}
              stroke="var(--border-strong)"
              strokeWidth="1"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={active.x - 2.5}
              y={active.y - 2.5}
              width={5}
              height={5}
              fill={color}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
      </svg>

      {showAxis && (
        <div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[9px] text-muted-foreground/80">
          <span>{formatTime(geometry.minTime)}</span>
          <span>{formatTime(geometry.maxTime)}</span>
        </div>
      )}

      {active && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[92px] border border-border-strong bg-popover/95 px-2 py-1.5 shadow-lg backdrop-blur"
          style={{
            left: `${Math.min(78, Math.max(0, (active.x / width) * 100))}%`
          }}
        >
          <div className="font-mono text-[9px] text-muted-foreground">{formatTime(active.data.time)}</div>
          <div className="mt-0.5 font-mono text-[11px] text-foreground">{formatValue(active.data.value)}</div>
        </div>
      )}
    </div>
  )
}
