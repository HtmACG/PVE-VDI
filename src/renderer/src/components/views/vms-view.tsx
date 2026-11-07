import { useDeferredValue, useMemo, useState } from 'react'
import { Boxes, Cpu, HardDrive, MemoryStick, Plus, Search, Server, SlidersHorizontal, X } from 'lucide-react'
import type { ConsoleMode, DashboardData, VmAction, VmSummary } from '@shared/types'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Progress } from '@renderer/components/ui/primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { EmptyState, StatTile } from '@renderer/components/common'
import { VmStatusBadge } from '@renderer/components/status-badges'
import { VmRowActions, type ActionTarget } from '@renderer/components/vms/vm-actions'
import { OsIcon } from '@renderer/components/os-icon'
import {
  formatBytes,
  formatPercent,
  formatUptimeShort,
  relativeTime
} from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'

interface VmsViewProps {
  dashboard: DashboardData
  busyKey: string | null
  /** 正在执行的动作（配合 busyKey 显示「正在启动…」） */
  busyAction?: VmAction | null
  onCreateVm: () => void
  onOpenVm: (vm: VmSummary) => void
  onAction: (target: ActionTarget, action: VmAction) => void
  onConsole: (target: ActionTarget, mode: ConsoleMode) => void
}

type StatusFilter = 'all' | 'running' | 'stopped' | 'other' | 'template'

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '运行中' },
  { value: 'stopped', label: '已停止' },
  { value: 'other', label: '挂起/暂停' },
  { value: 'template', label: '模板' }
]

function statusMatches(vm: VmSummary, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'template') return vm.template
  if (filter === 'running') return !vm.template && vm.status === 'running'
  if (filter === 'stopped') return !vm.template && (vm.status === 'stopped' || vm.status === 'unknown')
  return !vm.template && (vm.status === 'paused' || vm.status === 'suspended')
}
export function VmsView({
  dashboard,
  busyKey,
  busyAction,
  onCreateVm,
  onOpenVm,
  onAction,
  onConsole
}: VmsViewProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [node, setNode] = useState('all')
  const [tag, setTag] = useState('all')
  const deferredQuery = useDeferredValue(query)

  const nodes = useMemo(() => Array.from(new Set(dashboard.vms.map((vm) => vm.node))).sort(), [dashboard.vms])
  const tags = useMemo(() => Array.from(new Set(dashboard.vms.flatMap((vm) => vm.tags))).sort(), [dashboard.vms])

  const counts = useMemo(() => {
    return {
      all: dashboard.vms.length,
      running: dashboard.vms.filter((vm) => statusMatches(vm, 'running')).length,
      stopped: dashboard.vms.filter((vm) => statusMatches(vm, 'stopped')).length,
      other: dashboard.vms.filter((vm) => statusMatches(vm, 'other')).length,
      template: dashboard.vms.filter((vm) => vm.template).length
    }
  }, [dashboard.vms])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return dashboard.vms
      .filter((vm) => statusMatches(vm, status))
      .filter((vm) => node === 'all' || vm.node === node)
      .filter((vm) => tag === 'all' || vm.tags.includes(tag))
      .filter((vm) => {
        if (!q) return true
        return (
          vm.name.toLowerCase().includes(q) ||
          String(vm.vmid).includes(q) ||
          vm.node.toLowerCase().includes(q) ||
          vm.os.name.toLowerCase().includes(q) ||
          vm.tags.some((item) => item.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => {
        if (a.template !== b.template) return a.template ? 1 : -1
        return a.vmid - b.vmid
      })
  }, [dashboard.vms, deferredQuery, node, status, tag])

  const hasFilters = Boolean(query) || status !== 'all' || node !== 'all' || tag !== 'all'
  const workloads = dashboard.vms.filter((vm) => !vm.template)
  const allocatedCpu = workloads.reduce((sum, vm) => sum + vm.cpus, 0)
  const allocatedMemory = workloads.reduce((sum, vm) => sum + vm.maxmem, 0)
  const allocatedDisk = workloads.reduce((sum, vm) => sum + vm.maxdisk, 0)
  const availableMemory = dashboard.nodes.reduce(
    (sum, item) => sum + (item.memAvailable ?? Math.max(0, item.maxmem - item.mem)),
    0
  )

  const clearFilters = (): void => {
    setQuery('')
    setStatus('all')
    setNode('all')
    setTag('all')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="虚拟机"
        description="按状态、节点与标签筛选工作负载，查看资源分配并执行电源、控制台与配置操作。"
        actions={
          <Button onClick={onCreateVm}>
            <Plus className="h-3.5 w-3.5" />
            新建虚拟机
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="已分配 vCPU"
          value={String(allocatedCpu)}
          unit="vCPU"
          detail={`跨 ${workloads.length} 台虚拟机`}
          icon={<Cpu className="h-4 w-4" />}
        />
        <StatTile
          label="已分配内存"
          value={formatBytes(allocatedMemory)}
          detail="按配置上限汇总"
          icon={<MemoryStick className="h-4 w-4" />}
        />
        <StatTile
          label="已分配磁盘"
          value={formatBytes(allocatedDisk)}
          detail="虚拟磁盘容量合计"
          icon={<HardDrive className="h-4 w-4" />}
        />
        <StatTile
          label="集群可用内存"
          value={formatBytes(availableMemory)}
          detail="节点当前可用"
          icon={<Server className="h-4 w-4" />}
        />
      </div>

      <div className="border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            筛选
          </div>
          <div className="flex flex-wrap items-center border border-border">
            {STATUS_FILTERS.map((filter) => {
              const count = counts[filter.value]
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatus(filter.value)}
                  className={cn(
                    'flex h-7 items-center gap-1.5 border-r border-border px-2.5 text-[12px] transition-colors last:border-r-0',
                    status === filter.value
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  {filter.label}
                  <span className={cn('font-mono text-[11px]', status === filter.value ? 'text-background/70' : 'text-muted-foreground/70')}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="relative ml-auto w-full sm:w-[230px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、VMID、标签…"
              className="h-8 pl-8 pr-7 text-[12px]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="清除搜索"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Select value={node} onValueChange={setNode}>
            <SelectTrigger className="h-8 w-[120px] text-[12px]">
              <SelectValue placeholder="节点" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有节点</SelectItem>
              {nodes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="h-8 w-[120px] text-[12px]">
              <SelectValue placeholder="标签" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有标签</SelectItem>
              {tags.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3 w-3" />
              重置
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-border bg-panel/30 text-[11px] tracking-[0.02em] text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">虚拟机</th>
                <th className="px-3 py-2.5 font-medium">状态</th>
                <th className="px-3 py-2.5 font-medium">节点</th>
                <th className="px-3 py-2.5 font-medium">CPU</th>
                <th className="min-w-[150px] px-3 py-2.5 font-medium">内存</th>
                <th className="px-3 py-2.5 font-medium">磁盘</th>
                <th className="px-3 py-2.5 font-medium">运行时间</th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((vm) => {
                const template = vm.template
                const target: ActionTarget = {
                  node: vm.node,
                  type: vm.type,
                  vmid: vm.vmid,
                  name: vm.name,
                  status: vm.status,
                  template,
                  ostype: vm.os?.family === 'windows' ? 'win11' : '',
                  console: vm.console
                }
                return (
                  <tr
                    key={vm.id}
                    onClick={() => onOpenVm(vm)}
                    className="group cursor-pointer border-b border-border/65 transition-colors last:border-b-0 hover:bg-panel/45"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <OsIcon os={vm.os} size="md" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[12px] font-medium text-foreground">{vm.name}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {vm.type.toUpperCase()} {vm.vmid}
                            </span>
                            {vm.tags.slice(0, 2).map((item) => (
                              <span key={item} className="text-[11px] text-muted-foreground">
                                {item}
                              </span>
                            ))}
                            {vm.tags.length > 2 && (
                              <span className="text-[11px] text-muted-foreground">+{vm.tags.length - 2}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <VmStatusBadge status={vm.status} template={template} />
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px] text-muted-foreground">{vm.node}</td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-[12px] text-foreground">{formatPercent(vm.cpu, 1)}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{vm.cpus} vCPU</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
                        <span className="text-foreground">{formatBytes(vm.mem)}</span>
                        <span className="text-[11px] text-muted-foreground">{formatBytes(vm.maxmem)}</span>
                      </div>
                      <Progress
                        value={vm.maxmem > 0 ? (vm.mem / vm.maxmem) * 100 : 0}
                        className="mt-1.5 h-[3px]"
                        indicatorClassName={vm.status === 'running' ? 'bg-foreground' : 'bg-border-strong'}
                      />
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-foreground">{formatBytes(vm.maxdisk)}</td>
                    <td className="px-3 py-3 text-[12px] text-muted-foreground">
                      {formatUptimeShort(vm.uptime)}
                    </td>
                    <td className="px-4 py-3">
                      <VmRowActions
                        target={target}
                        onAction={onAction}
                        onConsole={onConsole}
                        busy={busyKey === `${vm.type}/${vm.vmid}`}
                        busyAction={busyKey === `${vm.type}/${vm.vmid}` ? busyAction : null}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <EmptyState
            icon={hasFilters ? <Search className="h-5 w-5" /> : <Boxes className="h-5 w-5" />}
            title={hasFilters ? '没有匹配的虚拟机' : '还没有虚拟机'}
            description={hasFilters ? '调整搜索或状态筛选后再试。' : '创建一个新的 QEMU 虚拟机，或从模板克隆。'}
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  清除筛选
                </Button>
              ) : (
                <Button size="sm" onClick={onCreateVm}>
                  <Plus className="h-3.5 w-3.5" />
                  新建虚拟机
                </Button>
              )
            }
          />
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <span>
            显示 {filtered.length} / {dashboard.vms.length} 台虚拟机
          </span>
          <span>
            最近同步 {relativeTime(Math.floor(dashboard.fetchedAt / 1000))} · {dashboard.latencyMs}ms
          </span>
        </div>
      </div>
    </div>
  )
}
