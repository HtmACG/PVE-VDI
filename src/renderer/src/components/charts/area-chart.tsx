import { useId } from 'react'
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { EmptyIllustration } from '@renderer/components/common'
import { cn } from '@renderer/lib/utils'

export interface ChartPoint {
  time: number
  value: number
}

interface AreaChartProps {
  points: ChartPoint[]
  /** 数字按像素，'100%' 用于自适应父容器高度 */
  height?: number | string
  color?: string
  className?: string
  yMax?: number
  formatValue?: (value: number) => string
  formatTime?: (timestamp: number) => string
  showAxis?: boolean
  emptyLabel?: string
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
  const max = yMax > 0 ? yMax : 1
  const data = [...points]
    .sort((left, right) => left.time - right.time)
    .map((point) => ({ time: point.time, value: Math.min(max, Math.max(0, point.value)) }))

  if (data.length < 2) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center border border-dashed border-border bg-panel/20', className)}
        style={{ height }}
      >
        <EmptyIllustration className="h-10 w-10 opacity-80" />
        <span className="mt-1 text-[11px] text-muted-foreground">{emptyLabel}</span>
      </div>
    )
  }

  return (
    <div className={cn('w-full select-none', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ top: 8, right: 0, bottom: showAxis ? 4 : 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            hide={!showAxis}
            tickFormatter={(value: number) => formatTime(value)}
            tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            minTickGap={42}
          />
          <YAxis domain={[0, max]} hide />
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '2 3' }}
            formatter={(value) => [formatValue(Number(value)), '']}
            labelFormatter={(value) => formatTime(Number(value))}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 0,
              boxShadow: 'none',
              fontSize: 10,
              fontFamily: 'var(--font-mono)'
            }}
            itemStyle={{ color: 'var(--foreground)' }}
            labelStyle={{ color: 'var(--muted-foreground)' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.6}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 2.5, strokeWidth: 0, fill: color }}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  )
}
