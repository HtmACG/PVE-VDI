import { useEffect, useState } from 'react'
import { Copy, Maximize2, Minus, X } from 'lucide-react'
import { BrandLockup } from '@renderer/components/brand'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import type { DashboardData, SessionProfile } from '@shared/types'
import { formatTimeAgoFromMs } from '@renderer/lib/format'

interface TitlebarProps {
  session: SessionProfile
  dashboard: DashboardData | null
  refreshing: boolean
  onRefresh: () => void
}

export function Titlebar({ session, dashboard, refreshing, onRefresh }: TitlebarProps): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.pvevdi.getWindowState().then((state) => setMaximized(state.maximized))
    return window.pvevdi.onWindowState((state) => setMaximized(state.maximized))
  }, [])

  const clusterName = dashboard?.cluster.name || session.clusterName

  return (
    <header className="drag-region relative flex h-10 shrink-0 items-stretch border-b border-border bg-card pl-3.5">
      <div className="flex items-center gap-3">
        <BrandLockup compact />
        <span className="h-3.5 w-px bg-border" />
        <span className="font-mono text-[11px] text-muted-foreground">
          {session.serverUrl.replace(/^https?:\/\//, '')}
        </span>
        <span className="hidden text-[11px] text-muted-foreground lg:block">{clusterName}</span>
      </div>

      <div className="ml-auto flex items-stretch">
        <button
          type="button"
          onClick={onRefresh}
          className="no-drag flex min-w-[116px] items-center justify-end gap-2 border-l border-border/60 px-3 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="刷新状态"
        >
          <span>
            {refreshing ? '正在同步' : dashboard ? `${formatTimeAgoFromMs(dashboard.fetchedAt)}刷新` : '等待连接'}
          </span>
        </button>

        <div className="flex items-stretch border-l border-border/60">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => window.pvevdi.windowMinimize()}
                className="no-drag flex h-10 w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="最小化"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>最小化</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={() => window.pvevdi.windowToggleMaximize()}
            className="no-drag flex h-10 w-[46px] items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={maximized ? '还原' : '最大化'}
          >
            {maximized ? <Copy className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => window.pvevdi.windowClose()}
            className="no-drag flex h-10 w-[46px] items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
            aria-label="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
