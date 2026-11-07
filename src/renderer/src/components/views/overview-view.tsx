import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  ChevronRight,
  Container,
  HardDrive,
  Plus,
  Server,
  Users
} from 'lucide-react'
import type {
  ConsoleMode,
  DashboardData,
  NodeSummary,
  TaskSummary,
  VmAction,
  VmSummary
} from '@shared/types'
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
import { EmptyState, StatTile } from '@renderer/components/common'
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
  /** 正在执行的动作（配合 busyKey 显示「正在启动…」） */
  busyAction?: VmAction | null
  onCreateVm: () => void
  onNavigate: (view: ViewKey) => void
  onOpenVm: (vm: VmSummary) => void
  onAction: (target: ActionTarget, action: VmAction) => void
  onConsole: (target: ActionTarget, mode: ConsoleMode) => void
  onOpenTask: (task: TaskSummary) => void
}

/**
 * 异常摘要条：只在真有异常时出现，把「离线节点 / 失败任务 / 高水位存储」提到首屏。
 * 正常时整条不占位，避免和统计卡重复罗列同一组数字。
 */
function HealthStrip({
  dashboard,
  onNavigate
}: {
  dashboard: DashboardData
  onNavigate: (view: ViewKey) => void
}): React.JSX.Element | null {
  const offline = dashboard.nodes.filter((node) => node.status !== 'online')
  const failed = dashboard.tasks.filter((task) => task.status === 'error')
  const hot = dashboard.storages.filter((storage) => storage.usedFraction >= 0.85)
  if (offline.length === 0 && failed.length === 0 && hot.length === 0) return null

  const Item = ({
    count,
    label,
    view
  }: {
    count: number
    label: string
    view: ViewKey
  }): React.JSX.Element => (
    <button
      type="button"
      onClick={() => onNavigate(view)}
      className="group flex items-baseline gap-1.5 text-[12px] text-foreground transition-colors hover:text-warning"
    >
      <span className="font-mono text-[13px] font-medium tabular">{count}</span>
      <span className="text-muted-foreground group-hover:text-foreground">{label}</span>
      <ChevronRight className="h-3 w-3 translate-y-0.5 text-muted-foreground/70" />
    </button>
  )

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-warning/35 bg-warning/[0.04] px-4 py-2.5">
      <div className="flex items-center gap-2 text-[12px] font-medium text-warning">
        <AlertTriangle className="h-3.5 w-3.5" />
        需要关注
      </div>
      {offline.length > 0 && <Item count={offline.length} label="个节点离线" view="nodes" />}
      {failed.length > 0 && <Item count={failed.length} label="个任务失败" view="tasks" />}
      {hot.length > 0 && <Item count={hot.length} label="个存储使用率超过 85%" view="storage" />}
    </div>
  )
}

function ServerResources({
  nodes,
  serverUrl,
  selectedNode,
  onSelectNode,
  liveAt,
  liveError
}: {
  nodes: NodeSummary[]
  serverUrl?: string
  selectedNode: string
  onSelectNode: (node: string) => void
  liveAt?: number
  liveError?: string | null
}): React.JSX.Element {
  const node = nodes.find((item) => item.node === selectedNode) ?? nodes[0]
  const memoryRatio = node && node.maxmem > 0 ? node.mem / node.maxmem : 0
  const diskRatio = node && node.maxdisk > 0 ? node.disk / node.maxdisk : 0
  const points = (node?.metrics ?? []).map((point) => ({ time: point.time, value: point.cpu }))
  /** 1 小时曲线按峰值自适应纵轴，避免低负载时曲线贴底；峰值同时写在标题右侧 */
  const peakCpu = points.reduce((max, point) => Math.max(max, point.value), 0)
  const chartMax = Math.min(1, Math.max(0.12, peakCpu * 1.4))
  const hostThreads = nodes.reduce((sum, item) => sum + item.maxcpu, 0)
  /** 头部已经显示过 CPU 型号，底栏再放一遍是重复；这里换成登录用的 PVE 地址 */
  const pveAddress = (serverUrl ?? '').replace(/^https?:\/\//, '').replace(/\/+$/, '')

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
    <Card className="flex h-full flex-col">
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

      <div className="flex flex-1 flex-col px-4 pt-3.5">
        <CoreGrid loads={node.cpuCores} total={node.maxcpu} className="mb-2.5" />
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-[12px] font-medium text-foreground">CPU 负载</div>
          <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">峰值 {formatPercent(peakCpu, 1)}</span>
            <span className="text-muted-foreground/60">·</span>
            <span>最近 1 小时</span>
          </div>
        </div>
        <div className="min-h-[150px] flex-1">
          <AreaChart
            points={points}
            height="100%"
            yMax={chartMax}
            color="var(--brand)"
            formatValue={(value) => formatPercent(value, 1)}
            emptyLabel="正在读取节点遥测"
          />
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-x-6 border-t border-border px-4 py-3 sm:grid-cols-4">
        <div>
          <div className="text-[11px] text-muted-foreground">PVE 地址</div>
          <div className="mt-1 truncate font-mono text-[12px] text-foreground" title={pveAddress}>
            {pveAddress || '—'}
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
  const { cluster, nodes } = dashboard

  return (
    <Card>
      <div className="border-b border-border px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-medium text-foreground">集群状态</h2>
          <QuorumBadge quorate={cluster.quorate} />
        </div>
        <div className="mt-1 text-[12px] text-muted-foreground">{cluster.name}</div>
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
          <span className="text-muted-foreground">HA 状态</span>
          <span className="text-foreground">{cluster.ha.some((entry) => entry.type === 'service' || entry.type === 'resource') ? '已启用' : '无托管资源'}</span>
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
  busyAction,
  onOpenVm,
  onAction,
  onConsole,
  onNavigate
}: {
  dashboard: DashboardData
  busyKey: string | null
  busyAction?: VmAction | null
  onOpenVm: (vm: VmSummary) => void
  onAction: (target: ActionTarget, action: VmAction) => void
  onConsole: (target: ActionTarget, mode: ConsoleMode) => void
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
          <div className="mt-1 text-[12px] text-muted-foreground">按 CPU 使用率排序</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onNavigate('vms')}>
          查看全部
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px]">
          <thead>
            <tr className="border-b border-border bg-panel/30 text-left text-[11px] tracking-[0.02em] text-muted-foreground">
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
                template: vm.template,
                ostype: vm.os?.family === 'windows' ? 'win11' : '',
                  console: vm.console
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
                      busyAction={busyKey === `${vm.type}/${vm.vmid}` ? busyAction : null}
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
    <Card>
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
  busyAction,
  onCreateVm,
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

  /**
   * LXC 容器单独统计。
   * 上面那张「运行中虚拟机」卡只算 qemu，容器混在里面会让人误判虚拟机数量；
   * 模板不参与统计（和上卡的 `!vm.template` 保持一致）。
   */
  const containers = dashboard.vms.filter((vm) => vm.type === 'lxc' && !vm.template)
  const runningContainers = containers.filter((vm) => vm.status === 'running').length
  const nodeHosts = new Set(containers.map((vm) => vm.node)).size

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="运行概览"
        description="查看节点资源占用、集群健康状态和虚拟机运行情况。资源数据每 2 秒刷新。"
        actions={
          <Button onClick={onCreateVm}>
            <Plus className="h-3.5 w-3.5" />
            新建虚拟机
          </Button>
        }
      />

      <HealthStrip dashboard={dashboard} onNavigate={onNavigate} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="节点"
          value={String(onlineNodes)}
          unit={`/ ${dashboard.nodes.length} 在线`}
          detail={
            onlineNodes === dashboard.nodes.length
              ? '全部节点在线'
              : `${dashboard.nodes.length - onlineNodes} 个节点未在线`
          }
          icon={<Server className="h-4 w-4" />}
        />
        <StatTile
          label="运行中虚拟机"
          value={String(running)}
          unit={`/ ${vms.length}`}
          detail={`${vms.length - running} 台已停止${templates ? ` · ${templates} 个模板` : ''}`}
          icon={<Boxes className="h-4 w-4" />}
        />
        <StatTile
          label="LXC 容器"
          value={String(runningContainers)}
          unit={`/ ${containers.length}`}
          detail={`${containers.length - runningContainers} 个已停止${
            nodeHosts ? ` · 分布在 ${nodeHosts} 个节点` : ''
          }`}
          icon={<Container className="h-4 w-4" />}
        />
        <StatTile
          label="用户数量"
          value={dashboard.userCount === undefined ? '—' : String(dashboard.userCount)}
          detail={
            dashboard.userCount === undefined ? '当前 API Token 无读取权限' : 'PVE 账号总数'
          }
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <ServerResources
            nodes={dashboard.nodes}
            serverUrl={dashboard.cluster.serverUrl}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            liveAt={liveAt}
            liveError={liveError}
          />
        </div>
        <div className="space-y-3 xl:col-span-4">
          <ClusterPanel dashboard={dashboard} />
          <StoragePanel dashboard={dashboard} />
        </div>
      </div>

      <VmFleet
        dashboard={dashboard}
        busyKey={busyKey}
        busyAction={busyAction}
        onOpenVm={onOpenVm}
        onAction={onAction}
        onConsole={onConsole}
        onNavigate={onNavigate}
      />

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
