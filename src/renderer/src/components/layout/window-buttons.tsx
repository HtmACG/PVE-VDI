import { Copy, Maximize2, Minus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'

export function WindowButtons({ className }: { className?: string }): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.pvevdi.getWindowState().then((state) => setMaximized(state.maximized))
    return window.pvevdi.onWindowState((state) => setMaximized(state.maximized))
  }, [])

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
      <button
        type="button"
        onClick={() => window.pvevdi.windowClose()}
        className="flex h-10 w-[46px] items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
        aria-label="关闭"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
