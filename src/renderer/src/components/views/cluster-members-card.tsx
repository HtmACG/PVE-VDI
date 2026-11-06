import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Link2, Plus, Server, ShieldAlert, Trash2, Wifi } from 'lucide-react'
import type { ClusterJoinInfo, ClusterMember, DashboardData } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { errorDetail, unwrap } from '@renderer/lib/api'

export function ClusterMembersCard({ dashboard }: { dashboard: DashboardData }): React.JSX.Element {
  const [info, setInfo] = useState<ClusterJoinInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const [hostname, setHostname] = useState('')
  const [password, setPassword] = useState('')
  const [fingerprint, setFingerprint] = useState('')
  const [nodeid, setNodeid] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setInfo(await unwrap(window.pvevdi.clusterJoinInfo()))
    } catch {
      // 单机模式或权限不足时不阻断页面，成员列表退回 dashboard 数据
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const members: ClusterMember[] = info?.nodes.length
    ? info.nodes
    : dashboard.nodes.map((node) => ({
        name: node.node,
        online: node.status === 'online'
      }))
  // PVE 的 join 只能在单机节点上发起；已入集群的节点要加入别的集群必须先清集群配置
  const standalone = (info?.nodes.length ?? 0) <= 1

  const submitJoin = async (): Promise<void> => {
    setFormError('')
    const host = hostname.trim()
    if (!host) {
      setFormError('请填写对端节点地址。')
      return
    }
    if (!password) {
      setFormError('请填写对端节点的 root 密码。')
      return
    }
    setBusy('join')
    try {
      await unwrap(
        window.pvevdi.clusterJoin({
          hostname: host,
          password,
          fingerprint: fingerprint.trim() || undefined,
          nodeid: nodeid.trim() || undefined,
          usePeerAddress: true
        })
      )
      setJoinOpen(false)
      setHostname('')
      setPassword('')
      setFingerprint('')
      setNodeid('')
      await load()
    } catch (err) {
      setFormError(errorDetail(err))
    } finally {
      setBusy(null)
    }
  }

  const removeNode = async (): Promise<void> => {
    if (!removeTarget) return
    setBusy(`remove:${removeTarget}`)
    setActionError('')
    try {
      await unwrap(window.pvevdi.clusterNodeRemove(removeTarget))
      setRemoveTarget(null)
      await load()
    } catch (err) {
      setActionError(errorDetail(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div>
          <h2 className="text-[14px] font-medium text-foreground">集群成员</h2>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {standalone ? '当前为单机模式，可加入已有集群' : `${members.length} 个节点在集群中`}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!standalone}
          onClick={() => {
            setFormError('')
            setJoinOpen(true)
          }}
        >
          <Link2 className="h-3 w-3" />
          加入集群
        </Button>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 border-b border-border bg-destructive/5 px-4 py-2.5 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{actionError}</span>
        </div>
      )}

      <div className="divide-y divide-border">
        {members.map((member) => (
          <div key={member.name} className="group flex items-center gap-3 px-4 py-3">
            <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-mono text-[12px] text-foreground">{member.name}</span>
            {member.name === info?.selfNode && <Badge variant="brand">本节点</Badge>}
            {member.ring0 && <span className="font-mono text-[11px] text-muted-foreground">{member.ring0}</span>}
            {member.votes !== undefined && (
              <span className="font-mono text-[11px] text-muted-foreground">票数 {member.votes}</span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {member.online === undefined ? null : member.online ? (
                <Badge variant="success">在线</Badge>
              ) : (
                <Badge variant="muted">离线</Badge>
              )}
              {member.name !== info?.selfNode && (
                <button
                  type="button"
                  onClick={() => setRemoveTarget(member.name)}
                  className="flex h-6 w-6 items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100"
                  aria-label={`移出节点 ${member.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {info && info.warnings.length > 0 && (
        <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          {info.warnings.join(' · ')}
        </div>
      )}

      {/* 加入集群 */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>加入集群</DialogTitle>
            <DialogDescription>
              本节点会清空自身的集群配置并加入对端集群。操作期间节点上的虚拟机建议先关机。
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-1.5">
              <Label htmlFor="join-host">对端节点地址</Label>
              <Input
                id="join-host"
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                className="font-mono"
                placeholder="10.10.12.60"
              />
              <div className="text-[11px] text-muted-foreground">只填 IP 或主机名，不要带 https:// 前缀。</div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="join-password">对端 root 密码</Label>
              <Input
                id="join-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="join-nodeid">建议主机名</Label>
                <Input
                  id="join-nodeid"
                  value={nodeid}
                  onChange={(event) => setNodeid(event.target.value)}
                  className="font-mono"
                  placeholder="留空沿用对端"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="join-fingerprint">集群指纹</Label>
                <Input
                  id="join-fingerprint"
                  value={fingerprint}
                  onChange={(event) => setFingerprint(event.target.value)}
                  className="font-mono"
                  placeholder="选填"
                />
              </div>
            </div>
            <div className="flex items-start gap-2 border border-warning/40 bg-warning/5 px-3 py-2.5">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <div className="text-[11px] leading-relaxed text-muted-foreground">
                加入后本节点原有的用户、存储与防火墙配置会被对端集群配置覆盖。建议先备份 <span className="font-mono">/etc/pve</span>。
              </div>
            </div>
            {formError && <div className="text-[11px] text-destructive">{formError}</div>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)}>
              取消
            </Button>
            <Button loading={busy === 'join'} onClick={() => void submitJoin()}>
              <Wifi className="h-3 w-3" />
              加入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 移出节点 */}
      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>移出集群</DialogTitle>
            <DialogDescription>
              节点 <span className="font-mono">{removeTarget}</span> 会被从集群配置中移除。该节点上的虚拟机不会自动迁移，
              请先确认它们已迁走或已关机。
            </DialogDescription>
          </DialogHeader>
          {actionError && <div className="text-[11px] text-destructive">{actionError}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" loading={busy === `remove:${removeTarget}`} onClick={() => void removeNode()}>
              <Trash2 className="h-3 w-3" />
              移出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
