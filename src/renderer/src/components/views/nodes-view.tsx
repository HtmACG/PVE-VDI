import { ArrowUpRight, Boxes, Cpu, HardDrive, MemoryStick, Plus, RefreshCw, Server, Terminal } from 'lucide-react'
import type { DashboardData, NodeSummary } from '@shared/types'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Progress } from '@renderer/components/ui/primitives'
import { AreaChart } from '@renderer/components/charts/area-chart'
import { NodeStatusBadge } from '@renderer/components/status-badges'
import { EmptyState } from '@renderer/components/common'
import { formatBytes, formatDateTime, formatPercent, formatUptimeShort, splitLicense } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import type { ViewKey } from '@renderer/components/layout/sidebar'

interface NodesViewProps {
  dashboard: DashboardData
  liveAt?: number
  liveError?: string | null
  onCreateVm: () => void
  onRefresh: () => void
  onNavigate: (view: ViewKey) => void
  onOpenShell: (node: string) => void
}

function ResourceMetric({
  label,
  ratio,
  detail,
  color
}: {
  label: string
  ratio: number
  detail: string
  color: string
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="font-mono text-[18px] text-foreground">{formatPercent(ratio, 1)}</span>
      </div>
      <Progress value={Math.min(100, ratio * 100)} className="mt-2 h-1" indicatorClassName={color} />
      <div className="mt-1.5 text-[10px] text-muted-foreground">{detail}</div>
    </div>
  )
}

function NodeCard({
  node,
  dashboard,
  onNavigate,
  onOpenShell,
  liveAt,
  liveError
}: {
  node: NodeSummary
  dashboard: DashboardData
  onNavigate: (view: ViewKey) => void
  onOpenShell: (node: string) => void
  liveAt?: number
  liveError?: string | null
}): React.JSX.Element {
  const nodeVms = dashboard.vms.filter((vm) => vm.node === node.node && !vm.template)
  const running = nodeVms.filter((vm) => vm.status === 'running').length
  const storages = dashboard.storages.filter((storage) => storage.node === node.node)
  const points = node.metrics.map((point) => ({ time: point.time, value: point.cpu }))
  const memoryRatio = node.maxmem > 0 ? node.mem / node.maxmem : 0
  const diskRatio = node.maxdisk > 0 ? node.disk / node.maxdisk : 0
  const allocatedVcpu = nodeVms.reduce((sum, vm) => sum + vm.cpus, 0)

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-semibold tracking-tight text-foreground">{node.node}</h2>
            <NodeStatusBadge status={node.status} />
            <span className={cn('text-[10px]', liveError ? 'text-warning' : 'text-muted-foreground')}>
              {liveError ? '实时数据中断' : liveAt ? `实时 · ${formatDateTime(liveAt, { second: '2-digit' })}` : '实时'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {node.cpuModel ?? 'Proxmox 节点'} · PVE {splitLicense(node.pveVersion ?? '')}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 text-right">
            <div className="text-[10px] text-muted-foreground">运行时间</div>
            <div className="mt-0.5 text-[12px] text-foreground">{formatUptimeShort(node.uptime)}</div>
          </div>
          <div className="mr-2 text-right">
            <div className="text-[10px] text-muted-foreground">虚拟机</div>
            <div className="mt-0.5 text-[12px] text-foreground">
              {running} / {nodeVms.length}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onNavigate('vms')}>
            虚拟机
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenShell(node.node)} disabled={node.status !== 'online'}>
            <Terminal className="h-3.5 w-3.5" />
            终端
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 border-b border-border px-4 py-4 sm:grid-cols-3">
        <ResourceMetric
          label="CPU 使用"
          ratio={node.cpu}
          detail={`${node.cores ?? '—'} 核 / ${node.maxcpu} 线程 · 已分配 ${allocatedVcpu} vCPU`}
          color={node.cpu > 0.85 ? 'bg-destructive' : 'bg-brand'}
        />
        <ResourceMetric
          label="内存使用"
          ratio={memoryRatio}
          detail={`${formatBytes(node.mem)} / ${formatBytes(node.maxmem)} · 可用 ${formatBytes(node.memAvailable ?? Math.max(0, node.maxmem - node.mem))}`}
          color={memoryRatio > 0.85 ? 'bg-destructive' : 'bg-info'}
        />
        <ResourceMetric
          label="根磁盘使用"
          ratio={diskRatio}
          detail={`${formatBytes(node.disk)} / ${formatBytes(node.maxdisk)}`}
          color={diskRatio > 0.85 ? 'bg-destructive' : 'bg-foreground'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12">
        <div className="border-b border-border p-4 xl:col-span-8 xl:border-b-0 xl:border-r">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[12px] font-medium text-foreground">CPU 使用率</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">最近 1 小时</div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              负载 {node.loadavg.length ? node.loadavg.map((value) => value.toFixed(2)).join(' / ') : '—'}
            </div>
          </div>
          <AreaChart
            points={points}
            height={172}
            color="var(--brand)"
            formatValue={(value) => formatPercent(value, 1)}
            emptyLabel="正在读取节点遥测"
          />
        </div>

        <div className="p-4 xl:col-span-4">
          <div className="text-[12px] font-medium text-foreground">服务器信息</div>
          <dl className="mt-2 divide-y divide-border/70 text-[11px]">
            {[
              ['CPU 型号', node.cpuModel ?? '—'],
              ['CPU 拓扑', `${node.sockets ?? '—'} 路 / ${node.cores ?? '—'} 核 / ${node.maxcpu} 线程`],
              ['KSM 共享', node.ksmShared ? formatBytes(node.ksmShared) : '未启用'],
              ['PVE 版本', splitLicense(node.pveVersion ?? '') || '—'],
              ['SSL 指纹', node.sslFingerprint ?? '—']
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2">
                <dt className="shrink-0 text-muted-foreground">{label}</dt>
                <dd className={cn('min-w-0 text-right text-foreground', label === 'SSL 指纹' && 'break-all font-mono text-[9px]')}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="border-t border-border px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
            <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
            存储
          </div>
          <span className="text-[10px] text-muted-foreground">{storages.length} 个存储池</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {storages.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">没有存储资源。</div>
          ) : (
            storages.map((storage) => (
              <div key={storage.id} className="border border-border bg-panel/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] text-foreground">{storage.storage}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{storage.type}</span>
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                  <span>
                    {formatBytes(storage.used)} / {formatBytes(storage.total)}
                  </span>
                  <span>{formatPercent(storage.usedFraction, 1)}</span>
                </div>
                <Progress
                  value={storage.usedFraction * 100}
                  className="mt-1.5 h-1"
                  indicatorClassName={
                    storage.usedFraction > 0.85
                      ? 'bg-destructive'
                      : storage.usedFraction > 0.75
                        ? 'bg-warning'
                        : 'bg-foreground'
                  }
                />
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  )
}

export function NodesView({
  dashboard,
  liveAt,
  liveError,
  onCreateVm,
  onRefresh,
  onNavigate,
  onOpenShell
}: NodesViewProps): React.JSX.Element {
  const online = dashboard.nodes.filter((node) => node.status === 'online').length
  const totalThreads = dashboard.nodes.reduce((sum, node) => sum + node.maxcpu, 0)
  const totalMemory = dashboard.nodes.reduce((sum, node) => sum + node.maxmem, 0)
  const usedMemory = dashboard.nodes.reduce((sum, node) => sum + node.mem, 0)
  const totalVms = dashboard.vms.filter((vm) => !vm.template).length
  const runningVms = dashboard.vms.filter((vm) => !vm.template && vm.status === 'running').length
  const cpuUsage = totalThreads > 0
    ? dashboard.nodes.reduce((sum, node) => sum + node.cpu * node.maxcpu, 0) / totalThreads
    : 0
  const memoryUsage = totalMemory > 0 ? usedMemory / totalMemory : 0

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="节点"
        description="节点健康、资源占用、存储和硬件信息。资源数据每 2 秒刷新。"
        actions={
          <>
            <Button variant="outline" onClick={onRefresh}>
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
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            在线节点
            <Server className="h-4 w-4 text-muted-foreground/70" />
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="font-mono text-[25px] text-foreground">{online}</span>
            <span className="font-mono text-[11px] text-muted-foreground">/ {dashboard.nodes.length}</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">{dashboard.cluster.quorate ? 'Quorum 正常' : 'Quorum 异常'}</div>
        </div>
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            CPU 使用
            <Cpu className="h-4 w-4 text-muted-foreground/70" />
          </div>
          <div className="mt-3 font-mono text-[25px] text-foreground">{formatPercent(cpuUsage, 1)}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">{totalThreads} 个线程 · 集群平均</div>
        </div>
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            内存使用
            <MemoryStick className="h-4 w-4 text-muted-foreground/70" />
          </div>
          <div className="mt-3 font-mono text-[25px] text-foreground">{formatPercent(memoryUsage, 1)}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {formatBytes(usedMemory)} / {formatBytes(totalMemory)}
          </div>
        </div>
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            虚拟机
            <Boxes className="h-4 w-4 text-muted-foreground/70" />
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="font-mono text-[25px] text-foreground">{runningVms}</span>
            <span className="font-mono text-[11px] text-muted-foreground">/ {totalVms} 运行中</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">{totalVms - runningVms} 台已停止</div>
        </div>
      </div>

      {dashboard.nodes.length === 0 ? (
        <Card>
          <EmptyState icon={<Server className="h-5 w-5" />} title="没有节点" description="集群中没有可用的 Proxmox 节点。" />
        </Card>
      ) : (
        <div className="space-y-3">
          {dashboard.nodes.map((node) => (
            <NodeCard
              key={node.node}
              node={node}
              dashboard={dashboard}
              onNavigate={onNavigate}
              onOpenShell={onOpenShell}
              liveAt={liveAt}
              liveError={liveError}
            />
          ))}
        </div>
      )}

      {dashboard.nodes.length > 1 && (
        <Card>
          <div className="border-b border-border px-4 py-3.5">
            <h2 className="text-[14px] font-medium text-foreground">节点对比</h2>
            <div className="mt-1 text-[11px] text-muted-foreground">节点资源使用情况</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">节点</th>
                  <th className="px-3 py-2.5 font-medium">状态</th>
                  <th className="px-3 py-2.5 font-medium">CPU</th>
                  <th className="px-3 py-2.5 font-medium">内存</th>
                  <th className="px-3 py-2.5 font-medium">根磁盘</th>
                  <th className="px-4 py-2.5 font-medium">版本</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.nodes.map((node) => (
                  <tr key={node.node} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-foreground">{node.node}</td>
                    <td className="px-3 py-2.5">
                      <NodeStatusBadge status={node.status} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-foreground">{formatPercent(node.cpu, 1)}</td>
                    <td className="px-3 py-2.5 text-[11px] text-foreground">
                      {formatPercent(node.maxmem > 0 ? node.mem / node.maxmem : 0, 1)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                      {formatBytes(node.disk)} / {formatBytes(node.maxdisk)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                      {splitLicense(node.pveVersion ?? '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
