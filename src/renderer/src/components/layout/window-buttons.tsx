import { Copy, Maximize2, Minus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'

/**
 * 标题栏右侧的最小化 / 最大化 / 关闭三连。
 *
 * 高度这里有个坑：宿主标题栏是 `h-10 + border-b`，内容盒只有 39px，
 * 而按钮若写死 `h-10`（40px）就会溢出 1px，悬停时把标题栏那条下边线挤掉，
 * 视觉上就是「鼠标一碰底部横线就断了一截」。所以按钮统一 `h-full`、
 * 自身不画下边线，由外层容器 `items-stretch` 撑满，边框归属始终是标题栏。
 */
export function WindowButtons({
  className,
  closeLabel = '关闭',
  closeHint
}: {
  className?: string
  /** 关闭按钮的无障碍标签，主窗口用于提示「收起到托盘」。 */
  closeLabel?: string
  /** 关闭按钮的悬浮提示。 */
  closeHint?: string
}): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.pvevdi.getWindowState().then((state) => setMaximized(state.maximized))
    return window.pvevdi.onWindowState((state) => setMaximized(state.maximized))
  }, [])

  const buttonClass =
    'flex h-full w-[46px] shrink-0 items-center justify-center text-muted-foreground transition-colors focus:outline-none focus-visible:bg-accent focus-visible:text-foreground'

  const closeButton = (
    <button
      type="button"
      onClick={() => window.pvevdi.windowClose()}
      className={cn(buttonClass, 'hover:bg-destructive hover:text-white')}
      aria-label={closeLabel}
      title={closeHint}
      data-window-button="close"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )

  return (
    <div
      className={cn('no-drag flex shrink-0 items-stretch self-stretch border-l border-border', className)}
      data-window-buttons=""
    >
      <button
        type="button"
        onClick={() => window.pvevdi.windowMinimize()}
        className={cn(buttonClass, 'hover:bg-accent hover:text-foreground')}
        aria-label="最小化"
        data-window-button="minimize"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => window.pvevdi.windowToggleMaximize()}
        className={cn(buttonClass, 'border-l border-border hover:bg-accent hover:text-foreground')}
        aria-label={maximized ? '还原' : '最大化'}
        data-window-button="maximize"
      >
        {maximized ? <Copy className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
      </button>
      {closeHint ? (
        <Tooltip>
          <TooltipTrigger asChild>{closeButton}</TooltipTrigger>
          <TooltipContent side="bottom">{closeHint}</TooltipContent>
        </Tooltip>
      ) : (
        closeButton
      )}
    </div>
  )
}
