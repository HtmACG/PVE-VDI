import { useEffect, useState } from 'react'
import { Loader2, MonitorX } from 'lucide-react'
import type { ConsoleWindowBootstrap } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { WindowButtons } from '@renderer/components/layout/window-buttons'
import { Toaster } from '@renderer/components/ui/sonner'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { ConsoleView } from '@renderer/components/console/console-view'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { applyAppearance } from '@renderer/lib/appearance'

export function ConsoleWindowApp(): React.JSX.Element {
  const [bootstrap, setBootstrap] = useState<ConsoleWindowBootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    document.title = 'PVE VDI 控制台'
    unwrap(window.pvevdi.consoleWindowBootstrap())
      .then((result) => {
        if (cancelled) return
        applyAppearance(result.settings)
        document.title = `PVE VDI 控制台${result.request.name ? ` · ${result.request.name}` : ''}`
        setBootstrap(result)
      })
      .catch((err) => {
        if (!cancelled) setError(errorDetail(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // 主窗口切换深/浅色时，控制台窗口跟随更新。
    return window.pvevdi.onSettingsChanged((next) => {
      applyAppearance(next)
      setBootstrap((current) => (current ? { ...current, settings: next } : current))
    })
  }, [])

  if (bootstrap) {
    return (
      <TooltipProvider delayDuration={250}>
        <ConsoleView
          request={bootstrap.request}
          onClose={() => window.pvevdi.windowClose()}
        />
        <Toaster theme={bootstrap.settings.theme} />
      </TooltipProvider>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="drag-region flex h-10 shrink-0 items-stretch justify-end border-b border-border bg-card">
        <WindowButtons />
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        {error ? (
          <div className="w-[420px] max-w-full border border-destructive/35 bg-card p-5">
            <div className="flex items-center gap-2 text-[13px] font-medium text-destructive">
              <MonitorX className="h-4 w-4" />
              无法打开控制台窗口
            </div>
            <p className="mt-2 break-words text-[12px] leading-5 text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => window.pvevdi.windowClose()}>
              关闭窗口
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 spin text-brand" />
            <div className="text-[12px]">正在准备控制台窗口…</div>
          </div>
        )}
      </div>
    </div>
  )
}
