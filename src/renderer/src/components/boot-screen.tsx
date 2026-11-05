import { BrandLockup } from '@renderer/components/brand'
import { WindowButtons } from '@renderer/components/layout/window-buttons'

export function BootScreen(): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-border pl-4">
        <BrandLockup compact />
        <WindowButtons />
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <div className="absolute left-0 top-0 h-full w-px bg-brand/60" />
        <div className="w-[320px]">
          <div className="text-[11px] text-muted-foreground">Proxmox VE</div>
          <div className="mt-1 text-[13px] font-medium text-foreground">正在连接集群</div>
          <div className="relative mt-5 h-px w-full overflow-hidden bg-border">
            <div className="animate-pulse-line absolute inset-y-0 left-0 w-1/2 bg-brand" />
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">连接中</div>
        </div>
      </div>
    </div>
  )
}
