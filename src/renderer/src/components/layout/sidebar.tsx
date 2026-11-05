import {
  Activity,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Server,
  Settings,
  Sun,
  UserRound
} from 'lucide-react'
import type { DashboardData, SessionProfile, Theme } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/primitives'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

export type ViewKey = 'overview' | 'vms' | 'nodes' | 'cluster' | 'tasks' | 'settings'

interface SidebarProps {
  active: ViewKey
  dashboard: DashboardData | null
  session: SessionProfile
  theme: Theme
  onNavigate: (view: ViewKey) => void
  onCreateVm: () => void
  onToggleTheme: () => void
  onDisconnect: () => void
}

const WORKLOAD_NAV = [
  { key: 'overview' as const, label: '总览', icon: LayoutDashboard },
  { key: 'vms' as const, label: '虚拟机', icon: Boxes }
]

const INFRA_NAV = [
  { key: 'nodes' as const, label: '节点', icon: Server },
  { key: 'cluster' as const, label: '集群', icon: Activity },
  { key: 'tasks' as const, label: '任务', icon: ClipboardList }
]

export function Sidebar({
  active,
  dashboard,
  session,
  theme,
  onNavigate,
  onCreateVm,
  onToggleTheme,
  onDisconnect
}: SidebarProps): React.JSX.Element {
  const vms = dashboard?.vms.filter((vm) => !vm.template) ?? []
  const runningVms = vms.filter((vm) => vm.status === 'running').length
  const runningTasks = dashboard?.tasks.filter((task) => task.status === 'running').length ?? 0
  const nodes = dashboard?.nodes ?? []
  const usedMemory = nodes.reduce((sum, node) => sum + node.mem, 0)
  const totalMemory = nodes.reduce((sum, node) => sum + node.maxmem, 0)
  const memoryPercent = totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0

  const renderItem = (item: { key: ViewKey; label: string; icon: typeof LayoutDashboard }): React.JSX.Element => {
    const Icon = item.icon
    const selected = active === item.key
    const count =
      item.key === 'vms'
        ? vms.length
        : item.key === 'nodes'
          ? nodes.length
          : item.key === 'tasks' && runningTasks > 0
            ? runningTasks
            : undefined
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => onNavigate(item.key)}
        className={cn(
          'relative flex h-9 w-full items-center gap-2.5 px-3 text-left text-[12px] transition-colors',
          selected ? 'bg-panel text-foreground' : 'text-muted-foreground hover:bg-panel/70 hover:text-foreground'
        )}
      >
        {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-brand" />}
        <Icon className={cn('h-[15px] w-[15px]', selected ? 'text-brand' : 'text-muted-foreground')} />
        <span className="flex-1">{item.label}</span>
        {count !== undefined && (
          <span className={cn('font-mono text-[10px]', selected ? 'text-foreground' : 'text-muted-foreground')}>{count}</span>
        )}
      </button>
    )
  }

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-3">
        <Button variant="outline" className="w-full justify-start" onClick={onCreateVm}>
          <Plus className="h-3.5 w-3.5 text-brand" />
          新建虚拟机
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-4 pb-1.5 text-[10px] font-medium text-muted-foreground">工作负载</div>
        <nav className="px-2">{WORKLOAD_NAV.map(renderItem)}</nav>

        <div className="mt-5 px-4 pb-1.5 text-[10px] font-medium text-muted-foreground">基础设施</div>
        <nav className="px-2">{INFRA_NAV.map(renderItem)}</nav>

        <div className="mx-3 mt-5 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-foreground">{dashboard?.cluster.name ?? session.clusterName}</span>
            <span className="text-[10px] text-success">
              {dashboard?.cluster.quorate ? 'Quorum 正常' : 'Quorum 异常'}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {nodes.length} 个节点 · {runningVms} 台虚拟机运行中
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>集群内存</span>
              <span className="font-mono">{memoryPercent.toFixed(1)}%</span>
            </div>
            <Progress
              value={memoryPercent}
              className="mt-1.5 h-[3px]"
              indicatorClassName={memoryPercent > 85 ? 'bg-destructive' : 'bg-brand'}
            />
          </div>
          <div className="mt-2.5 font-mono text-[10px] text-muted-foreground">
            PVE {dashboard?.version.version ?? '—'}
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={cn(
            'relative flex h-9 w-full items-center gap-2.5 px-5 text-left text-[12px] transition-colors',
            active === 'settings'
              ? 'bg-panel text-foreground'
              : 'text-muted-foreground hover:bg-panel/70 hover:text-foreground'
          )}
        >
          {active === 'settings' && <span className="absolute inset-y-0 left-0 w-[2px] bg-brand" />}
          <Settings className="h-[15px] w-[15px]" />
          设置
        </button>
        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] text-foreground">{session.username}</div>
            <div className="text-[10px] text-muted-foreground">已连接</div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="切换主题"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{theme === 'dark' ? '切换浅色模式' : '切换深色模式'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onDisconnect}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                aria-label="断开连接"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>断开连接</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  )
}
