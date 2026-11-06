import { Copy, Maximize2, Minus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'

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

  const closeButton = (
    <button
      type="button"
      onClick={() => window.pvevdi.windowClose()}
      className="flex h-10 w-[46px] items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
      aria-label={closeLabel}
      title={closeHint}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )

  return (
    <div className={cn('no-drag flex items-stretch border-l border-border', className)}>
      <button
        type="button"
        onClick={() => window.pvevdi.windowMinimize()}
        className="flex h-10 w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="最小化"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => window.pvevdi.windowToggleMaximize()}
        className="flex h-10 w-[46px] items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={maximized ? '还原' : '最大化'}
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
