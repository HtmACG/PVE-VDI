import {
  Loader2,
  Monitor,
  MoreHorizontal,
  Pause,
  Play,
  Power,
  RotateCw,
  Square,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import type { ConsoleMode, VmAction, VmConsoleInfo, VmType } from '@shared/types'
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
  /** 客户机系统类型；windows 时默认用 Administrator 连 SSH */
  ostype?: string
  /** 控制台能力；为空表示还没探测到，前端按「可用」处理并允许试一次 */
  console?: VmConsoleInfo
}

/**
 * 操作进行中的按钮文案：按钮转圈时显示「正在启动…」这类状态，
 * 不再只转圈不给动作名称。
 */
const ACTION_PROGRESS_LABELS: Record<VmAction, string> = {
  start: '正在启动',
  shutdown: '正在关闭',
  stop: '正在关闭',
  reboot: '正在重启',
  reset: '正在重置',
  suspend: '正在挂起',
  resume: '正在恢复'
}

export function actionProgressLabel(action: VmAction | null | undefined): string | null {
  return action ? `${ACTION_PROGRESS_LABELS[action]}…` : null
}

/**
 * 控制台模式是否可用。没探测到就乐观放行——真不支持时主进程会给出中文原因，
 * 比一进来就全灰掉更不容易误伤老版本 PVE。
 */
export function consoleAvailability(
  target: ActionTarget,
  mode: ConsoleMode
): { enabled: boolean; reason?: string } {
  if (target.template) {
    return { enabled: false, reason: '模板不能打开控制台，请克隆成虚拟机后再试' }
  }
  if (target.status !== 'running') {
    return { enabled: false, reason: '虚拟机未运行，启动后才能打开控制台' }
  }
  const info = target.console
  if (!info) return { enabled: true }
  if (mode === 'novnc') {
    return info.vnc ? { enabled: true } : { enabled: false, reason: info.vncReason ?? '该虚拟机不支持 VNC 控制台' }
  }
  return info.xterm ? { enabled: true } : { enabled: false, reason: info.xtermReason ?? '该虚拟机不支持终端控制台' }
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
  onConsole?: (target: ActionTarget, mode: ConsoleMode) => void
  busy?: boolean
  /** 正在执行的动作；busy 时用于显示「正在启动…」这类状态 */
  busyAction?: VmAction | null
  compact?: boolean
  showStatus?: boolean
}

/**
 * 控制台子菜单：VNC / xterm.js 两项，不支持的那项置灰并给出原因。
 * 之所以不用 disabled 的 DropdownMenuItem，是因为需要的 tooltip 在禁用的元素上不触发，
 * 这里用 aria-disabled + 点击拦截来保留悬浮提示。
 */
function ConsoleMenuItems({
  target,
  onConsole
}: {
  target: ActionTarget
  onConsole?: (target: ActionTarget, mode: ConsoleMode) => void
}): React.JSX.Element {
  const backend = target.console?.xtermBackend
  const guestHost = target.console?.guestHost
  const isLxc = target.type === 'lxc'
  // 通道标签：客户机 SSH / LXC pty；QEMU 串口已取消
  const channelTag = isLxc ? 'pty' : guestHost ? 'SSH' : 'SSH 手动'
  const xtermHint = guestHost
    ? `直连虚拟机内 SSH（${guestHost}），文件面板同步进虚拟机`
    : isLxc
      ? 'LXC 容器 pty（lxc-attach），不依赖容器内是否开了 SSH'
      : '打开终端后填写客户机 SSH 地址与账号密码（QEMU 串口已取消）'

  const options: Array<{ mode: ConsoleMode; label: string; icon: LucideIcon; hint: string; tag?: string }> = [
    { mode: 'novnc', label: 'VNC 控制台', icon: Monitor, hint: '图形界面（noVNC）' },
    {
      mode: 'xterm',
      label: 'xterm.js 终端',
      icon: Terminal,
      hint: xtermHint,
      tag: channelTag
    }
  ]

  return (
    <>
      {options.map((option) => {
        const { enabled, reason } = consoleAvailability(target, option.mode)
        const Icon = option.icon
        return (
          <DropdownMenuItem
            key={option.mode}
            disabled={!enabled}
            aria-disabled={!enabled}
            data-console-mode={option.mode}
            data-console-enabled={enabled}
            data-console-backend={option.mode === 'xterm' ? (guestHost ? 'guest-ssh' : backend) : undefined}
            onSelect={(event) => {
              if (!enabled) {
                event.preventDefault()
                return
              }
              onConsole?.(target, option.mode)
            }}
            className={cn(!enabled && 'opacity-45')}
            title={enabled ? option.hint : reason}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="flex-1">{option.label}</span>
            {!enabled ? (
              <span className="font-mono text-[10px] text-muted-foreground">不可用</span>
            ) : (
              option.tag && (
                <span className="font-mono text-[9.5px] text-muted-foreground/80">{option.tag}</span>
              )
            )}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

export function VmRowActions({
  target,
  onAction,
  onConsole,
  busy = false,
  busyAction = null,
  compact = true,
  showStatus = false
}: VmActionButtonsProps): React.JSX.Element {
  const actions = getAvailableActions(target)
  const primary = target.status === 'running' ? actions.find((item) => item.action === 'shutdown') : actions[0]
  const PrimaryIcon = primary?.icon ?? Power
  const progress = busy ? actionProgressLabel(busyAction) : null

  if (target.template) {
    return (
      <div className="flex items-center justify-end gap-2">
        {showStatus && <VmStatusBadge status={target.status || 'stopped'} template />}
        <span className="font-mono text-[10px] text-muted-foreground">READ ONLY</span>
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
              size={busy || !compact ? 'sm' : 'icon-sm'}
              disabled={busy}
              onClick={() => onAction(target, primary.action)}
              aria-label={progress ?? primary.label}
              aria-busy={busy || undefined}
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 spin" />
                  {progress}
                </>
              ) : (
                <>
                  <PrimaryIcon className="h-3.5 w-3.5" />
                  {!compact && primary.label}
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{progress ?? primary.label}</TooltipContent>
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
                disabled={busy}
                onSelect={() => onAction(target, item.action)}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </DropdownMenuItem>
            )
          })}
          {onConsole && target.status === 'running' && !target.template && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10.5px] font-normal text-muted-foreground">
                打开控制台
              </DropdownMenuLabel>
              <ConsoleMenuItems target={target} onConsole={onConsole} />
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
  busy,
  busyAction = null
}: {
  target: ActionTarget
  onAction: (target: ActionTarget, action: VmAction) => void
  onConsole: (target: ActionTarget, mode: ConsoleMode) => void
  busy?: boolean
  busyAction?: VmAction | null
}): React.JSX.Element {
  const actions = getAvailableActions(target)
  const primary = target.status === 'running' ? actions.find((item) => item.action === 'shutdown') : actions[0]
  const PrimaryIcon = primary?.icon ?? Power
  const others = actions.filter((item) => item.action !== primary?.action)
  const consoleReady = target.status === 'running' && !target.template
  const progress = busy ? actionProgressLabel(busyAction) : null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary && (
        <Button
          variant={primary.destructive ? 'destructive' : 'default'}
          onClick={() => onAction(target, primary.action)}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 spin" /> : <PrimaryIcon className="h-3.5 w-3.5" />}
          {progress ?? primary.label}
        </Button>
      )}
      {consoleReady && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={busy}>
              <Terminal className="h-3.5 w-3.5" />
              控制台
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px]">
            <DropdownMenuLabel className="text-[10.5px] font-normal text-muted-foreground">
              选择控制台类型
            </DropdownMenuLabel>
            <ConsoleMenuItems target={target} onConsole={onConsole} />
          </DropdownMenuContent>
        </DropdownMenu>
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
      <span className={cn('ml-1 text-[11px] text-muted-foreground', busy && 'text-brand')}>
        {busy ? (progress ?? '正在下发指令…') : '通过 PVE API 控制'}
      </span>
    </div>
  )
}
