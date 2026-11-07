import { cn } from '@renderer/lib/utils'
import { formatPercent } from '@renderer/lib/format'

/**
 * 把 0 ~ 1 的占用比映射成格子底色。
 * 分档而不是连续插值：格子小，连续色阶在低负载段几乎分辨不出来，分档反而一眼能读出「几个核在忙」。
 * 空载留浅灰而不是透明，否则整片看不出「这里有 N 个格子」。
 */
function coreTone(ratio: number): string {
  if (ratio >= 0.85) return 'bg-destructive'
  if (ratio >= 0.6) return 'bg-warning'
  if (ratio >= 0.35) return 'bg-brand/60'
  if (ratio > 0.02) return 'bg-brand/25'
  return 'bg-muted'
}

export interface CoreGridProps {
  /** 每个线程的占用比（0 ~ 1），索引即线程号 */
  loads?: number[]
  /** 节点上报的线程总数；loads 缺失时用它画空格子占位 */
  total?: number
  className?: string
}

/**
 * 线程负载格子：一个格子代表一个物理线程，颜色代表当前负载档位。
 * 数量直接等于核心数，所以能顺便看出机器规格。
 */
export function CoreGrid({ loads, total, className }: CoreGridProps): React.JSX.Element | null {
  const count = loads?.length || total || 0
  if (count <= 0) return null

  const values = loads ?? []
  const busy = values.filter((value) => value >= 0.35).length
  const peak = values.length > 0 ? Math.max(...values) : 0
  // 每行封顶 32 格：再多的线程也排成方阵，不会拉成一条细线
  const columns = Math.min(count, 32)

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="grid shrink-0 gap-[4px]"
        style={{
          gridTemplateColumns: `repeat(${columns}, 12px)`,
          gridAutoRows: '12px'
        }}
        role="img"
        aria-label={
          values.length > 0
            ? `${count} 线程负载，${busy} 个线程高于 35%，最高 ${formatPercent(peak, 0)}`
            : `${count} 线程，暂无按核数据`
        }
      >
        {Array.from({ length: count }, (_, index) => {
          const value = values[index]
          const known = value !== undefined
          return (
            <span
              key={index}
              title={known ? `线程 ${index} · ${formatPercent(value, 1)}` : `线程 ${index} · 无数据`}
              data-core={index}
              data-load={known ? value.toFixed(3) : ''}
              className={cn(
                'rounded-[2.5px] ring-1 ring-inset ring-black/[0.07] transition-colors duration-300',
                known ? coreTone(value) : 'bg-muted/50'
              )}
            />
          )
        })}
      </div>
      <div className="shrink-0 whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
        {values.length > 0 ? (
          <>
            <span className="text-foreground">{busy}</span>/{count} 忙
          </>
        ) : (
          <>
            {count} 线程 <span className="text-warning/90">· SSH 未连接</span>
          </>
        )}
      </div>
    </div>
  )
}
