import { BrandLockup } from '@renderer/components/brand'
import { WindowButtons } from '@renderer/components/layout/window-buttons'

export function BootScreen(): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-border pl-4">
        <BrandLockup compact />
        <WindowButtons />
      </div>
      <div className="grid-surface relative flex flex-1 items-center justify-center overflow-hidden">
        <div className="absolute left-0 top-0 h-full w-px bg-brand/60" />
        <div className="w-[320px]">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-8 w-8 grid-cols-2 grid-rows-2 gap-[2px]">
              <span className="bg-brand" />
              <span className="border border-border-strong" />
              <span className="border border-border-strong" />
              <span className="border border-brand/60 bg-brand/10" />
            </div>
            <div>
              <div className="text-[10px] font-medium text-muted-foreground">Proxmox VE</div>
              <div className="mt-0.5 text-[13px] font-medium">正在连接集群</div>
            </div>
          </div>
          <div className="relative h-px w-full overflow-hidden bg-border">
            <div className="animate-pulse-line absolute inset-y-0 left-0 w-1/2 bg-brand" />
          </div>
          <div className="mt-3 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>PVE API / TLS</span>
            <span className="text-brand">连接中</span>
          </div>
        </div>
      </div>
    </div>
  )
}
