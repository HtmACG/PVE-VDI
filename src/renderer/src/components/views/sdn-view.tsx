import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2
} from 'lucide-react'
import type {
  ApiError,
  DashboardData,
  SdnOverviewData,
  SdnSubnet,
  SdnSubnetInput,
  SdnVnet,
  SdnVnetInput,
  SdnZone,
  SdnZoneInput,
  SdnZoneType
} from '@shared/types'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
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
import { errorDetail, unwrap } from '@renderer/lib/api'
import { PveUnavailable } from './pve-unavailable'

const ZONE_TYPES: Array<{ value: SdnZoneType; label: string; hint: string }> = [
  { value: 'simple', label: 'Simple', hint: '简单二层区域，直接桥接到物理网桥' },
  { value: 'vlan', label: 'VLAN', hint: '基于 802.1Q 的 VLAN 区域，需要指定物理网桥' },
  { value: 'qinq', label: 'QinQ', hint: '双层 VLAN 标签，适合多租户隔离' },
  { value: 'vxlan', label: 'VXLAN', hint: '三层覆盖网络，需要指定 VXLAN ID 与对端' },
  { value: 'evpn', label: 'EVPN', hint: '带 BGP 控制面的 VXLAN，需要控制器' }
]

const ZONE_TYPE_LABEL = new Map(ZONE_TYPES.map((item) => [item.value, item.label]))

interface ZoneFormState extends SdnZoneInput {
  isNew: boolean
}

interface VnetFormState extends SdnVnetInput {
  isNew: boolean
}

interface SubnetFormState extends SdnSubnetInput {
  isNew: boolean
}

function FieldHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="text-[11px] leading-relaxed text-muted-foreground">{children}</div>
}

/** 把逗号 / 空白分隔的节点、对端列表规整成 PVE 接受的单串。 */
function joinList(value: string): string {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',')
}

function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function SdnView({ dashboard }: { dashboard: DashboardData }): React.JSX.Element {
  const [data, setData] = useState<SdnOverviewData | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [tab, setTab] = useState('zones')

  const [zoneForm, setZoneForm] = useState<ZoneFormState | null>(null)
  const [vnetForm, setVnetForm] = useState<VnetFormState | null>(null)
  const [subnetForm, setSubnetForm] = useState<SubnetFormState | null>(null)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: 'zone' | 'vnet' | 'subnet'; name: string; extra?: string } | null
  >(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await unwrap(window.pvevdi.sdnOverview())
      setData(result)
      setError(null)
    } catch (err) {
      setData(null)
      setError({ code: 'UNKNOWN', message: errorDetail(err) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pendingChanges = useMemo(() => {
    if (!data) return 0
    return (
      data.zones.filter((item) => item.pending).length +
      data.vnets.filter((item) => item.pending).length +
      data.subnets.filter((item) => item.pending).length
    )
  }, [data])

  const run = async (key: string, task: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setActionError('')
    try {
      await task()
      await load()
    } catch (err) {
      setActionError(errorDetail(err))
    } finally {
      setBusy(null)
    }
  }

  const applyPending = (revert: boolean): Promise<void> =>
    run(revert ? 'revert' : 'apply', async () => {
      await unwrap(window.pvevdi.sdnApply(revert))
    })

  const submitZone = (): Promise<void> => {
    if (!zoneForm) return Promise.resolve()
    setFormError('')
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(zoneForm.zone.trim())) {
      setFormError('区域名必须以字母开头，只能包含字母、数字、下划线和连字符。')
      return Promise.resolve()
    }
    if (zoneForm.type === 'simple' || zoneForm.type === 'vlan' || zoneForm.type === 'qinq') {
      if (!zoneForm.bridge?.trim()) {
        setFormError('该类型需要指定物理网桥，例如 vmbr0。')
        return Promise.resolve()
      }
    }
    if ((zoneForm.type === 'vxlan' || zoneForm.type === 'evpn') && zoneForm.vxlanId === undefined) {
      setFormError('VXLAN / EVPN 区域需要填写 VXLAN ID。')
      return Promise.resolve()
    }
    return run('zone:save', async () => {
      const payload: SdnZoneInput = {
        zone: zoneForm.zone.trim(),
        type: zoneForm.type,
        bridge: zoneForm.bridge?.trim() || undefined,
        mtu: zoneForm.mtu,
        nodes: zoneForm.nodes ? joinList(zoneForm.nodes) : undefined,
        vlan: zoneForm.vlan,
        vlanProtocol: zoneForm.vlanProtocol?.trim() || undefined,
        vxlanId: zoneForm.vxlanId,
        peers: zoneForm.peers ? joinList(zoneForm.peers) : undefined,
        controller: zoneForm.controller?.trim() || undefined,
        vrfVxlan: zoneForm.vrfVxlan,
        asn: zoneForm.asn,
        exitNodes: zoneForm.exitNodes ? joinList(zoneForm.exitNodes) : undefined,
        ipam: zoneForm.ipam?.trim() || undefined,
        dns: zoneForm.dns?.trim() || undefined,
        dnsZone: zoneForm.dnsZone?.trim() || undefined,
        reversedns: zoneForm.reversedns?.trim() || undefined,
        dhcp: zoneForm.dhcp?.trim() || undefined
      }
      await unwrap(window.pvevdi.sdnZoneSave(payload))
      setZoneForm(null)
    }).catch((err: unknown) => {
      setFormError(errorDetail(err))
    })
  }

  const submitVnet = (): Promise<void> => {
    if (!vnetForm) return Promise.resolve()
    setFormError('')
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(vnetForm.vnet.trim())) {
      setFormError('VNet 名必须以字母开头，只能包含字母、数字、下划线和连字符。')
      return Promise.resolve()
    }
    if (!vnetForm.zone.trim()) {
      setFormError('请选择所属区域；没有区域时请先在「区域」页签创建。')
      return Promise.resolve()
    }
    return run('vnet:save', async () => {
      const payload: SdnVnetInput = {
        vnet: vnetForm.vnet.trim(),
        zone: vnetForm.zone.trim(),
        alias: vnetForm.alias?.trim() || undefined,
        tag: vnetForm.tag,
        vlanaware: vnetForm.vlanaware
      }
      await unwrap(window.pvevdi.sdnVnetSave(payload))
      setVnetForm(null)
    }).catch((err: unknown) => {
      setFormError(errorDetail(err))
    })
  }

  const submitSubnet = (): Promise<void> => {
    if (!subnetForm) return Promise.resolve()
    setFormError('')
    if (!/^[0-9a-fA-F.:]+\/\d{1,3}$/.test(subnetForm.subnet.trim())) {
      setFormError('子网格式应为 CIDR，例如 10.10.0.0/24。')
      return Promise.resolve()
    }
    if (!subnetForm.vnet.trim()) {
      setFormError('请选择所属 VNet。')
      return Promise.resolve()
    }
    if (Boolean(subnetForm.dhcpRangeStart) !== Boolean(subnetForm.dhcpRangeEnd)) {
      setFormError('DHCP 起止地址必须同时填写或同时留空。')
      return Promise.resolve()
    }
    return run('subnet:save', async () => {
      const payload: SdnSubnetInput = {
        subnet: subnetForm.subnet.trim(),
        vnet: subnetForm.vnet.trim(),
        gateway: subnetForm.gateway?.trim() || undefined,
        snat: subnetForm.snat,
        dnsZonePrefix: subnetForm.dnsZonePrefix?.trim() || undefined,
        dhcpRangeStart: subnetForm.dhcpRangeStart?.trim() || undefined,
        dhcpRangeEnd: subnetForm.dhcpRangeEnd?.trim() || undefined,
        dnsServers: subnetForm.dnsServers?.trim() || undefined
      }
      await unwrap(window.pvevdi.sdnSubnetSave(payload))
      setSubnetForm(null)
    }).catch((err: unknown) => {
      setFormError(errorDetail(err))
    })
  }

  const doDelete = (): Promise<void> => {
    if (!confirmDelete) return Promise.resolve()
    const { kind, name, extra } = confirmDelete
    return run(`${kind}:delete:${name}`, async () => {
      if (kind === 'zone') await unwrap(window.pvevdi.sdnZoneSave({ zone: name, type: 'simple', delete: true }))
      else if (kind === 'vnet') await unwrap(window.pvevdi.sdnVnetSave({ vnet: name, zone: extra ?? '', delete: true }))
      else await unwrap(window.pvevdi.sdnSubnetSave({ subnet: name, vnet: extra ?? '', delete: true }))
      setConfirmDelete(null)
    })
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow={`${dashboard.cluster.name} 集群`} title="SDN" description="软件定义网络。" />
        <PveUnavailable error={error} onRetry={() => void load()} />
      </div>
    )
  }

  const nodes = dashboard.nodes.map((node) => node.node)
  const bridges = BRIDGE_HINTS

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="SDN"
        description="用区域（Zone）、虚拟网络（VNet）和子网统一管理集群覆盖网络。"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="surface" loading={loading} onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
        {[
          ['区域', `${data?.zones.length ?? 0}`],
          ['VNet', `${data?.vnets.length ?? 0}`],
          ['子网', `${data?.subnets.length ?? 0}`],
          ['待下发变更', `${pendingChanges}`]
        ].map(([label, value]) => (
          <div key={label} className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0">
            <div className="text-[12px] text-muted-foreground">{label}</div>
            <div className="mt-1.5 font-mono text-[19px] text-foreground">{value}</div>
          </div>
        ))}
      </div>

      {pendingChanges > 0 && (
        <div className="flex flex-wrap items-center gap-3 border border-warning/40 bg-warning/5 px-4 py-3">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-[12px] text-foreground">
            有 {pendingChanges} 项变更尚未下发到节点，此时 SDN 配置还没生效。
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" loading={busy === 'revert'} onClick={() => void applyPending(true)}>
              <Undo2 className="h-3 w-3" />
              丢弃变更
            </Button>
            <Button size="sm" loading={busy === 'apply'} onClick={() => void applyPending(false)}>
              <CheckCircle2 className="h-3 w-3" />
              下发配置
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-[12px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="shrink-0 text-[11px] underline">
            关闭
          </button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="zones">区域</TabsTrigger>
          <TabsTrigger value="vnets">VNet</TabsTrigger>
          <TabsTrigger value="subnets">子网</TabsTrigger>
        </TabsList>

        <TabsContent value="zones">
          <div className="border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <Network className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">SDN 区域</span>
              <span className="text-[11px] text-muted-foreground">区域是 VNet 的容器，决定二层还是三层转发</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setFormError('')
                  setZoneForm({
                    isNew: true,
                    zone: '',
                    type: 'simple',
                    bridge: 'vmbr0',
                    nodes: '',
                    mtu: undefined
                  })
                }}
              >
                <Plus className="h-3 w-3" />
                新建区域
              </Button>
            </div>

            {data && data.zones.length === 0 ? (
              <EmptyState
                icon={<Network className="h-5 w-5" />}
                title="还没有 SDN 区域"
                description="先创建一个 simple 或 vlan 区域，再在区域里建 VNet 和子网。"
              />
            ) : (
              <div className="divide-y divide-border">
                {(data?.zones ?? []).map((zone) => (
                  <div key={zone.zone} className="group px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-foreground">{zone.zone}</span>
                      <Badge variant="brand">{ZONE_TYPE_LABEL.get(zone.type) ?? zone.type}</Badge>
                      {zone.pending && <Badge variant="warning">待下发</Badge>}
                      {zone.state && zone.state !== 'ok' && <Badge variant="danger">{zone.state}</Badge>}
                      <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setFormError('')
                            setZoneForm({
                              isNew: false,
                              zone: zone.zone,
                              type: zone.type,
                              bridge: zone.bridge ?? '',
                              nodes: zone.nodes?.join(',') ?? '',
                              mtu: zone.mtu,
                              vlan: zone.vlan,
                              vlanProtocol: zone.vlanProtocol ?? '',
                              vxlanId: zone.vxlanId,
                              peers: zone.peers?.join(',') ?? '',
                              controller: zone.controller ?? '',
                              vrfVxlan: zone.vrfVxlan,
                              asn: zone.asn,
                              exitNodes: zone.exitNodes?.join(',') ?? '',
                              ipam: zone.ipam ?? '',
                              dns: zone.dns ?? '',
                              dnsZone: zone.dnsZone ?? '',
                              reversedns: zone.reversedns ?? '',
                              dhcp: zone.dhcp ?? ''
                            })
                          }}
                          className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label="编辑区域"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete({ kind: 'zone', name: zone.zone })}
                          className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-accent hover:text-destructive"
                          aria-label="删除区域"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                      {zone.bridge && <span>网桥 {zone.bridge}</span>}
                      {zone.vlan !== undefined && <span>VLAN {zone.vlan}</span>}
                      {zone.vxlanId !== undefined && <span>VNI {zone.vxlanId}</span>}
                      {zone.mtu !== undefined && <span>MTU {zone.mtu}</span>}
                      {zone.nodes && zone.nodes.length > 0 && <span>节点 {zone.nodes.join(' / ')}</span>}
                      {zone.peers && zone.peers.length > 0 && <span>对端 {zone.peers.length} 个</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="vnets">
          <div className="border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <Network className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">虚拟网络</span>
              <span className="text-[11px] text-muted-foreground">VNet 可以直接在虚拟机网卡里选用</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={(data?.zones.length ?? 0) === 0}
                onClick={() => {
                  setFormError('')
                  setVnetForm({
                    isNew: true,
                    vnet: '',
                    zone: data?.zones[0]?.zone ?? '',
                    alias: '',
                    tag: undefined,
                    vlanaware: false
                  })
                }}
              >
                <Plus className="h-3 w-3" />
                新建 VNet
              </Button>
            </div>

            {data && data.vnets.length === 0 ? (
              <EmptyState
                icon={<Network className="h-5 w-5" />}
                title="还没有 VNet"
                description={
                  (data.zones.length ?? 0) === 0
                    ? '请先创建至少一个 SDN 区域。'
                    : '在区域下创建 VNet，虚拟机网卡即可桥接到该网络。'
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {(data?.vnets ?? []).map((vnet) => (
                  <div key={vnet.vnet} className="group flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="font-mono text-[12px] text-foreground">{vnet.vnet}</span>
                    <Badge variant="outline">区域 {vnet.zone}</Badge>
                    {vnet.tag !== undefined && <span className="font-mono text-[11px] text-muted-foreground">VLAN {vnet.tag}</span>}
                    {vnet.vlanaware && <Badge variant="info">VLAN 感知</Badge>}
                    {vnet.pending && <Badge variant="warning">待下发</Badge>}
                    {vnet.alias && <span className="truncate text-[11px] text-muted-foreground">{vnet.alias}</span>}
                    <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => {
                          setFormError('')
                          setVnetForm({
                            isNew: false,
                            vnet: vnet.vnet,
                            zone: vnet.zone,
                            alias: vnet.alias ?? '',
                            tag: vnet.tag,
                            vlanaware: vnet.vlanaware ?? false
                          })
                        }}
                        className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="编辑 VNet"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete({ kind: 'vnet', name: vnet.vnet, extra: vnet.zone })}
                        className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-accent hover:text-destructive"
                        aria-label="删除 VNet"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="subnets">
          <div className="border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <Network className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">子网</span>
              <span className="text-[11px] text-muted-foreground">为 VNet 分配地址段、网关与 DHCP 范围</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={(data?.vnets.length ?? 0) === 0}
                onClick={() => {
                  setFormError('')
                  setSubnetForm({
                    isNew: true,
                    subnet: '',
                    vnet: data?.vnets[0]?.vnet ?? '',
                    gateway: '',
                    snat: false,
                    dnsZonePrefix: '',
                    dhcpRangeStart: '',
                    dhcpRangeEnd: '',
                    dnsServers: ''
                  })
                }}
              >
                <Plus className="h-3 w-3" />
                新建子网
              </Button>
            </div>

            {data && data.subnets.length === 0 ? (
              <EmptyState
                icon={<Network className="h-5 w-5" />}
                title="还没有子网"
                description={
                  (data.vnets.length ?? 0) === 0
                    ? '请先创建 VNet，再为它分配子网。'
                    : '为 VNet 分配 CIDR 段，PVE 会据此下发网关和 DHCP。'
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {(data?.subnets ?? []).map((subnet) => (
                  <div key={subnet.subnet} className="group flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="font-mono text-[12px] text-foreground">{subnet.subnet}</span>
                    <Badge variant="outline">VNet {subnet.vnet}</Badge>
                    {subnet.gateway && <span className="font-mono text-[11px] text-muted-foreground">网关 {subnet.gateway}</span>}
                    {subnet.snat && <Badge variant="info">SNAT</Badge>}
                    {subnet.pending && <Badge variant="warning">待下发</Badge>}
                    <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => {
                          setFormError('')
                          setSubnetForm({
                            isNew: false,
                            subnet: subnet.subnet,
                            vnet: subnet.vnet,
                            gateway: subnet.gateway ?? '',
                            snat: subnet.snat ?? false,
                            dnsZonePrefix: subnet.dnsZonePrefix ?? '',
                            dhcpRangeStart: subnet.dhcpRange?.start ?? '',
                            dhcpRangeEnd: subnet.dhcpRange?.end ?? '',
                            dnsServers: subnet.dnsServers?.join(',') ?? ''
                          })
                        }}
                        className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="编辑子网"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete({ kind: 'subnet', name: subnet.subnet, extra: subnet.vnet })}
                        className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-accent hover:text-destructive"
                        aria-label="删除子网"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {data && data.warnings.length > 0 && (
        <div className="border border-warning/40 bg-warning/5 px-4 py-2.5 text-[11px] text-muted-foreground">
          {data.warnings.join(' · ')}
        </div>
      )}

      {/* 区域编辑 */}
      <Dialog open={Boolean(zoneForm)} onOpenChange={(open) => !open && setZoneForm(null)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{zoneForm?.isNew ? '新建 SDN 区域' : `编辑区域 ${zoneForm?.zone ?? ''}`}</DialogTitle>
            <DialogDescription>区域类型决定转发方式，创建后类型不可更改。</DialogDescription>
          </DialogHeader>
          {zoneForm && (
            <DialogBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-zone-name">区域名</Label>
                  <Input
                    id="sdn-zone-name"
                    value={zoneForm.zone}
                    disabled={!zoneForm.isNew}
                    onChange={(event) => setZoneForm({ ...zoneForm, zone: event.target.value })}
                    className="font-mono"
                    placeholder="simplenet"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>类型</Label>
                  <Select
                    value={zoneForm.type}
                    disabled={!zoneForm.isNew}
                    onValueChange={(value) => setZoneForm({ ...zoneForm, type: value as SdnZoneType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ZONE_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <FieldHint>{ZONE_TYPES.find((item) => item.value === zoneForm.type)?.hint}</FieldHint>

              {(zoneForm.type === 'simple' || zoneForm.type === 'vlan' || zoneForm.type === 'qinq') && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sdn-zone-bridge">物理网桥</Label>
                    <Input
                      id="sdn-zone-bridge"
                      value={zoneForm.bridge ?? ''}
                      onChange={(event) => setZoneForm({ ...zoneForm, bridge: event.target.value })}
                      className="font-mono"
                      placeholder="vmbr0"
                    />
                    {bridges.length > 0 && (
                      <FieldHint>已有网桥：{bridges.slice(0, 6).join(' / ')}</FieldHint>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sdn-zone-mtu">MTU</Label>
                    <Input
                      id="sdn-zone-mtu"
                      value={zoneForm.mtu ?? ''}
                      onChange={(event) => setZoneForm({ ...zoneForm, mtu: toNumberOrUndefined(event.target.value) })}
                      className="font-mono"
                      placeholder="1500"
                    />
                  </div>
                </div>
              )}

              {zoneForm.type === 'vlan' && (
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-zone-vlan">VLAN 标签</Label>
                  <Input
                    id="sdn-zone-vlan"
                    value={zoneForm.vlan ?? ''}
                    onChange={(event) => setZoneForm({ ...zoneForm, vlan: toNumberOrUndefined(event.target.value) })}
                    className="font-mono"
                    placeholder="100"
                  />
                </div>
              )}

              {zoneForm.type === 'qinq' && (
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-zone-vlan-protocol">外层 VLAN 协议</Label>
                  <Input
                    id="sdn-zone-vlan-protocol"
                    value={zoneForm.vlanProtocol ?? ''}
                    onChange={(event) => setZoneForm({ ...zoneForm, vlanProtocol: event.target.value })}
                    className="font-mono"
                    placeholder="802.1ad"
                  />
                </div>
              )}

              {(zoneForm.type === 'vxlan' || zoneForm.type === 'evpn') && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sdn-zone-vxlan">VXLAN ID</Label>
                    <Input
                      id="sdn-zone-vxlan"
                      value={zoneForm.vxlanId ?? ''}
                      onChange={(event) => setZoneForm({ ...zoneForm, vxlanId: toNumberOrUndefined(event.target.value) })}
                      className="font-mono"
                      placeholder="10000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sdn-zone-mtu2">MTU</Label>
                    <Input
                      id="sdn-zone-mtu2"
                      value={zoneForm.mtu ?? ''}
                      onChange={(event) => setZoneForm({ ...zoneForm, mtu: toNumberOrUndefined(event.target.value) })}
                      className="font-mono"
                      placeholder="1450"
                    />
                  </div>
                </div>
              )}

              {(zoneForm.type === 'vxlan' || zoneForm.type === 'evpn') && (
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-zone-peers">对端地址</Label>
                  <Input
                    id="sdn-zone-peers"
                    value={zoneForm.peers ?? ''}
                    onChange={(event) => setZoneForm({ ...zoneForm, peers: event.target.value })}
                    className="font-mono"
                    placeholder="10.0.0.11,10.0.0.12"
                  />
                  <FieldHint>以逗号或空格分隔。EVPN 区域通常不需要手工填对端。</FieldHint>
                </div>
              )}

              {zoneForm.type === 'evpn' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sdn-zone-controller">EVPN 控制器</Label>
                    <Input
                      id="sdn-zone-controller"
                      value={zoneForm.controller ?? ''}
                      onChange={(event) => setZoneForm({ ...zoneForm, controller: event.target.value })}
                      className="font-mono"
                      placeholder="evpnctl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sdn-zone-asn">ASN</Label>
                    <Input
                      id="sdn-zone-asn"
                      value={zoneForm.asn ?? ''}
                      onChange={(event) => setZoneForm({ ...zoneForm, asn: toNumberOrUndefined(event.target.value) })}
                      className="font-mono"
                      placeholder="65000"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="sdn-zone-nodes">节点（留空表示全部）</Label>
                <Input
                  id="sdn-zone-nodes"
                  value={zoneForm.nodes ?? ''}
                  onChange={(event) => setZoneForm({ ...zoneForm, nodes: event.target.value })}
                  className="font-mono"
                  placeholder={nodes.slice(0, 3).join(',')}
                />
              </div>

              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoneForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'zone:save'} onClick={() => void submitZone()}>
              {zoneForm?.isNew ? '创建' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VNet 编辑 */}
      <Dialog open={Boolean(vnetForm)} onOpenChange={(open) => !open && setVnetForm(null)}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{vnetForm?.isNew ? '新建 VNet' : `编辑 VNet ${vnetForm?.vnet ?? ''}`}</DialogTitle>
            <DialogDescription>VNet 建好后即可在虚拟机网卡里选择。</DialogDescription>
          </DialogHeader>
          {vnetForm && (
            <DialogBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-vnet-name">VNet 名</Label>
                  <Input
                    id="sdn-vnet-name"
                    value={vnetForm.vnet}
                    disabled={!vnetForm.isNew}
                    onChange={(event) => setVnetForm({ ...vnetForm, vnet: event.target.value })}
                    className="font-mono"
                    placeholder="vnet10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>所属区域</Label>
                  <Select
                    value={vnetForm.zone}
                    onValueChange={(value) => setVnetForm({ ...vnetForm, zone: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择区域" />
                    </SelectTrigger>
                    <SelectContent>
                      {(data?.zones ?? []).map((zone) => (
                        <SelectItem key={zone.zone} value={zone.zone}>
                          {zone.zone} · {ZONE_TYPE_LABEL.get(zone.type) ?? zone.type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sdn-vnet-alias">别名</Label>
                <Input
                  id="sdn-vnet-alias"
                  value={vnetForm.alias ?? ''}
                  onChange={(event) => setVnetForm({ ...vnetForm, alias: event.target.value })}
                  placeholder="业务网段"
                />
              </div>
              <div className="grid grid-cols-2 items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-vnet-tag">VLAN 标签</Label>
                  <Input
                    id="sdn-vnet-tag"
                    value={vnetForm.tag ?? ''}
                    onChange={(event) => setVnetForm({ ...vnetForm, tag: toNumberOrUndefined(event.target.value) })}
                    className="font-mono"
                    placeholder="留空自动分配"
                  />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    id="sdn-vnet-aware"
                    checked={vnetForm.vlanaware ?? false}
                    onCheckedChange={(checked) => setVnetForm({ ...vnetForm, vlanaware: checked })}
                  />
                  <Label htmlFor="sdn-vnet-aware">VLAN 感知</Label>
                </div>
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVnetForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'vnet:save'} onClick={() => void submitVnet()}>
              {vnetForm?.isNew ? '创建' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 子网编辑 */}
      <Dialog open={Boolean(subnetForm)} onOpenChange={(open) => !open && setSubnetForm(null)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{subnetForm?.isNew ? '新建子网' : `编辑子网 ${subnetForm?.subnet ?? ''}`}</DialogTitle>
            <DialogDescription>填写 CIDR 段后，PVE 会为 VNet 下发网关与 DHCP 配置。</DialogDescription>
          </DialogHeader>
          {subnetForm && (
            <DialogBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-subnet-cidr">子网（CIDR）</Label>
                  <Input
                    id="sdn-subnet-cidr"
                    value={subnetForm.subnet}
                    disabled={!subnetForm.isNew}
                    onChange={(event) => setSubnetForm({ ...subnetForm, subnet: event.target.value })}
                    className="font-mono"
                    placeholder="10.10.0.0/24"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>所属 VNet</Label>
                  <Select
                    value={subnetForm.vnet}
                    onValueChange={(value) => setSubnetForm({ ...subnetForm, vnet: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择 VNet" />
                    </SelectTrigger>
                    <SelectContent>
                      {(data?.vnets ?? []).map((vnet) => (
                        <SelectItem key={vnet.vnet} value={vnet.vnet}>
                          {vnet.vnet} · {vnet.zone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-subnet-gw">网关</Label>
                  <Input
                    id="sdn-subnet-gw"
                    value={subnetForm.gateway ?? ''}
                    onChange={(event) => setSubnetForm({ ...subnetForm, gateway: event.target.value })}
                    className="font-mono"
                    placeholder="10.10.0.1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-subnet-dns">DNS 服务器</Label>
                  <Input
                    id="sdn-subnet-dns"
                    value={subnetForm.dnsServers ?? ''}
                    onChange={(event) => setSubnetForm({ ...subnetForm, dnsServers: event.target.value })}
                    className="font-mono"
                    placeholder="10.10.0.1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-subnet-dhcp-start">DHCP 起始</Label>
                  <Input
                    id="sdn-subnet-dhcp-start"
                    value={subnetForm.dhcpRangeStart ?? ''}
                    onChange={(event) => setSubnetForm({ ...subnetForm, dhcpRangeStart: event.target.value })}
                    className="font-mono"
                    placeholder="10.10.0.100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-subnet-dhcp-end">DHCP 结束</Label>
                  <Input
                    id="sdn-subnet-dhcp-end"
                    value={subnetForm.dhcpRangeEnd ?? ''}
                    onChange={(event) => setSubnetForm({ ...subnetForm, dhcpRangeEnd: event.target.value })}
                    className="font-mono"
                    placeholder="10.10.0.199"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sdn-subnet-dnszone">反向 DNS 前缀</Label>
                  <Input
                    id="sdn-subnet-dnszone"
                    value={subnetForm.dnsZonePrefix ?? ''}
                    onChange={(event) => setSubnetForm({ ...subnetForm, dnsZonePrefix: event.target.value })}
                    className="font-mono"
                    placeholder="lab10"
                  />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    id="sdn-subnet-snat"
                    checked={subnetForm.snat ?? false}
                    onCheckedChange={(checked) => setSubnetForm({ ...subnetForm, snat: checked })}
                  />
                  <Label htmlFor="sdn-subnet-snat">启用 SNAT</Label>
                </div>
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubnetForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'subnet:save'} onClick={() => void submitSubnet()}>
              {subnetForm?.isNew ? '创建' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              {confirmDelete?.kind === 'zone' &&
                `删除区域 ${confirmDelete.name} 会连带它的 VNet 与子网一起移除。变更需要下发后才会真正生效。`}
              {confirmDelete?.kind === 'vnet' &&
                `删除 VNet ${confirmDelete.name} 会断开所有桥接到它的虚拟机网卡。`}
              {confirmDelete?.kind === 'subnet' &&
                `删除子网 ${confirmDelete.name} 后，该网段的网关与 DHCP 配置将一并移除。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              loading={busy?.includes(':delete:') ?? false}
              onClick={() => void doDelete()}
            >
              <Trash2 className="h-3 w-3" />
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** 节点上常见的物理网桥命名，仅作为输入提示，不做校验。 */
const BRIDGE_HINTS = ['vmbr0', 'vmbr1', 'vmbr2']
