import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Boxes,
  ChevronRight,
  Cpu,
  HardDrive,
  MemoryStick,
  Plus,
  RefreshCw,
  Server
} from 'lucide-react'
import type { DashboardData, NodeSummary, TaskSummary, VmAction, VmSummary } from '@shared/types'
import { TASK_TYPE_LABELS } from '@shared/ipc'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Card } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { AreaChart } from '@renderer/components/charts/area-chart'
import { CoreGrid } from '@renderer/components/charts/core-grid'
import { GaugePanel, type GaugeSpec } from '@renderer/components/charts/gauge-panel'
import { NodeStatusBadge, QuorumBadge, TaskStatusBadge, VmStatusBadge } from '@renderer/components/status-badges'
import { VmRowActions, type ActionTarget } from '@renderer/components/vms/vm-actions'
import { OsIcon } from '@renderer/components/os-icon'
import { EmptyState } from '@renderer/components/common'
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatUptimeShort,
  splitLicense
} from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import type { ViewKey } from '@renderer/components/layout/sidebar'

interface OverviewViewProps {
  dashboard: DashboardData
  liveAt?: number
  liveError?: string | null
  busyKey: string | null
  onCreateVm: () => void
  onRefresh: () => void
  onNavigate: (view: ViewKey) => void
  onOpenVm: (vm: VmSummary) => void
  onAction: (target: ActionTarget, action: VmAction) => void
  onConsole: (target: ActionTarget) => void
  onOpenTask: (task: TaskSummary) => void
}

function StatCard({
  label,
  value,
  unit,
  detail,
  icon,
  usage,
  color = 'bg-brand'
}: {
  label: string
  value: string
  unit?: string
  detail: string
  icon: React.ReactNode
  usage?: number
  color?: string
}): React.JSX.Element {
  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
        <div className="text-muted-foreground/70">{icon}</div>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-[28px] font-medium leading-none tracking-[-0.04em] text-foreground tabular">
          {value}
        </span>
        {unit && <span className="font-mono text-[12px] text-muted-foreground">{unit}</span>}
      </div>
      {usage !== undefined && (
        <Progress value={Math.min(100, usage * 100)} className="mt-3 h-[3px]" indicatorClassName={color} />
      )}
      <div className="mt-2.5 text-[12px] leading-5 text-muted-foreground">{detail}</div>
    </div>
  )
}

function ServerResources({
  nodes,
  selectedNode,
  onSelectNode,
  liveAt,
  liveError
}: {
  nodes: NodeSummary[]
  selectedNode: string
  onSelectNode: (node: string) => void
  liveAt?: number
  liveError?: string | null
}): React.JSX.Element {
  const node = nodes.find((item) => item.node === selectedNode) ?? nodes[0]
  const memoryRatio = node && node.maxmem > 0 ? node.mem / node.maxmem : 0
  const diskRatio = node && node.maxdisk > 0 ? node.disk / node.maxdisk : 0
  const points = (node?.metrics ?? []).map((point) => ({ time: point.time, value: point.cpu }))
  const hostThreads = nodes.reduce((sum, item) => sum + item.maxcpu, 0)

  const gauges: GaugeSpec[] = node
    ? [
        {
          label: 'CPU 使用率',
          ratio: node.cpu,
          display: formatPercent(node.cpu, 1),
          caption: `共 ${node.maxcpu} 线程 · 负载 ${
            node.loadavg.length ? node.loadavg.map((v) => v.toFixed(2)).join(' / ') : '—'
          }`,
          color: node.cpu > 0.85 ? 'var(--destructive)' : 'var(--brand)'
        },
        {
          label: '内存使用',
          ratio: memoryRatio,
          display: formatPercent(memoryRatio, 1),
          caption: `${formatBytes(node.mem)} / ${formatBytes(node.maxmem)}`,
          color: memoryRatio > 0.85 ? 'var(--destructive)' : 'var(--info)'
        },
        {
          label: '根磁盘使用',
          ratio: diskRatio,
          display: formatPercent(diskRatio, 1),
          caption: `${formatBytes(node.disk)} / ${formatBytes(node.maxdisk)}`,
          color: diskRatio > 0.85 ? 'var(--destructive)' : 'var(--fg)'
        }
      ]
    : []

  if (!node) {
    return (
      <Card>
        <EmptyState icon={<Server className="h-5 w-5" />} title="没有节点数据" description="集群中暂无可读节点。" />
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-medium text-foreground">服务器资源</h2>
            <span className="font-mono text-[12px] text-muted-foreground">{node.node}</span>
            <NodeStatusBadge status={node.status} />
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {node.cpuModel ?? 'Proxmox 节点'}
            {node.sockets ? ` · ${node.sockets} 路 / ${node.cores} 核` : ''}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-[12px] font-medium', liveError ? 'text-warning' : 'text-success')}>
            {liveError ? '实时数据中断' : '实时刷新'}
          </span>
          {liveAt && <span className="font-mono text-[11px] text-muted-foreground">更新于 {formatDateTime(liveAt, { second: '2-digit' })}</span>}
          {nodes.length > 1 && (
            <Select value={node.node} onValueChange={onSelectNode}>
              <SelectTrigger className="h-7 w-[118px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {nodes.map((item) => (
                  <SelectItem key={item.node} value={item.node}>
                    {item.node}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <GaugePanel items={gauges} className="border-b border-border" />

      <div className="px-4 pt-3.5">
        <CoreGrid loads={node.cpuCores} total={node.maxcpu} className="mb-2.5" />
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-[12px] font-medium text-foreground">CPU 负载</div>
          <div className="text-[11px] text-muted-foreground">最近 1 小时</div>
        </div>
        <AreaChart
          points={points}
          height={160}
          color="var(--brand)"
          formatValue={(value) => formatPercent(value, 1)}
          emptyLabel="正在读取节点遥测"
        />
      </div>

      <div className="mt-auto grid grid-cols-2 gap-x-6 border-t border-border px-4 py-3 sm:grid-cols-4">
        <div>
          <div className="text-[11px] text-muted-foreground">CPU 型号</div>
          <div className="mt-1 truncate text-[12px] text-foreground" title={node.cpuModel}>
            {node.cpuModel ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">运行时间</div>
          <div className="mt-1 text-[12px] text-foreground">{formatUptimeShort(node.uptime)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">集群线程</div>
          <div className="mt-1 text-[12px] text-foreground">{hostThreads} 线程</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">PVE 版本</div>
          <div className="mt-1 text-[12px] text-foreground">{splitLicense(node.pveVersion ?? '') || '—'}</div>
        </div>
      </div>
    </Card>
  )
}

function ClusterPanel({ dashboard }: { dashboard: DashboardData }): React.JSX.Element {
  const { cluster, nodes, storages } = dashboard
  const workloads = dashboard.vms.filter((vm) => !vm.template)
  const running = workloads.filter((vm) => vm.status === 'running').length
  const stopped = workloads.filter((vm) => vm.status === 'stopped').length
  const templates = dashboard.vms.filter((vm) => vm.template).length
  const totalStorage = storages.reduce((sum, storage) => sum + storage.total, 0)
  const usedStorage = storages.reduce((sum, storage) => sum + storage.used, 0)
  const storageUsage = totalStorage > 0 ? usedStorage / totalStorage : 0

  return (
    <Card className="h-full">
      <div className="border-b border-border px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-medium text-foreground">集群状态</h2>
          <QuorumBadge quorate={cluster.quorate} />
        </div>
        <div className="mt-1 text-[12px] text-muted-foreground">
          {cluster.name} · {nodes.length} 个节点
        </div>
      </div>
      <div className="divide-y divide-border">
        {nodes.map((node) => (
          <div key={node.node} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[12px] text-foreground">{node.node}</span>
              <NodeStatusBadge status={node.status} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-4 text-[12px] text-muted-foreground">
              <span>CPU {formatPercent(node.cpu, 1)}</span>
              <span className="text-right">
                内存 {formatPercent(node.maxmem > 0 ? node.mem / node.maxmem : 0, 1)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">虚拟机状态</span>
          <span className="text-muted-foreground">{workloads.length} 台</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <div className="font-mono text-[18px] text-foreground">{running}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">运行中</div>
          </div>
          <div>
            <div className="font-mono text-[18px] text-foreground">{stopped}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">已停止</div>
          </div>
          <div>
            <div className="font-mono text-[18px] text-foreground">{templates}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">模板</div>
          </div>
        </div>
      </div>
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">存储占用</span>
          <span className="font-mono text-foreground">{formatPercent(storageUsage, 1)}</span>
        </div>
        <Progress
          value={storageUsage * 100}
          className="mt-1.5 h-1"
          indicatorClassName={storageUsage > 0.85 ? 'bg-destructive' : 'bg-foreground'}
        />
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {formatBytes(usedStorage)} / {formatBytes(totalStorage)} · {storages.length} 个存储池
        </div>
      </div>
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">HA 状态</span>
          <span className="text-foreground">{cluster.ha.some((entry) => entry.type === 'service' || entry.type === 'resource') ? '已启用' : '无托管资源'}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">集群版本</span>
          <span className="font-mono text-foreground">PVE {splitLicense(dashboard.version.version)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">默认键盘</span>
          <span className="font-mono text-foreground">{cluster.keyboard ?? '—'}</span>
        </div>
      </div>
    </Card>
  )
}

function VmFleet({
  dashboard,
  busyKey,
  onOpenVm,
  onAction,
  onConsole,
  onNavigate
}: {
  dashboard: DashboardData
  busyKey: string | null
  onOpenVm: (vm: VmSummary) => void
  onAction: (target: ActionTarget, action: VmAction) => void
  onConsole: (target: ActionTarget) => void
  onNavigate: (view: ViewKey) => void
}): React.JSX.Element {
  const vms = useMemo(
    () =>
      [...dashboard.vms]
        .filter((vm) => !vm.template)
        .sort((a, b) => {
          if (a.status === 'running' && b.status !== 'running') return -1
          if (b.status === 'running' && a.status !== 'running') return 1
          return b.cpu - a.cpu
        })
        .slice(0, 7),
    [dashboard.vms]
  )

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div>
          <h2 className="text-[14px] font-medium text-foreground">虚拟机</h2>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {dashboard.vms.filter((vm) => !vm.template).length} 台 ·{' '}
            {dashboard.vms.filter((vm) => vm.status === 'running' && !vm.template).length} 台运行中
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onNavigate('vms')}>
          查看全部
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">虚拟机</th>
              <th className="px-3 py-2.5 font-medium">状态</th>
              <th className="px-3 py-2.5 font-medium">CPU</th>
              <th className="px-3 py-2.5 font-medium">内存</th>
              <th className="px-3 py-2.5 font-medium">运行时间</th>
              <th className="px-4 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {vms.map((vm) => {
              const target: ActionTarget = {
                node: vm.node,
                type: vm.type,
                vmid: vm.vmid,
                name: vm.name,
                status: vm.status,
                template: vm.template
              }
              return (
                <tr
                  key={vm.id}
                  onClick={() => onOpenVm(vm)}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-panel/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <OsIcon os={vm.os} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-medium text-foreground">{vm.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {vm.type.toUpperCase()} {vm.vmid}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <VmStatusBadge status={vm.status} template={vm.template} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-mono text-[12px] text-foreground">{formatPercent(vm.cpu, 1)}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{vm.cpus} vCPU</div>
                  </td>
                  <td className="min-w-[120px] px-3 py-3">
                    <div className="font-mono text-[11px] text-foreground">
                      {formatBytes(vm.mem)}
                      <span className="text-muted-foreground"> / {formatBytes(vm.maxmem)}</span>
                    </div>
                    <Progress
                      value={vm.maxmem > 0 ? (vm.mem / vm.maxmem) * 100 : 0}
                      className="mt-1.5 h-[3px] w-24"
                      indicatorClassName={vm.status === 'running' ? 'bg-foreground' : 'bg-border-strong'}
                    />
                  </td>
                  <td className="px-3 py-3 text-[12px] text-muted-foreground">{formatUptimeShort(vm.uptime)}</td>
                  <td className="px-4 py-3">
                    <VmRowActions
                      target={target}
                      onAction={onAction}
                      onConsole={onConsole}
                      busy={busyKey === `${vm.type}/${vm.vmid}`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {vms.length === 0 && (
        <EmptyState icon={<Boxes className="h-5 w-5" />} title="还没有虚拟机" description="创建第一台虚拟机，或从模板开始快速交付。" />
      )}
    </Card>
  )
}

function StoragePanel({ dashboard }: { dashboard: DashboardData }): React.JSX.Element {
  return (
    <Card className="h-full">
      <div className="border-b border-border px-4 py-3.5">
        <h2 className="text-[14px] font-medium text-foreground">存储</h2>
        <div className="mt-1 text-[12px] text-muted-foreground">{dashboard.storages.length} 个存储池</div>
      </div>
      <div className="divide-y divide-border">
        {dashboard.storages.length === 0 ? (
          <div className="px-4 py-5 text-[12px] text-muted-foreground">没有可用的存储资源。</div>
        ) : (
          dashboard.storages.map((storage) => (
            <div key={storage.id} className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-[12px] font-medium text-foreground">{storage.storage}</span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">{storage.type}</span>
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>{formatBytes(storage.used)} / {formatBytes(storage.total)}</span>
                <span>{formatPercent(storage.usedFraction, 1)}</span>
              </div>
              <Progress
                value={storage.usedFraction * 100}
                className="mt-1.5 h-1"
                indicatorClassName={storage.usedFraction > 0.85 ? 'bg-destructive' : storage.usedFraction > 0.75 ? 'bg-warning' : 'bg-foreground'}
              />
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function TaskRow({ task, onOpen }: { task: TaskSummary; onOpen: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-panel/60"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] text-foreground">{TASK_TYPE_LABELS[task.type] ?? task.type}</span>
          {task.id && <span className="font-mono text-[11px] text-muted-foreground">#{task.id}</span>}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {task.node} · {task.user}
        </div>
      </div>
      <TaskStatusBadge status={task.status} />
      <div className="w-[90px] shrink-0 text-right">
        <div className="font-mono text-[11px] text-muted-foreground">{formatDateTime(task.startTime * 1000)}</div>
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">{formatDuration(task.duration)}</div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  )
}

export function OverviewView({
  dashboard,
  liveAt,
  liveError,
  busyKey,
  onCreateVm,
  onRefresh,
  onNavigate,
  onOpenVm,
  onAction,
  onConsole,
  onOpenTask
}: OverviewViewProps): React.JSX.Element {
  const [selectedNode, setSelectedNode] = useState(dashboard.nodes[0]?.node ?? '')
  useEffect(() => {
    if (!dashboard.nodes.some((node) => node.node === selectedNode)) {
      setSelectedNode(dashboard.nodes[0]?.node ?? '')
    }
  }, [dashboard.nodes, selectedNode])

  const vms = dashboard.vms.filter((vm) => !vm.template)
  const running = vms.filter((vm) => vm.status === 'running').length
  const templates = dashboard.vms.filter((vm) => vm.template).length
  const onlineNodes = dashboard.nodes.filter((node) => node.status === 'online').length
  const hostCpus = dashboard.nodes.reduce((sum, node) => sum + node.maxcpu, 0)
  const totalMemory = dashboard.nodes.reduce((sum, node) => sum + node.maxmem, 0)
  const usedMemory = dashboard.nodes.reduce((sum, node) => sum + node.mem, 0)
  const cpuUsage =
    hostCpus > 0 ? dashboard.nodes.reduce((sum, node) => sum + node.cpu * node.maxcpu, 0) / hostCpus : 0
  const memoryUsage = totalMemory > 0 ? usedMemory / totalMemory : 0

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="运行概览"
        description="查看节点资源占用、集群健康状态和虚拟机运行情况。资源数据每 2 秒刷新。"
        actions={
          <>
            <Button variant="surface" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </Button>
            <Button onClick={onCreateVm}>
              <Plus className="h-3.5 w-3.5" />
              新建虚拟机
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="节点"
          value={String(onlineNodes)}
          unit={`/ ${dashboard.nodes.length} 在线`}
          detail={`${dashboard.cluster.quorate ? 'Quorum 正常' : 'Quorum 异常'} · PVE ${splitLicense(dashboard.version.version)}`}
          icon={<Server className="h-4 w-4" />}
        />
        <StatCard
          label="运行中虚拟机"
          value={String(running)}
          unit={`/ ${vms.length}`}
          detail={`${vms.length - running} 台已停止${templates ? ` · ${templates} 个模板` : ''}`}
          icon={<Boxes className="h-4 w-4" />}
        />
        <StatCard
          label="CPU 使用率"
          value={formatPercent(cpuUsage, 1)}
          detail={`${hostCpus} 个线程 · 集群平均负载`}
          icon={<Cpu className="h-4 w-4" />}
          usage={cpuUsage}
          color={cpuUsage > 0.85 ? 'bg-destructive' : 'bg-brand'}
        />
        <StatCard
          label="内存使用率"
          value={formatPercent(memoryUsage, 1)}
          detail={`${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}`}
          icon={<MemoryStick className="h-4 w-4" />}
          usage={memoryUsage}
          color={memoryUsage > 0.85 ? 'bg-destructive' : 'bg-info'}
        />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <ServerResources
            nodes={dashboard.nodes}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            liveAt={liveAt}
            liveError={liveError}
          />
        </div>
        <div className="xl:col-span-4">
          <ClusterPanel dashboard={dashboard} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <VmFleet
            dashboard={dashboard}
            busyKey={busyKey}
            onOpenVm={onOpenVm}
            onAction={onAction}
            onConsole={onConsole}
            onNavigate={onNavigate}
          />
        </div>
        <div className="xl:col-span-4">
          <StoragePanel dashboard={dashboard} />
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div>
            <h2 className="text-[14px] font-medium text-foreground">最近任务</h2>
            <div className="mt-1 text-[12px] text-muted-foreground">最近的集群操作记录</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('tasks')}>
            所有任务
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        {dashboard.tasks.length === 0 ? (
          <EmptyState icon={<ChevronRight className="h-5 w-5" />} title="没有任务记录" description="PVE 任务将在这里出现。" />
        ) : (
          <div className="divide-y divide-border/60">
            {dashboard.tasks.slice(0, 6).map((task) => (
              <TaskRow key={task.upid} task={task} onOpen={() => onOpenTask(task)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
