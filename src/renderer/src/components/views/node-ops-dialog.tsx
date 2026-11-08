import { useCallback, useEffect, useState } from 'react'
import {
  BadgeCheck,
  CircleAlert,
  Copy,
  KeyRound,
  Loader2,
  Package,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  Trash2
} from 'lucide-react'
import type { AptRepository, NodeAptData, NodeCertificateData, SubscriptionInfo } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/common'
import { Skeleton } from '@renderer/components/ui/primitives'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { formatFullDateTime } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'

type Tab = 'subscription' | 'apt' | 'certificate'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'subscription', label: '订阅' },
  { value: 'apt', label: '软件包' },
  { value: 'certificate', label: '证书' }
]

const SUBSCRIPTION_LABELS: Record<SubscriptionInfo['status'], { label: string; tone: string }> = {
  active: { label: '有效', tone: 'text-success' },
  expired: { label: '已过期', tone: 'text-destructive' },
  notfound: { label: '未订阅', tone: 'text-muted-foreground' },
  new: { label: '新订阅', tone: 'text-info' },
  invalid: { label: '密钥无效', tone: 'text-destructive' },
  unknown: { label: '未知', tone: 'text-muted-foreground' }
}

function ErrorBox({ message }: { message: string | null }): React.JSX.Element | null {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 rounded-none border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-[11px] leading-4 text-destructive">
      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="break-all">{message}</span>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <div className="text-[10.5px] leading-4 text-muted-foreground/85">{hint}</div>}
    </div>
  )
}

/**
 * 键值明细表。
 *
 * 原来是一堆 `px-3 py-2` 的 flex 行，右侧值全是 `—` 时整块看着像空白表格，
 * 现在压到 `py-1.5`、标签用次级色、值统一等宽字体右对齐，长值（服务器 ID）自动换行不撑破。
 */
function KeyValueList({ items }: { items: Array<[string, string]> }): React.JSX.Element {
  return (
    <dl className="divide-y divide-border/60 overflow-hidden rounded-none border border-border bg-panel/20">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 px-3.5 py-2">
          <dt className="shrink-0 text-[11.5px] leading-5 text-muted-foreground">{label}</dt>
          <dd
            className={cn(
              'min-w-0 break-all text-right font-mono text-[11px] leading-5',
              value === '—' ? 'text-muted-foreground/50' : 'text-foreground'
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** 面板里的小节标题：左侧一条强调色竖线，比纯文字更清晰的分隔 */
function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-[12px] font-medium text-foreground">
        <span className="h-3 w-[2px] bg-brand" aria-hidden="true" />
        {children}
      </span>
      {aside}
    </div>
  )
}


/* ---------------------------------------------------------------- 订阅 */

function SubscriptionPanel({ node }: { node: string }): React.JSX.Element {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInfo(await unwrap(window.pvevdi.subscriptionInfo(node)))
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
    }
  }, [node])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (): Promise<void> => {
    const trimmed = key.trim()
    if (!trimmed) {
      setActionError('请粘贴订阅密钥。')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      await unwrap(window.pvevdi.subscriptionUpdate(node, trimmed))
      toast.success('订阅密钥已保存')
      setKey('')
      await load()
    } catch (err) {
      setActionError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      await unwrap(window.pvevdi.subscriptionDelete(node))
      toast.success('订阅密钥已移除')
      await load()
    } catch (err) {
      setActionError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Skeleton className="h-40" />
  if (error) return <ErrorBox message={error} />

  const status = SUBSCRIPTION_LABELS[info?.status ?? 'unknown']

  return (
    <div className="space-y-5">
      {/* 状态卡：图标 + 状态词 + 等级，一句话说明 PVE 返回的信息 */}
      <div className="flex items-start gap-3 rounded-none border border-border bg-panel/30 px-3.5 py-3">
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            info?.status === 'active' ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground'
          )}
        >
          <BadgeCheck className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[12.5px] font-medium text-foreground">订阅状态 · {status.label}</span>
            {info?.level && (
              <span className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
                {info.level}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-[17px] text-muted-foreground">
            {info?.message || 'PVE 未返回更多说明。'}
          </p>
        </div>
      </div>

      <KeyValueList
        items={[
          ['产品', info?.productName ?? info?.level ?? '—'],
          ['CPU 插槽数', info?.sockets === undefined ? '—' : String(info.sockets)],
          ['服务器 ID', info?.serverid ?? '—'],
          ['下次检查', info?.nextDueDate ? formatFullDateTime(info.nextDueDate * 1000) : '—'],
          ['密钥前缀', info?.key ? `${info.key.slice(0, 16)}…` : '—']
        ]}
      />

      <div className="space-y-2">
        <SectionTitle>订阅密钥</SectionTitle>
        <div className="flex items-stretch gap-2">
          <Input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="pve1c-xxxxxxxx-xxxx"
            className="h-9 font-mono text-[11.5px]"
            aria-label="订阅密钥"
          />
          <Button onClick={() => void save()} loading={busy} className="h-9 shrink-0 px-4">
            保存
          </Button>
        </div>
        <p className="text-[10.5px] leading-[16px] text-muted-foreground/85">
          粘贴 Proxmox 订阅密钥后点保存，PVE 会在下一个检查周期更新状态。
        </p>
      </div>

      {info && info.status !== 'notfound' && (
        <Button variant="outline" size="sm" onClick={() => void remove()} disabled={busy}>
          <Trash2 className="h-3 w-3" />
          移除订阅
        </Button>
      )}

      <ErrorBox message={actionError} />

      <div className="flex items-start gap-2 rounded-none border border-warning/30 bg-warning/[0.07] px-3 py-2.5 text-[11px] leading-[17px] text-warning">
        <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
        <span>未订阅的节点仍可正常使用，但无法访问企业软件源与官方技术支持。</span>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- APT */

function AptPanel({ node }: { node: string }): React.JSX.Element {
  const [data, setData] = useState<NodeAptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [repos, setRepos] = useState<AptRepository[]>([])
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await unwrap(window.pvevdi.nodeApt(node))
      setData(next)
      setRepos(next.repositories)
      setDirty(false)
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
    }
  }, [node])

  useEffect(() => {
    void load()
  }, [load])

  const refreshIndex = async (): Promise<void> => {
    setBusy('refresh')
    try {
      const result = await unwrap(window.pvevdi.nodeAptRefresh({ node }))
      toast.success(result.message, result.upid ? { description: result.upid } : undefined)
      await load()
    } catch (err) {
      toast.error('刷新失败', { description: errorDetail(err) })
    } finally {
      setBusy(null)
    }
  }

  const upgradeAll = async (): Promise<void> => {
    setBusy('upgrade')
    try {
      const result = await unwrap(window.pvevdi.nodeAptRefresh({ node, upgrade: true }))
      toast.success(result.message, result.upid ? { description: result.upid } : undefined)
    } catch (err) {
      toast.error('升级失败', { description: errorDetail(err) })
    } finally {
      setBusy(null)
    }
  }

  const toggleRepo = (index: number): void => {
    setRepos((prev) => prev.map((repo, i) => (i === index ? { ...repo, enabled: !repo.enabled } : repo)))
    setDirty(true)
  }

  const saveRepos = async (): Promise<void> => {
    setBusy('save')
    try {
      await unwrap(window.pvevdi.nodeAptRepoSave(node, repos))
      toast.success('仓库配置已保存')
      await load()
    } catch (err) {
      toast.error('保存失败', { description: errorDetail(err) })
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Skeleton className="h-56" />
  if (error) return <ErrorBox message={error} />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void refreshIndex()} loading={busy === 'refresh'}>
          <RefreshCw className="h-3 w-3" />
          刷新索引
        </Button>
        <Button
          size="sm"
          onClick={() => void upgradeAll()}
          loading={busy === 'upgrade'}
          disabled={(data?.updates.length ?? 0) === 0}
        >
          <Package className="h-3 w-3" />
          升级全部 {data && data.updates.length > 0 ? `(${data.updates.length})` : ''}
        </Button>
        {dirty && (
          <Button variant="outline" size="sm" onClick={() => void saveRepos()} loading={busy === 'save'}>
            <Loader2 className="h-3 w-3" />
            保存仓库配置
          </Button>
        )}
        <span className="ml-auto text-[10.5px] text-muted-foreground">
          标准仓库 {data?.standardRepo ? '已启用' : '未启用'} · 企业仓库 {data?.enterpriseRepo ? '已启用' : '未启用'}
        </span>
      </div>

      {data && data.warnings.length > 0 && (
        <div className="rounded-none border border-warning/30 bg-warning/[0.07] px-3 py-2 text-[11px] leading-[17px] text-warning">
          {data.warnings.join('；')}
        </div>
      )}

      <div>
        <SectionTitle aside={<span className="font-mono text-[11px] text-muted-foreground">{data?.updates.length ?? 0}</span>}>
          可升级软件包
        </SectionTitle>
        <div className="mt-2">
          {!data || data.updates.length === 0 ? (
            <EmptyState icon={<Package className="h-5 w-5" />} title="没有可升级的软件包" description="索引可能尚未刷新。" />
          ) : (
            <div className="max-h-[220px] divide-y divide-border/60 overflow-y-auto rounded-none border border-border">
              {data.updates.map((pkg) => (
                <div key={pkg.package} className="flex items-start gap-3 px-3 py-[7px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] text-foreground">{pkg.package}</div>
                    {pkg.description && (
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{pkg.description}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {pkg.oldVersion && <div className="line-through opacity-60">{pkg.oldVersion}</div>}
                    <div className="text-foreground">{pkg.version}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <SectionTitle aside={<span className="font-mono text-[11px] text-muted-foreground">{repos.length}</span>}>
          软件源
        </SectionTitle>
        <div className="mt-2">
          {repos.length === 0 ? (
            <EmptyState icon={<Package className="h-5 w-5" />} title="没有读取到软件源" description="该节点可能不是 Debian 系发行版。" />
          ) : (
            <div className="divide-y divide-border/60 rounded-none border border-border">
              {repos.map((repo, index) => (
                <div key={`${repo.path}-${repo.index}-${index}`} className="flex items-start gap-3 px-3 py-[7px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] text-foreground">
                      {repo.uris.join(' ') || '—'}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {[repo.suites?.join(' '), repo.components.join(' ')].filter(Boolean).join(' · ') || repo.path}
                    </div>
                    {repo.warning && <div className="mt-0.5 text-[10px] text-warning">{repo.warning}</div>}
                  </div>
                  <Switch
                    checked={repo.enabled}
                    onCheckedChange={() => toggleRepo(index)}
                    aria-label={`启用软件源 ${index + 1}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- 证书 */

function CertificatePanel({ node }: { node: string }): React.JSX.Element {
  const [data, setData] = useState<NodeCertificateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cert, setCert] = useState('')
  const [key, setKey] = useState('')
  const [force, setForce] = useState(false)
  const [restart, setRestart] = useState(true)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await unwrap(window.pvevdi.nodeCertificate(node)))
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
    }
  }, [node])

  useEffect(() => {
    void load()
  }, [load])

  const upload = async (): Promise<void> => {
    if (!cert.trim() || !key.trim()) {
      setActionError('证书与私钥都需要填写。')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      await unwrap(window.pvevdi.nodeCertificateUpload({ node, certificates: cert, key, force, restart }))
      toast.success('证书已上传', { description: restart ? 'pveproxy 正在重启。' : undefined })
      setCert('')
      setKey('')
      await load()
    } catch (err) {
      setActionError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  const reset = async (): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      await unwrap(window.pvevdi.nodeCertificateReset(node))
      toast.success('已恢复自签证书')
      await load()
    } catch (err) {
      setActionError(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Skeleton className="h-48" />
  if (error) return <ErrorBox message={error} />

  const info = data?.info

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-none border border-border bg-panel/30 px-3.5 py-3">
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            data?.custom ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground'
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-foreground">
            当前证书 · {data?.custom ? '自定义证书' : 'PVE 自签证书'}
          </div>
          {info?.subject && (
            <div className="mt-1 break-all font-mono text-[10px] leading-4 text-muted-foreground">{info.subject}</div>
          )}
        </div>
      </div>

      {info && (
        <KeyValueList
          items={[
            ['颁发者', info.issuer ?? '—'],
            ['生效时间', info.notbefore ? formatFullDateTime(info.notbefore * 1000) : '—'],
            ['到期时间', info.notafter ? formatFullDateTime(info.notafter * 1000) : '—'],
            ['公钥', info.publicKeyType ? `${info.publicKeyType} ${info.publicKeyBits ?? ''}` : '—'],
            ['SAN', info.san.length > 0 ? info.san.join(', ') : '—'],
            ['指纹', info.fingerprint ?? '—']
          ]}
        />
      )}

      {data?.pem && (
        <div>
          <SectionTitle
            aside={
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(data.pem ?? '')
                  toast.success('证书已复制')
                }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
                复制
              </button>
            }
          >
            证书 PEM
          </SectionTitle>
          <pre className="mt-2 max-h-[96px] overflow-auto rounded-none border border-border bg-panel/30 p-2.5 font-mono text-[10px] leading-4 text-muted-foreground">
            {data.pem}
          </pre>
        </div>
      )}

      <div className="space-y-3">
        <Field label="证书链（PEM）">
          <textarea
            value={cert}
            onChange={(event) => setCert(event.target.value)}
            rows={3}
            placeholder="包含服务器证书及其上级证书，按顺序粘贴 -----BEGIN CERTIFICATE-----"
            className="w-full resize-y rounded-none border border-input bg-transparent px-2.5 py-2 font-mono text-[10px] leading-4 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border-strong focus-visible:border-brand"
            aria-label="证书链"
          />
        </Field>
        <Field label="私钥（PEM）" hint="仅通过加密通道提交给 PVE，不会写入日志。">
          <textarea
            value={key}
            onChange={(event) => setKey(event.target.value)}
            rows={2}
            placeholder="-----BEGIN PRIVATE KEY-----"
            className="w-full resize-y rounded-none border border-input bg-transparent px-2.5 py-2 font-mono text-[10px] leading-4 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border-strong focus-visible:border-brand"
            aria-label="私钥"
          />
        </Field>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-panel/30 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">强制替换</span>
            <Switch checked={force} onCheckedChange={setForce} aria-label="强制替换" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-panel/30 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">上传后重启 pveproxy</span>
            <Switch checked={restart} onCheckedChange={setRestart} aria-label="重启 pveproxy" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void upload()} loading={busy} disabled={!cert.trim() || !key.trim()}>
            <KeyRound className="h-3 w-3" />
            上传证书
          </Button>
          {data?.custom && (
            <Button variant="outline" onClick={() => void reset()} disabled={busy}>
              恢复自签证书
            </Button>
          )}
        </div>
        <ErrorBox message={actionError} />
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- 容器 */

export function NodeOpsDialog({
  open,
  onOpenChange,
  node
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: string | null
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('subscription')

  useEffect(() => {
    if (!open) return
    setTab('subscription')
  }, [open, node])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-[680px] flex-col">
        <DialogHeader>
          <DialogTitle>节点运维</DialogTitle>
          <DialogDescription>
            节点 <span className="font-mono text-foreground/80">{node ?? '—'}</span> · 订阅状态、软件源与 HTTPS 证书，改动会立即写入该节点
          </DialogDescription>
        </DialogHeader>

        {/* Tab 改成与全站一致的下划线风格，不再用黑底方块 */}
        <div className="flex shrink-0 items-center gap-5 border-b border-border px-5">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              data-ops-tab={item.value}
              data-ops-tab-active={tab === item.value}
              className={cn(
                '-mb-px h-9 border-b-2 border-transparent text-[12px] font-medium transition-colors',
                tab === item.value
                  ? 'border-brand text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {node && tab === 'subscription' && <SubscriptionPanel node={node} />}
          {node && tab === 'apt' && <AptPanel node={node} />}
          {node && tab === 'certificate' && <CertificatePanel node={node} />}
        </div>

        {/* 页脚：左侧放一句定位说明，右侧关闭，避免底部只剩一个孤零零的按钮 */}
        <DialogFooter className="sm:justify-between">
          <span className="hidden items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground/80 sm:flex">
            <Server className="h-3 w-3" />
            {node ?? '—'}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
