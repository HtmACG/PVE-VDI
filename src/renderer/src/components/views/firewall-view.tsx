import { useCallback, useEffect, useMemo, useState } from 'react'
import { Flame, Plus, RefreshCw, Save, ShieldOff, ShieldCheck, Trash2 } from 'lucide-react'
import type {
  ApiError,
  DashboardData,
  FirewallOverviewData,
  FirewallRule,
  FirewallScope,
  VmType
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
import { cn } from '@renderer/lib/utils'
import { PveUnavailable } from './pve-unavailable'

const PROTOCOLS = [
  { value: 'any', label: '任意' },
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'icmp', label: 'ICMP' },
  { value: 'icmpv6', label: 'ICMPv6' },
  { value: 'esp', label: 'ESP' },
  { value: 'ah', label: 'AH' }
]

const ACTIONS = [
  { value: 'ACCEPT', label: '允许' },
  { value: 'DROP', label: '丢弃' },
  { value: 'REJECT', label: '拒绝' }
]

const LOG_LEVELS = ['nolog', 'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug', 'nolog']

interface RuleFormState {
  pos?: number
  type: 'in' | 'out'
  action: string
  proto: string
  source: string
  dest: string
  sport: string
  dport: string
  iface: string
  comment: string
  log: string
  enabled: boolean
}

const emptyRule = (): RuleFormState => ({
  type: 'in',
  action: 'ACCEPT',
  proto: 'tcp',
  source: '',
  dest: '',
  sport: '',
  dport: '',
  iface: '',
  comment: '',
  log: 'nolog',
  enabled: true
})

export function FirewallView({ dashboard }: { dashboard: DashboardData }): React.JSX.Element {
  const nodes = dashboard.nodes.map((node) => node.node)
  const [level, setLevel] = useState<'cluster' | 'node' | 'vm'>('cluster')
  const [node, setNode] = useState(nodes[0] ?? '')
  const [vmKey, setVmKey] = useState('')
  const [data, setData] = useState<FirewallOverviewData | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [ruleForm, setRuleForm] = useState<RuleFormState | null>(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyPos, setBusyPos] = useState<number | null>(null)

  const vms = useMemo(
    () => dashboard.vms.filter((vm) => vm.node === node && !vm.template).sort((a, b) => a.vmid - b.vmid),
    [dashboard.vms, node]
  )

  useEffect(() => {
    if (nodes.length > 0 && !nodes.includes(node)) setNode(nodes[0])
  }, [node, nodes])

  useEffect(() => {
    if (vms.length === 0) {
      setVmKey('')
      return
    }
    if (!vms.some((vm) => `${vm.type}/${vm.vmid}` === vmKey)) {
      setVmKey(`${vms[0].type}/${vms[0].vmid}`)
    }
  }, [vmKey, vms])

  const scope = useMemo<FirewallScope | null>(() => {
    if (level === 'cluster') return { level: 'cluster' }
    if (!node) return null
    if (level === 'node') return { level: 'node', node }
    const [type, vmid] = vmKey.split('/')
    if (!type || !vmid) return null
    return { level: 'vm', node, type: type as VmType, vmid: Number(vmid) }
  }, [level, node, vmKey])

  const scopeLabel =
    level === 'cluster'
      ? '集群级'
      : level === 'node'
        ? `节点级 · ${node}`
        : `虚拟机级 · ${vmKey.replace('/', ' #')}`

  const load = useCallback(async () => {
    if (!scope) return
    setLoading(true)
    const result = await window.pvevdi.firewallOverview(scope)
    if (result.ok) {
      setData(result.data)
      setError(null)
    } else {
      setData(null)
      setError(result.error)
    }
    setLoading(false)
  }, [scope])

  useEffect(() => {
    void load()
  }, [load])

  const toggleEnable = async (): Promise<void> => {
    if (!data || !scope) return
    setSaving(true)
    const result = await window.pvevdi.firewallOptionsSave({
      scope,
      options: { enable: !data.options.enable }
    })
    setSaving(false)
    if (result.ok) await load()
  }

  const removeRule = async (rule: FirewallRule): Promise<void> => {
    if (!scope) return
    setBusyPos(rule.pos)
    const result = await window.pvevdi.firewallRuleSave({
      scope,
      delete: true,
      rule: {
        type: rule.type,
        action: rule.action,
        pos: rule.pos,
        enabled: rule.enabled
      }
    })
    setBusyPos(null)
    if (result.ok) await load()
  }

  const submitRule = async (): Promise<void> => {
    if (!scope || !ruleForm) return
    setFormError('')
    if (ruleForm.proto === 'tcp' || ruleForm.proto === 'udp') {
      if (ruleForm.dport && !/^[\d,:,-]+$/.test(ruleForm.dport)) {
        setFormError('端口格式应为 22、80,443 或 1000:2000。')
        return
      }
    }
    setSaving(true)
    const result = await window.pvevdi.firewallRuleSave({
      scope,
      rule: {
        pos: ruleForm.pos,
        type: ruleForm.type,
        action: ruleForm.action,
        proto: ruleForm.proto === 'any' ? undefined : ruleForm.proto,
        source: ruleForm.source.trim() || undefined,
        dest: ruleForm.dest.trim() || undefined,
        sport: ruleForm.sport.trim() || undefined,
        dport: ruleForm.dport.trim() || undefined,
        iface: ruleForm.iface.trim() || undefined,        comment: ruleForm.comment.trim() || undefined,
        log: ruleForm.log === 'nolog' ? undefined : ruleForm.log,
        enabled: ruleForm.enabled
      }
    })
    setSaving(false)
    if (!result.ok) {
      setFormError(result.error.message)
      return
    }
    setRuleForm(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="防火墙"
        description="逐级查看并维护 PVE 防火墙策略：集群、节点与虚拟机三层规则独立生效。"
        actions={
          <Button variant="surface" loading={loading} onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2.5">
        <div className="flex items-center border border-border">
          {[
            ['cluster', '集群'],
            ['node', '节点'],
            ['vm', '虚拟机']
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLevel(value as 'cluster' | 'node' | 'vm')}
              className={cn(
                'flex h-8 items-center border-r border-border px-3 text-[12px] transition-colors last:border-r-0',
                level === value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {level !== 'cluster' && (
          <Select value={node} onValueChange={setNode}>
            <SelectTrigger className="h-8 w-[130px] text-[12px]">
              <SelectValue placeholder="节点" />
            </SelectTrigger>
            <SelectContent>
              {nodes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {level === 'vm' && (
          <Select value={vmKey} onValueChange={setVmKey}>
            <SelectTrigger className="h-8 w-[240px] text-[12px]">
              <SelectValue placeholder="选择虚拟机" />
            </SelectTrigger>
            <SelectContent>
              {vms.map((vm) => (
                <SelectItem key={`${vm.type}/${vm.vmid}`} value={`${vm.type}/${vm.vmid}`}>
                  {vm.name} · {vm.vmid}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{scopeLabel}</span>
          {data && (
            <>
              <Badge variant={data.options.enable ? 'success' : 'muted'}>
                {data.options.enable ? '防火墙已启用' : '防火墙未启用'}
              </Badge>
              <Button variant="outline" size="sm" loading={saving} onClick={() => void toggleEnable()}>
                {data.options.enable ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                {data.options.enable ? '停用' : '启用'}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <PveUnavailable error={error} onRetry={() => void load()} />}

      {data && (
        <>
          <div className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
            {[
              ['规则数量', data.rules.length],
              ['入站策略', data.options.policyIn?.toUpperCase() ?? '—'],
              ['出站策略', data.options.policyOut?.toUpperCase() ?? '—'],
              ['别名集合', data.ipsets.length]
            ].map(([label, value]) => (
              <div key={String(label)} className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0">
                <div className="text-[12px] text-muted-foreground">{label}</div>
                <div className="mt-1.5 font-mono text-[17px] text-foreground">{value}</div>
              </div>
            ))}
          </div>

          <div className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <Flame className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-foreground">规则列表</span>
              <span className="font-mono text-[11px] text-muted-foreground">按序号从上到下匹配</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setFormError('')
                  setRuleForm(emptyRule())
                }}
              >
                <Plus className="h-3 w-3" />
                添加规则
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="border-b border-border bg-panel/30 text-[11px] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">方向</th>
                    <th className="px-3 py-2.5 font-medium">动作</th>
                    <th className="px-3 py-2.5 font-medium">协议</th>
                    <th className="px-3 py-2.5 font-medium">源</th>
                    <th className="px-3 py-2.5 font-medium">目标</th>
                    <th className="px-3 py-2.5 font-medium">端口</th>
                    <th className="px-3 py-2.5 font-medium">备注</th>
                    <th className="px-4 py-2.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map((rule) => (
                    <tr key={rule.pos} className="border-b border-border/60 last:border-b-0 hover:bg-panel/40">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{rule.pos}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={rule.type === 'in' ? 'info' : 'outline'}>
                          {rule.type === 'in' ? '入站' : rule.type === 'out' ? '出站' : '组'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            'font-mono text-[11px]',
                            rule.action === 'ACCEPT' ? 'text-success' : 'text-destructive'
                          )}
                        >
                          {rule.action}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{rule.proto ?? 'any'}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{rule.source ?? '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">{rule.dest ?? '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {rule.dport ?? rule.sport ?? '—'}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-[11px] text-muted-foreground">
                        {rule.comment ?? '—'}
                        {!rule.enabled && <Badge variant="muted" className="ml-2">停用</Badge>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFormError('')
                              setRuleForm({
                                pos: rule.pos,
                                type: rule.type === 'out' ? 'out' : 'in',
                                action: rule.action,
                                proto: rule.proto ?? 'any',
                                source: rule.source ?? '',
                                dest: rule.dest ?? '',
                                sport: rule.sport ?? '',
                                dport: rule.dport ?? '',
                                iface: rule.iface ?? '',
                                comment: rule.comment ?? '',
                                log: rule.log ?? 'nolog',
                                enabled: rule.enabled
                              })
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            loading={busyPos === rule.pos}
                            onClick={() => void removeRule(rule)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.rules.length === 0 && (
              <EmptyState
                icon={<Flame className="h-5 w-5" />}
                title="没有防火墙规则"
                description="空规则表意味着使用策略默认值（通常为拒绝入站）。"
              />
            )}

            {data.warnings.length > 0 && (
              <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                {data.warnings.join(' · ')}
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={Boolean(ruleForm)} onOpenChange={(open) => !open && setRuleForm(null)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{ruleForm?.pos ? `编辑规则 #${ruleForm.pos}` : '添加防火墙规则'}</DialogTitle>
            <DialogDescription>留空的字段表示匹配任意值。</DialogDescription>
          </DialogHeader>
          {ruleForm && (
            <DialogBody>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>方向</Label>
                  <Select
                    value={ruleForm.type}
                    onValueChange={(value) => setRuleForm({ ...ruleForm, type: value as 'in' | 'out' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">入站</SelectItem>
                      <SelectItem value="out">出站</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>动作</Label>
                  <Select value={ruleForm.action} onValueChange={(value) => setRuleForm({ ...ruleForm, action: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((action) => (
                        <SelectItem key={action.value} value={action.value}>
                          {action.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>协议</Label>
                  <Select value={ruleForm.proto} onValueChange={(value) => setRuleForm({ ...ruleForm, proto: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOLS.map((proto) => (
                        <SelectItem key={proto.value} value={proto.value}>
                          {proto.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-source">源地址 / CIDR</Label>
                  <Input
                    id="rule-source"
                    value={ruleForm.source}
                    onChange={(event) => setRuleForm({ ...ruleForm, source: event.target.value })}
                    placeholder="10.0.0.0/24"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-dest">目标地址 / CIDR</Label>
                  <Input
                    id="rule-dest"
                    value={ruleForm.dest}
                    onChange={(event) => setRuleForm({ ...ruleForm, dest: event.target.value })}
                    placeholder="留空表示任意"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-dport">目标端口</Label>
                  <Input
                    id="rule-dport"
                    value={ruleForm.dport}
                    onChange={(event) => setRuleForm({ ...ruleForm, dport: event.target.value })}
                    placeholder="22 或 80,443"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-sport">源端口</Label>
                  <Input
                    id="rule-sport"
                    value={ruleForm.sport}
                    onChange={(event) => setRuleForm({ ...ruleForm, sport: event.target.value })}
                    placeholder="可选"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-iface">网络接口</Label>
                <Input
                  id="rule-iface"
                  value={ruleForm.iface}
                  onChange={(event) => setRuleForm({ ...ruleForm, iface: event.target.value })}
                  placeholder="vmbr0，留空表示任意"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-comment">备注</Label>
                <Input
                  id="rule-comment"
                  value={ruleForm.comment}
                  onChange={(event) => setRuleForm({ ...ruleForm, comment: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>日志级别</Label>
                <Select value={ruleForm.log} onValueChange={(value) => setRuleForm({ ...ruleForm, log: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level === 'nolog' ? '不记录' : level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Switch
                  id="rule-enabled"
                  checked={ruleForm.enabled}
                  onCheckedChange={(checked) => setRuleForm({ ...ruleForm, enabled: checked })}
                />
                <Label htmlFor="rule-enabled">启用该规则</Label>
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleForm(null)}>
              取消
            </Button>
            <Button loading={saving} onClick={() => void submitRule()}>
              <Save className="h-3.5 w-3.5" />
              保存规则
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
