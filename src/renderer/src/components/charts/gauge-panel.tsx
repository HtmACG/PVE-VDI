import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import { cn } from '@renderer/lib/utils'

// 按需引入：只用仪表盘 + Canvas 渲染器。
// 少注册 CanvasRenderer 会在 init 时抛 "painterCtors[rendererType] is not a constructor"。
echarts.use([GaugeChart, CanvasRenderer])

export interface GaugeSpec {
  label: string
  /**
   * 0 ~ 1 的占用比（超出会被夹到 100%）。
   * 传 `plain: true` 时忽略此值——纯计数类指标没有「占多少」的概念，
   * 硬画一个 0% 的弧反而误导。
   */
  ratio: number
  /** 圆心下方的主显示值，例如 38.4%，也可以是「8 个」这种计数 */
  display: string
  /** 第二行说明，例如 8 / 16 线程 */
  caption?: string
  color: string
  /** 计数型指标：不画进度弧与指针，只留底环 + 数值 + 标题 */
  plain?: boolean
}

/**
 * 读取当前主题的 CSS 变量。
 * ECharts 的画布拿不到 Tailwind 类，只能吃到具体色值，所以这里现取一遍。
 */
function readThemeColor(): { track: string; text: string; muted: string; label: string } {
  const styles = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback
  return {
    track: pick('--border', '#3f3f46'),
    text: pick('--fg', '#f3f3f3'),
    muted: pick('--muted-fg', '#b8b8b8'),
    label: pick('--muted-fg', '#b8b8b8')
  }
}

function buildOption(spec: GaugeSpec, theme: ReturnType<typeof readThemeColor>): EChartsCoreOption {
  const percent = Math.max(0, Math.min(1, spec.ratio)) * 100
  return {
    animationDuration: 520,
    animationEasing: 'cubicOut',
    series: [
      {
        type: 'gauge',
        startAngle: 212,
        endAngle: -32,
        min: 0,
        max: 100,
        radius: '80%',
        center: ['50%', '54%'],
        splitNumber: 5,
        progress: {
          show: !spec.plain,
          width: 8,
          roundCap: true,
          itemStyle: { color: spec.color }
        },
        axisLine: {
          roundCap: true,
          lineStyle: { width: 8, color: [[1, theme.track]] }
        },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        // 指针锚在圆心，数值在其下方，标题再往下一行：三者纵向分离，不会互相压
        pointer: {
          show: !spec.plain,
          length: '62%',
          width: 2.5,
          itemStyle: { color: spec.color }
        },
        anchor: {
          show: !spec.plain,
          size: 5,
          showAbove: true,
          itemStyle: { color: spec.color, borderWidth: 0 }
        },
        detail: {
          show: true,
          offsetCenter: [0, '34%'],
          valueAnimation: true,
          formatter: () => spec.display,
          fontSize: 18,
          lineHeight: 22,
          fontWeight: 500,
          fontFamily: 'JetBrains Mono Variable, Consolas, monospace',
          color: theme.text
        },
        title: {
          show: true,
          offsetCenter: [0, '60%'],
          fontSize: 11,
          lineHeight: 14,
          color: theme.label
        },
        data: [{ value: percent, name: spec.label }]
      }
    ]
  }
}

function GaugeItem({ spec }: { spec: GaugeSpec }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const chart = echarts.init(host, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(host)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(buildOption(spec, readThemeColor()))
  }, [spec])

  // 主题与强调色都是改 CSS 变量，没有 props 变化，只能靠观察 html 属性/样式变化重绘
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => chart.setOption(buildOption(spec, readThemeColor())))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [spec])

  return <div ref={hostRef} className="h-[150px] w-full" role="img" aria-label={`${spec.label} ${spec.display}`} />
}

/** 三块并排的仪表盘，用于节点 CPU / 内存 / 根磁盘占用。 */
export function GaugePanel({ items, className }: { items: GaugeSpec[]; className?: string }): React.JSX.Element {
  return (
    <div className={cn('grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col px-2 pb-2.5 pt-1">
          <GaugeItem spec={item} />
          {item.caption && (
            <div
              className="mt-1 truncate px-2 text-center font-mono text-[10.5px] text-muted-foreground"
              title={item.caption}
            >
              {item.caption}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
