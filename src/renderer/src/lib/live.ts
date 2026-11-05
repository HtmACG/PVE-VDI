import type { DashboardData, LiveMetricsData, NodeMetricPoint } from '@shared/types'

const MAX_LIVE_POINTS = 120

export function mergeLiveMetrics(
  dashboard: DashboardData | null,
  live: LiveMetricsData | null
): DashboardData | null {
  if (!dashboard || !live) return dashboard
  const liveByNode = new Map(live.nodes.map((node) => [node.node, node]))

  return {
    ...dashboard,
    nodes: dashboard.nodes.map((node) => {
      const current = liveByNode.get(node.node)
      if (!current) return node

      const point: NodeMetricPoint = {
        time: live.fetchedAt,
        cpu: current.cpu,
        mem: current.maxmem > 0 ? current.mem / current.maxmem : 0
      }
      const metrics = [...node.metrics, point].slice(-MAX_LIVE_POINTS)

      return {
        ...node,
        status: current.status,
        cpu: current.cpu,
        maxcpu: current.maxcpu || node.maxcpu,
        mem: current.mem,
        maxmem: current.maxmem || node.maxmem,
        disk: current.disk,
        maxdisk: current.maxdisk || node.maxdisk,
        uptime: current.uptime,
        metrics
      }
    })
  }
}
