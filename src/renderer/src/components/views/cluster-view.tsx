import { Activity, Boxes, ChevronRight, Database, HardDrive, Server } from 'lucide-react'
import type { DashboardData, TaskSummary } from '@shared/types'
import { TASK_TYPE_LABELS } from '@shared/ipc'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Card } from '@renderer/components/ui/card'
import { Progress } from '@renderer/components/ui/primitives'
import { TaskStatusBadge } from '@renderer/components/status-badges'
import { EmptyState, StatTile } from '@renderer/components/common'
import { ClusterMembersCard } from './cluster-members-card'
import { formatBytes, formatDateTime, formatPercent } from '@renderer/lib/format'

export function ClusterView({
  dashboard,
  onOpenTask
}: {
  dashboard: DashboardData
  onOpenTask?: (task: TaskSummary) => void
}): React.JSX.Element {
  const { cluster, nodes, storages, vms } = dashboard
  const online = nodes.filter((node) => node.status === 'online').length
  const hostCpus = nodes.reduce((sum, node) => sum + node.maxcpu, 0)
  const workloads = vms.filter((vm) => !vm.template).length
  const running = vms.filter((vm) => vm.status === 'running').length
  const totalStorage = storages.reduce((sum, storage) => sum + storage.total, 0)
  const usedStorage = storages.reduce((sum, storage) => sum + storage.used, 0)
  const haState = cluster.ha.find((entry) => entry.type === 'quorum') ?? cluster.ha[0]
  const haResources = cluster.ha.filter((entry) => entry.type === 'service' || entry.type === 'resource')

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${cluster.name} 集群`}
        title="集群"
        description="查看 Quorum、节点成员、HA 与存储状态。"
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Quorum"
          value={cluster.quorate ? '正常' : '异常'}
          detail={`${online} / ${nodes.length} 个节点在线`}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatTile
          label="节点"
          value={String(nodes.length)}
          detail={`${hostCpus} 个 CPU 线程`}
          icon={<Server className="h-4 w-4" />}
        />
        <StatTile
          label="虚拟机"
          value={String(workloads)}
          detail={`${running} 台运行中`}
          icon={<Boxes className="h-4 w-4" />}
        />
        <StatTile
          label="存储"
          value={formatBytes(totalStorage)}
          detail={`${formatPercent(totalStorage > 0 ? usedStorage / totalStorage : 0, 1)} 已使用`}
          icon={<Database className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
          <ClusterMembersCard dashboard={dashboard} />

          <Card>
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <div>
                <h2 className="text-[14px] font-medium text-foreground">最近任务</h2>
                <div className="mt-1 text-[12px] text-muted-foreground">集群最近的操作记录</div>
              </div>
              <span className="text-[11px] text-muted-foreground">{dashboard.tasks.length} 条</span>
            </div>
            <div className="divide-y divide-border">
              {dashboard.tasks.slice(0, 5).map((task) => (
                <button
                  key={task.upid}
                  type="button"
                  onClick={() => onOpenTask?.(task)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-panel/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[12px] text-foreground">
                        {TASK_TYPE_LABELS[task.type] ?? task.type}
                      </span>
                      {task.id && <span className="font-mono text-[11px] text-muted-foreground">#{task.id}</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {task.node} · {formatDateTime(task.startTime * 1000)}
                    </div>
                  </div>
                  <TaskStatusBadge status={task.status} />
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
              {dashboard.tasks.length === 0 && (
                <div className="px-4 py-5 text-[12px] text-muted-foreground">没有任务记录。</div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-3 xl:col-span-4">
          <Card>
            <div className="border-b border-border px-4 py-3.5">
              <h2 className="text-[14px] font-medium text-foreground">集群信息</h2>
            </div>
            <dl className="px-4 text-[12px]">
              {[
                ['集群名称', cluster.name],
                ['键盘布局', cluster.keyboard ?? '—'],
                ['PVE 版本', dashboard.version.version],
                ['HA 状态', haResources.length > 0 ? `${haResources.length} 个资源` : '无托管资源'],
                ['HA 仲裁', haState?.quorate ? '正常' : '—']
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-[14px] font-medium text-foreground">存储</h2>
              </div>
              <span className="text-[11px] text-muted-foreground">{storages.length} 个</span>
            </div>
            {storages.length === 0 ? (
              <EmptyState icon={<Database className="h-5 w-5" />} title="没有存储资源" />
            ) : (
              <div className="divide-y divide-border">
                {storages.map((storage) => (
                  <div key={storage.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[12px] text-foreground">{storage.storage}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{storage.type}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                      <span>{formatBytes(storage.used)} / {formatBytes(storage.total)}</span>
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
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
