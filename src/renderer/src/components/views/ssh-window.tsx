import { useEffect, useState } from 'react'
import { Loader2, MonitorX, TerminalSquare } from 'lucide-react'
import type { SshWindowBootstrap } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { WindowButtons } from '@renderer/components/layout/window-buttons'
import { Toaster } from '@renderer/components/ui/sonner'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { SshView } from '@renderer/components/views/ssh-view'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { applyAppearance } from '@renderer/lib/appearance'

/**
 * 独立 SSH 窗口的外壳。
 *
 * 主窗口只负责「打开」，真正干活的界面在这里：自绘标题栏 + 满高终端区。
 * 主题跟随主窗口设置（onSettingsChanged），不自己另起一套。
 */
export function SshWindowApp(): React.JSX.Element {
  const [bootstrap, setBootstrap] = useState<SshWindowBootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    document.title = 'PVE VDI SSH'
    unwrap(window.pvevdi.sshWindowBootstrap())
      .then((result) => {
        if (cancelled) return
        applyAppearance(result.settings)
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
    return window.pvevdi.onSettingsChanged((next) => {
      applyAppearance(next)
      setBootstrap((current) => (current ? { ...current, settings: next } : current))
    })
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground ring-1 ring-inset ring-border-strong">
      <div className="drag-region flex h-10 shrink-0 items-stretch border-b border-border bg-card">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span className="truncate text-[12px] font-medium text-foreground">
            {bootstrap?.request.vm ? '虚拟机终端' : 'SSH 终端'}
          </span>
          {bootstrap && (
            <span className="truncate font-mono text-[10.5px] text-muted-foreground">
              {bootstrap.request.vm
                ? `${bootstrap.request.vm.node} · ${bootstrap.request.vm.type.toUpperCase()} ${bootstrap.request.vm.vmid} · xterm.js`
                : (bootstrap.request.override?.host ?? '')}
            </span>
          )}
        </div>
        <WindowButtons closeLabel="关闭窗口" />
      </div>

      {bootstrap ? (
        <TooltipProvider delayDuration={250}>
          <div className="min-h-0 flex-1">
            <SshView
              initialTabs={bootstrap.request.tabs ?? 1}
              override={bootstrap.request.override}
              node={bootstrap.request.node}
              vm={bootstrap.request.vm}
            />
          </div>
          <Toaster theme={bootstrap.settings.theme} />
        </TooltipProvider>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8">
          {error ? (
            <div className="w-[420px] max-w-full border border-destructive/35 bg-card p-5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-destructive">
                <MonitorX className="h-4 w-4" />
                无法打开 SSH 窗口
              </div>
              <p className="mt-2 break-words text-[12px] leading-5 text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => window.pvevdi.windowClose()}>
                关闭窗口
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 spin text-brand" />
              <div className="text-[12px]">正在准备 SSH 窗口…</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
