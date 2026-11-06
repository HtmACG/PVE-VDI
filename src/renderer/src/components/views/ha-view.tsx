import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import type {
  ApiError,
  DashboardData,
  HaGroup,
  HaOverviewData,
  HaResource
} from '@shared/types'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/common'
import { PveUnavailable } from './pve-unavailable'

interface GroupFormState {
  group: string
  nodes: string
  comment: string
  restricted: boolean
  noFailback: boolean
}

export function HaView({ dashboard }: { dashboard: DashboardData }): React.JSX.Element {
  const [data, setData] = useState<HaOverviewData | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [groupForm, setGroupForm] = useState<GroupFormState | null>(null)
  const [formError, setFormError] = useState('')
  const [addVm, setAddVm] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.pvevdi.haOverview()
    if (result.ok) {
      setData(result.data)
      setError(null)
    } else {
      setData(null)
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const managedSids = useMemo(() => new Set((data?.resources ?? []).map((item) => item.sid)), [data?.resources])

  const candidates = useMemo(
    () =>
      dashboard.vms
        .filter((vm) => !vm.template)
        .map((vm) => `${vm.type === 'lxc' ? 'ct' : 'vm'}:${vm.vmid}`)
        .filter((sid) => !managedSids.has(sid)),
    [dashboard.vms, managedSids]
  )

  const statusOf = (sid: string): string | undefined =>
    data?.statuses.find((item) => item.id === sid)?.status

  const addResource = async (): Promise<void> => {
    if (!addVm) return
    setBusy('add')
    const result = await window.pvevdi.haResourceSave({ sid: addVm })
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setAddVm('')
    await load()
  }

  const removeResource = async (resource: HaResource): Promise<void> => {
    setBusy(resource.sid)
    const result = await window.pvevdi.haResourceSave({ sid: resource.sid, delete: true })
    setBusy(null)
    if (result.ok) await load()
  }

  const setState = async (resource: HaResource, state: 'started' | 'stopped' | 'disabled'): Promise<void> => {
    setBusy(`${resource.sid}:${state}`)
    const result = await window.pvevdi.haResourceSave({ sid: resource.sid, state })
    setBusy(null)
    if (result.ok) await load()
  }

  const submitGroup = async (): Promise<void> => {
    if (!groupForm) return
    setFormError('')
    if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(groupForm.group.trim())) {
      setFormError('组名必须以字母开头。')
      return
    }
    if (!groupForm.nodes.trim()) {
      setFormError('请填写组内节点，例如 pve1:1,pve2:1。')
      return
    }
    setBusy('group')
    const result = await window.pvevdi.haGroupSave({
      group: groupForm.group.trim(),
      nodes: groupForm.nodes.trim(),
      comment: groupForm.comment.trim() || undefined,
      restricted: groupForm.restricted,
      noFailback: groupForm.noFailback
    })
    setBusy(null)
    if (!result.ok) {
      setFormError(result.error.message)
      return
    }
    setGroupForm(null)
    await load()
  }

  const removeGroup = async (group: HaGroup): Promise<void> => {
    setBusy(`group:${group.group}`)
    const result = await window.pvevdi.haGroupSave({ group: group.group, nodes: group.nodes, delete: true })
    setBusy(null)
    if (result.ok) await load()
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow={`${dashboard.cluster.name} 集群`} title="高可用" description="HA 资源与节点组。" />
        <PveUnavailable error={error} onRetry={() => void load()} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="高可用"
        description="把关键虚拟机纳入 HA 管理，节点故障时由 HA 管理器自动迁移重启。"
        actions={
          <Button variant="surface" loading={loading} onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        }
      />

      <div className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
        {[
          ['HA 资源', data?.resources.length ?? 0],
          ['运行中', data?.resources.filter((item) => statusOf(item.sid) === 'started').length ?? 0],
          ['节点组', data?.groups.length ?? 0],
          ['未托管虚拟机', candidates.length]
        ].map(([label, value]) => (
          <div key={String(label)} className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0">
            <div className="text-[12px] text-muted-foreground">{label}</div>
            <div className="mt-1.5 font-mono text-[19px] text-foreground">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <div className="border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">HA 资源</span>
              <div className="ml-auto flex items-center gap-2">
                <Select value={addVm} onValueChange={setAddVm}>
                  <SelectTrigger className="h-7 w-[200px] text-[11px]">
                    <SelectValue placeholder="选择虚拟机加入 HA" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((sid) => {
                      const vm = dashboard.vms.find((item) => `${item.type === 'lxc' ? 'ct' : 'vm'}:${item.vmid}` === sid)
                      return (
                        <SelectItem key={sid} value={sid}>
                          {vm ? `${vm.name} · ${sid}` : sid}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" loading={busy === 'add'} disabled={!addVm} onClick={() => void addResource()}>
                  <Plus className="h-3 w-3" />
                  加入
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-border bg-panel/30 text-[11px] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">资源</th>
                    <th className="px-3 py-2.5 font-medium">状态</th>
                    <th className="px-3 py-2.5 font-medium">节点组</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">重启 / 迁移</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.resources ?? []).map((resource) => {
                    const status = statusOf(resource.sid)
                    return (
                      <tr key={resource.sid} className="border-b border-border/60 last:border-b-0 hover:bg-panel/40">
                        <td className="px-4 py-3">
                          <div className="font-mono text-[12px] text-foreground">{resource.sid}</div>
                          {resource.comment && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">{resource.comment}</div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            variant={
                              status === 'started' ? 'success' : status === 'stopped' ? 'muted' : 'warning'
                            }
                          >
                            {status === 'started'
                              ? '运行中'
                              : status === 'stopped'
                                ? '已停止'
                                : status ?? resource.state ?? '未知'}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                          {resource.group ?? '—'}
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                          {resource.maxRestart ?? '—'} / {resource.maxRelocate ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={busy === `${resource.sid}:started`}
                              onClick={() => void setState(resource, 'started')}
                            >
                              启动
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={busy === `${resource.sid}:stopped`}
                              onClick={() => void setState(resource, 'stopped')}
                            >
                              停止
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              loading={busy === resource.sid}
                              onClick={() => void removeResource(resource)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {(data?.resources.length ?? 0) === 0 && (
              <EmptyState
                icon={<ShieldCheck className="h-5 w-5" />}
                title="还没有 HA 资源"
                description="选择一台虚拟机加入 HA 后，节点宕机时它会自动在其它节点重启。"
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <div className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">节点组</span>
              <button
                type="button"
                onClick={() => {
                  setFormError('')
                  setGroupForm({ group: '', nodes: '', comment: '', restricted: false, noFailback: true })
                }}
                className="ml-auto flex h-6 items-center gap-1 border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                新建
              </button>
            </div>
            <div className="divide-y divide-border/60">
              {(data?.groups ?? []).map((group) => (
                <div key={group.group} className="group px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-foreground">{group.group}</span>
                    {group.restricted && <Badge variant="warning">受限</Badge>}
                    <button
                      type="button"
                      onClick={() => void removeGroup(group)}
                      className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      aria-label="删除节点组"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">{group.nodes}</div>
                  {group.comment && <div className="mt-0.5 text-[11px] text-muted-foreground">{group.comment}</div>}
                </div>
              ))}
              {(data?.groups.length ?? 0) === 0 && (
                <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">暂无节点组</div>
              )}
            </div>
          </div>

          {data && data.warnings.length > 0 && (
            <div className="mt-4 border border-warning/40 bg-warning/5 px-4 py-2.5 text-[11px] text-muted-foreground">
              {data.warnings.join(' · ')}
            </div>
          )}
        </div>
      </div>

      <Dialog open={Boolean(groupForm)} onOpenChange={(open) => !open && setGroupForm(null)}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>新建 HA 节点组</DialogTitle>
            <DialogDescription>节点按优先级排列，格式为 node:priority，例如 pve1:1,pve2:2。</DialogDescription>
          </DialogHeader>
          {groupForm && (
            <DialogBody>
              <div className="space-y-1.5">
                <Label htmlFor="ha-group-name">组名</Label>
                <Input
                  id="ha-group-name"
                  value={groupForm.group}
                  onChange={(event) => setGroupForm({ ...groupForm, group: event.target.value })}
                  className="font-mono"
                  placeholder="production"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ha-group-nodes">节点与优先级</Label>
                <Input
                  id="ha-group-nodes"
                  value={groupForm.nodes}
                  onChange={(event) => setGroupForm({ ...groupForm, nodes: event.target.value })}
                  className="font-mono"
                  placeholder="pve1:1,pve2:2"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ha-group-comment">备注</Label>
                <Input
                  id="ha-group-comment"
                  value={groupForm.comment}
                  onChange={(event) => setGroupForm({ ...groupForm, comment: event.target.value })}
                />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="ha-group-restricted"
                    checked={groupForm.restricted}
                    onCheckedChange={(checked) => setGroupForm({ ...groupForm, restricted: checked })}
                  />
                  <Label htmlFor="ha-group-restricted">受限组（仅组内节点）</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="ha-group-failback"
                    checked={groupForm.noFailback}
                    onCheckedChange={(checked) => setGroupForm({ ...groupForm, noFailback: checked })}
                  />
                  <Label htmlFor="ha-group-failback">不自动回切</Label>
                </div>
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'group'} onClick={() => void submitGroup()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
