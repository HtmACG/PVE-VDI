import {
  MoreHorizontal,
  Pause,
  Play,
  Power,
  RotateCw,
  Square,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import type { VmAction, VmType } from '@shared/types'
import { VM_ACTION_LABELS } from '@shared/ipc'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { VmStatusBadge } from '@renderer/components/status-badges'
import { cn } from '@renderer/lib/utils'

export interface ActionTarget {
  node: string
  type: VmType
  vmid: number
  name: string
  template?: boolean
  status?: string
}

export interface ActionMeta {
  action: VmAction
  label: string
  icon: LucideIcon
  needsConfirm: boolean
  destructive?: boolean
  disabled?: boolean
}

const ACTION_ICONS: Record<VmAction, LucideIcon> = {
  start: Play,
  shutdown: Power,
  stop: Square,
  reboot: RotateCw,
  reset: RotateCw,
  suspend: Pause,
  resume: Play
}

export function getAvailableActions(target: ActionTarget): ActionMeta[] {
  if (target.template) return []
  const status = target.status
  if (status === 'running') {
    const actions: ActionMeta[] = [
      { action: 'shutdown', label: VM_ACTION_LABELS.shutdown, icon: Power, needsConfirm: true },
      { action: 'reboot', label: VM_ACTION_LABELS.reboot, icon: RotateCw, needsConfirm: true },
      { action: 'suspend', label: VM_ACTION_LABELS.suspend, icon: Pause, needsConfirm: true },
      { action: 'stop', label: VM_ACTION_LABELS.stop, icon: Square, needsConfirm: true, destructive: true }
    ]
    if (target.type === 'qemu') {
      actions.push({ action: 'reset', label: VM_ACTION_LABELS.reset, icon: RotateCw, needsConfirm: true, destructive: true })
    }
    return actions
  }
  if (status === 'paused' || status === 'suspended') {
    return [
      { action: 'resume', label: VM_ACTION_LABELS.resume, icon: Play, needsConfirm: false },
      { action: 'stop', label: VM_ACTION_LABELS.stop, icon: Square, needsConfirm: true, destructive: true }
    ]
  }
  return [{ action: 'start', label: VM_ACTION_LABELS.start, icon: Play, needsConfirm: false }]
}

export function actionDescription(action: VmAction, name: string): string {
  switch (action) {
    case 'shutdown':
      return `向 ${name} 发送 ACPI 关机信号。客户机需要响应后才能完成关机。`
    case 'stop':
      return `立即切断 ${name} 的电源。未保存的数据可能丢失，仅在其他关闭方式失败时使用。`
    case 'reboot':
      return `向 ${name} 发送重启信号。客户机会重新启动。`
    case 'reset':
      return `立即重置 ${name} 的虚拟硬件，不等待客户机响应。未保存的数据可能丢失。`
    case 'suspend':
      return `将 ${name} 的当前运行状态挂起到存储。`
    default:
      return `即将对 ${name} 执行此操作。`
  }
}

interface VmActionButtonsProps {
  target: ActionTarget
  onAction: (target: ActionTarget, action: VmAction) => void
  onConsole?: (target: ActionTarget) => void
  busy?: boolean
  compact?: boolean
  showStatus?: boolean
}

export function VmRowActions({
  target,
  onAction,
  onConsole,
  busy = false,
  compact = true,
  showStatus = false
}: VmActionButtonsProps): React.JSX.Element {
  const actions = getAvailableActions(target)
  const primary = target.status === 'running' ? actions.find((item) => item.action === 'shutdown') : actions[0]
  const PrimaryIcon = primary?.icon ?? Power

  if (target.template) {
    return (
      <div className="flex items-center justify-end gap-2">
        {showStatus && <VmStatusBadge status={target.status || 'stopped'} template />}
        <span className="font-mono text-[9px] text-muted-foreground">READ ONLY</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
      {showStatus && <VmStatusBadge status={target.status || 'unknown'} />}
      {primary && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={primary.destructive ? 'destructive' : 'outline'}
              size={compact ? 'icon-sm' : 'sm'}
              disabled={busy}
              onClick={() => onAction(target, primary.action)}
              aria-label={primary.label}
            >
              <PrimaryIcon className="h-3.5 w-3.5" />
              {!compact && primary.label}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{primary.label}</TooltipContent>
        </Tooltip>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={busy} aria-label="更多操作">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[188px]">
          <DropdownMenuLabel>{target.name}</DropdownMenuLabel>
          {actions.map((item) => {
            const Icon = item.icon
            return (
              <DropdownMenuItem
                key={item.action}
                destructive={item.destructive}
                onSelect={() => onAction(target, item.action)}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </DropdownMenuItem>
            )
          })}
          {onConsole && target.status === 'running' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onConsole(target)}>
                <Terminal className="h-3.5 w-3.5" />
                打开控制台
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function VmDetailActionBar({
  target,
  onAction,
  onConsole,
  busy
}: {
  target: ActionTarget
  onAction: (target: ActionTarget, action: VmAction) => void
  onConsole: (target: ActionTarget) => void
  busy?: boolean
}): React.JSX.Element {
  const actions = getAvailableActions(target)
  const primary = target.status === 'running' ? actions.find((item) => item.action === 'shutdown') : actions[0]
  const PrimaryIcon = primary?.icon ?? Power
  const others = actions.filter((item) => item.action !== primary?.action)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary && (
        <Button
          variant={primary.destructive ? 'destructive' : 'default'}
          onClick={() => onAction(target, primary.action)}
          loading={busy}
        >
          <PrimaryIcon className="h-3.5 w-3.5" />
          {primary.label}
        </Button>
      )}
      {target.status === 'running' && (
        <Button variant="outline" onClick={() => onConsole(target)} disabled={busy}>
          <Terminal className="h-3.5 w-3.5" />
          控制台
        </Button>
      )}
      {others.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" disabled={busy} aria-label="更多电源操作">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[190px]">
            <DropdownMenuLabel>电源操作</DropdownMenuLabel>
            {others.map((item) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem
                  key={item.action}
                  destructive={item.destructive}
                  onSelect={() => onAction(target, item.action)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <span className={cn('ml-1 text-[10px] text-muted-foreground', busy && 'text-brand')}>
        {busy ? '正在下发指令…' : '通过 PVE API 控制'}
      </span>
    </div>
  )
}
