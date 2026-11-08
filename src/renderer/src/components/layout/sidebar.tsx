import {
  Activity,
  Archive,
  Bot,
  Boxes,
  ClipboardList,
  Database,
  Disc3,
  Flame,
  LayoutDashboard,
  LogOut,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  UsersRound
} from 'lucide-react'
import type { DashboardData, SessionProfile, Theme } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

export type ViewKey =
  | 'ai'
  | 'overview'
  | 'vms'
  | 'nodes'
  | 'images'
  | 'storage'
  | 'backup'
  | 'cluster'
  | 'sdn'
  | 'ha'
  | 'firewall'
  | 'access'
  | 'tasks'
  | 'settings'

interface SidebarProps {
  active: ViewKey
  dashboard: DashboardData | null
  session: SessionProfile
  theme: Theme
  collapsed: boolean
  onToggleCollapsed: () => void
  onNavigate: (view: ViewKey) => void
  onToggleTheme: () => void
  onDisconnect: () => void
}

const AI_NAV = [{ key: 'ai' as const, label: 'AI 助手', icon: Bot }]

const WORKLOAD_NAV = [
  { key: 'overview' as const, label: '总览', icon: LayoutDashboard },
  { key: 'vms' as const, label: '虚拟机', icon: Boxes }
]

const INFRA_NAV = [
  { key: 'nodes' as const, label: '节点', icon: Server },
  { key: 'storage' as const, label: '存储', icon: Database },
  { key: 'images' as const, label: '镜像', icon: Disc3 },
  { key: 'backup' as const, label: '备份', icon: Archive }
]

const CLUSTER_NAV = [
  { key: 'cluster' as const, label: '集群', icon: Activity },
  { key: 'sdn' as const, label: 'SDN', icon: Network },
  { key: 'ha' as const, label: '高可用', icon: ShieldCheck },
  { key: 'firewall' as const, label: '防火墙', icon: Flame },
  { key: 'access' as const, label: '访问控制', icon: UsersRound },
  { key: 'tasks' as const, label: '任务', icon: ClipboardList }
]

export function Sidebar({
  active,
  dashboard,
  session,
  theme,
  collapsed,
  onToggleCollapsed,
  onNavigate,
  onToggleTheme,
  onDisconnect
}: SidebarProps): React.JSX.Element {
  const vms = dashboard?.vms.filter((vm) => !vm.template) ?? []
  const runningTasks = dashboard?.tasks.filter((task) => task.status === 'running').length ?? 0
  const nodes = dashboard?.nodes ?? []
  const storageCount = new Set((dashboard?.storages ?? []).map((storage) => storage.storage)).size

  const renderItem = (item: { key: ViewKey; label: string; icon: typeof LayoutDashboard }): React.JSX.Element => {
    const Icon = item.icon
    const selected = active === item.key
    const count =
      item.key === 'vms'
        ? vms.length
        : item.key === 'nodes'
          ? nodes.length
          : item.key === 'storage'
            ? storageCount || undefined
            : item.key === 'tasks' && runningTasks > 0
              ? runningTasks
              : undefined
    return (
      <button
        key={item.key}
        type="button"
        aria-current={selected ? 'page' : undefined}
        aria-label={item.label}
        title={collapsed ? item.label : undefined}
        onClick={() => onNavigate(item.key)}
        className={cn(
          'relative flex h-10 w-full items-center text-left text-[13px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
          selected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-panel/70 hover:text-foreground'
        )}
      >
        {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-brand" />}
        <Icon
          className={cn(
            collapsed ? 'h-4 w-4' : 'h-[15px] w-[15px]',
            selected ? 'text-brand' : 'text-muted-foreground'
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {count !== undefined && (
              <span className={cn('font-mono text-[11px]', selected ? 'text-foreground' : 'text-muted-foreground')}>
                {count}
              </span>
            )}
          </>
        )}
      </button>
    )
  }

  const sectionLabel = (label: string): React.JSX.Element | null =>
    collapsed ? null : (
      <div className="px-4 pb-1.5 text-[11px] font-medium tracking-[0.04em] text-muted-foreground/80">{label}</div>
    )

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200',
        collapsed ? 'w-[60px]' : 'w-[220px]'
      )}
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
    >
      <div
        className={cn(
          'flex h-10 shrink-0 items-center border-b border-border',
          collapsed ? 'justify-center' : 'justify-between px-3'
        )}
      >
        {!collapsed && (
          <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            导航
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
              className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{collapsed ? '展开侧边栏' : '收起侧边栏'}</TooltipContent>
        </Tooltip>
      </div>

      <div className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-1.5' : '')}>
        {sectionLabel('工作负载')}
        <nav className={cn(collapsed ? '' : 'px-2')}>{WORKLOAD_NAV.map(renderItem)}</nav>

        <div className={collapsed ? 'mt-3' : 'mt-5'}>
          {sectionLabel('智能助手')}
          <nav className={cn(collapsed ? '' : 'px-2')}>{AI_NAV.map(renderItem)}</nav>
        </div>

        <div className={collapsed ? 'mt-3' : 'mt-5'}>
          {sectionLabel('基础设施')}
          <nav className={cn(collapsed ? '' : 'px-2')}>{INFRA_NAV.map(renderItem)}</nav>
        </div>

        <div className={collapsed ? 'mt-3' : 'mt-5'}>
          {sectionLabel('集群运维')}
          <nav className={cn(collapsed ? '' : 'px-2')}>{CLUSTER_NAV.map(renderItem)}</nav>
        </div>

        {!collapsed && (
          <div className="mx-3 mt-5 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[12px] font-medium text-foreground">
                {dashboard?.cluster.name ?? session.clusterName}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-success">
                <span className="h-1.5 w-1.5 bg-success" aria-hidden="true" />
                {dashboard?.cluster.quorate ? 'Quorum 正常' : 'Quorum 异常'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          aria-label="首选项"
          title={collapsed ? '首选项' : undefined}
          className={cn(
            'relative flex h-9 w-full items-center text-left text-[12px] transition-colors',
            collapsed ? 'justify-center px-0' : 'gap-2.5 px-5',
            active === 'settings'
              ? 'bg-panel text-foreground'
              : 'text-muted-foreground hover:bg-panel/70 hover:text-foreground'
          )}
        >
          {active === 'settings' && <span className="absolute inset-y-0 left-0 w-[2px] bg-brand" />}
          <Settings className="h-[15px] w-[15px]" />
          {!collapsed && '首选项'}
        </button>
        <div
          className={cn(
            'border-t border-border',
            collapsed ? 'flex flex-col items-center gap-1 py-2' : 'flex items-center gap-2 px-3 py-2.5'
          )}
        >
          <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-foreground">{session.username}</div>
              <div className="text-[11px] text-muted-foreground">已连接</div>
            </div>
          )}
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'gap-0')}>
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
      </div>
    </aside>
  )
}
