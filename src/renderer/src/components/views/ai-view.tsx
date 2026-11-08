import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  XCircle
} from 'lucide-react'
import type { AiApproval, AiChatResult, AiToolEvent, AppSettings } from '@shared/types'
import { AI_PERMISSION_HINTS, AI_PERMISSION_LABELS, AI_PROVIDER_PRESETS } from '@shared/ai'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'

interface ChatEntry {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
  events?: AiToolEvent[]
  at: number
}

interface ChatCache {
  conversationId: string
  entries: ChatEntry[]
  approval: AiApproval | null
  ownerKey?: string
}

const cache: ChatCache = {
  conversationId: crypto.randomUUID(),
  entries: [],
  approval: null
}

const EXAMPLE_PROMPTS = [
  '列出所有运行中的虚拟机，按节点分组',
  '最近有哪些失败的任务？帮我看看原因',
  '把 VM 204 启动起来，然后确认状态',
  '给 VM 204 创建一个名为 before-upgrade 的快照'
]

function entryId(): string {
  return crypto.randomUUID()
}

function toolIcon(event: AiToolEvent): React.JSX.Element {
  if (event.status === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
  if (event.status === 'denied') return <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  if (event.status === 'pending') return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
  return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
}

function ToolEvents({ events }: { events: AiToolEvent[] }): React.JSX.Element {
  return (
    <div className="mt-2 space-y-1">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-2 border border-border/70 bg-panel/40 px-2.5 py-1.5 text-[11px]"
        >
          {toolIcon(event)}
          <div className="min-w-0 flex-1">
            <span className="font-medium text-foreground">{event.title}</span>
            <span className="ml-1.5 text-muted-foreground">{event.summary}</span>
          </div>
          <span
            className={cn(
              'shrink-0 font-mono text-[9.5px] uppercase tracking-wide',
              event.status === 'ok'
                ? 'text-success'
                : event.status === 'error'
                  ? 'text-destructive'
                  : event.status === 'pending'
                    ? 'text-warning'
                    : 'text-muted-foreground'
            )}
          >
            {event.status === 'ok'
              ? 'DONE'
              : event.status === 'error'
                ? 'ERROR'
                : event.status === 'pending'
                  ? 'WAIT'
                  : 'DENY'}
          </span>
        </div>
      ))}
    </div>
  )
}

function ApprovalCard({
  approval,
  busy,
  onApprove
}: {
  approval: AiApproval
  busy: boolean
  onApprove: (approved: boolean) => void
}): React.JSX.Element {
  const danger = approval.risk === 'danger'
  return (
    <div
      className={cn(
        'mt-3 border bg-card p-3',
        danger ? 'border-destructive/45' : 'border-warning/45'
      )}
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className={cn('mt-0.5 h-4 w-4 shrink-0', danger ? 'text-destructive' : 'text-warning')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-foreground">{approval.title}</span>
            <span
              className={cn(
                'border px-1 py-0.5 font-mono text-[9.5px] uppercase',
                danger ? 'border-destructive/45 text-destructive' : 'border-warning/45 text-warning'
              )}
            >
              {danger ? '高风险' : '待确认'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{approval.summary}</div>
          <pre className="mt-2 max-h-32 overflow-auto border border-border bg-background p-2 font-mono text-[10.5px] leading-4 text-muted-foreground">
            {JSON.stringify(approval.args, null, 2)}
          </pre>
          <div className="mt-2.5 flex items-center gap-2">
            <Button size="sm" variant={danger ? 'destructive' : 'default'} disabled={busy} onClick={() => onApprove(true)}>
              {busy ? <Loader2 className="h-3 w-3 spin" /> : null}
              允许执行
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onApprove(false)}>
              拒绝
            </Button>
            <span className="text-[10px] text-muted-foreground">只有点击允许后才会调用 PVE API</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AiView({
  settings,
  ownerKey,
  onOpenSettings
}: {
  settings: AppSettings
  ownerKey: string
  onOpenSettings: () => void
}): React.JSX.Element {
  const [entries, setEntries] = useState<ChatEntry[]>(cache.entries)
  const [approval, setApproval] = useState<AiApproval | null>(cache.approval)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 换账号 / 换 PVE 地址时，旧对话里可能有上一台集群的数据，不能继续沿用
  useEffect(() => {
    if (cache.ownerKey === ownerKey) return
    if (cache.ownerKey) void window.pvevdi.aiReset(cache.conversationId)
    cache.ownerKey = ownerKey
    cache.conversationId = crypto.randomUUID()
    cache.entries = []
    cache.approval = null
    setEntries([])
    setApproval(null)
    setInput('')
    setError(null)
  }, [ownerKey])

  const preset = AI_PROVIDER_PRESETS[settings.aiProvider]
  const configured =
    Boolean(settings.aiBaseUrl.trim()) &&
    Boolean(settings.aiModel.trim()) &&
    (settings.aiProvider === 'ollama' ||
      settings.aiProvider === 'custom' ||
      settings.hasAiApiKey)

  const permissionClass =
    settings.aiPermission === 'full'
      ? 'border-destructive/40 text-destructive'
      : settings.aiPermission === 'read-only'
        ? 'border-border text-muted-foreground'
        : 'border-warning/40 text-warning'

  const updateEntries = (next: ChatEntry[]): void => {
    cache.entries = next
    setEntries(next)
  }

  const applyResult = (result: AiChatResult): void => {
    const next = [
      ...cache.entries,
      {
        id: entryId(),
        role: 'assistant' as const,
        text: result.reply,
        events: result.events,
        at: Date.now()
      }
    ]
    updateEntries(next)
    cache.approval = result.approval ?? null
    setApproval(result.approval ?? null)
  }

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending || approval) return
    setError(null)
    const userEntry: ChatEntry = { id: entryId(), role: 'user', text, at: Date.now() }
    updateEntries([...cache.entries, userEntry])
    setInput('')
    setSending(true)
    try {
      const result = await unwrap(
        window.pvevdi.aiChat({ conversationId: cache.conversationId, text })
      )
      applyResult(result)
    } catch (err) {
      const message = errorDetail(err)
      setError(message)
      updateEntries([
        ...cache.entries,
        { id: entryId(), role: 'error', text: message, at: Date.now() }
      ])
    } finally {
      setSending(false)
    }
  }

  const approve = async (approved: boolean): Promise<void> => {
    if (!approval || approving) return
    setApproving(true)
    setError(null)
    try {
      const result = await unwrap(
        window.pvevdi.aiApprove({
          conversationId: cache.conversationId,
          approvalId: approval.id,
          approved
        })
      )
      setApproval(null)
      cache.approval = null
      applyResult(result)
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setApproving(false)
    }
  }

  const clearChat = async (): Promise<void> => {
    if (sending || approving) return
    try {
      await window.pvevdi.aiReset(cache.conversationId)
    } catch {
      /* 会话可能已过期，继续清空界面 */
    }
    cache.conversationId = crypto.randomUUID()
    cache.entries = []
    cache.approval = null
    setEntries([])
    setApproval(null)
    setError(null)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries, approval, sending])

  const empty = useMemo(() => entries.length === 0, [entries])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center border border-brand/35 bg-brand/10">
          <Bot className="h-4 w-4 text-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-foreground">AI 运维助手</span>
            <span className={cn('border px-1.5 py-0.5 text-[10px]', permissionClass)}>
              {AI_PERMISSION_LABELS[settings.aiPermission]}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
            {configured ? `${preset.label} · ${settings.aiModel}` : '尚未配置 AI 服务'}
            {settings.aiProvider === 'ollama' ? ' · 本地' : ''}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void clearChat()} title="清空对话">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>清空对话</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onOpenSettings} title="AI 设置">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>AI 设置</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[820px] px-5 py-5">
          {!configured && (
            <div className="mb-4 border border-warning/40 bg-warning/5 p-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-warning">
                <AlertTriangle className="h-4 w-4" />
                还没有配置 AI 服务
              </div>
              <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
                支持本地 Ollama、DeepSeek、OpenAI GPT 和任意 OpenAI 兼容接口。到「首选项 → AI 助手」填写地址、模型和 API Key 后即可对话。
              </p>
              <Button size="sm" variant="outline" className="mt-2.5" onClick={onOpenSettings}>
                去配置
              </Button>
            </div>
          )}

          {error && (
            <div className="mb-3 flex items-start gap-2 border border-destructive/35 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{error}</span>
              <button type="button" onClick={() => setError(null)} className="shrink-0 opacity-70 hover:opacity-100">
                <XCircle className="h-3 w-3" />
              </button>
            </div>
          )}

          {empty ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center border border-brand/30 bg-brand/10">
                <Sparkles className="h-5 w-5 text-brand" />
              </div>
              <div className="mt-3 text-[14px] font-medium text-foreground">用一句话操作 PVE</div>
              <div className="mt-1 max-w-[520px] text-[11.5px] leading-5 text-muted-foreground">
                AI 只会看到你让它查询的集群数据；变更操作受权限边界控制。
                当前权限：{AI_PERMISSION_LABELS[settings.aiPermission]}。
              </div>
              <div className="mt-4 grid w-full max-w-[620px] gap-2 sm:grid-cols-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="border border-border bg-card px-3 py-2.5 text-left text-[11.5px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <div key={entry.id} className={cn('flex gap-2.5', entry.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {entry.role !== 'user' && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-panel">
                      {entry.role === 'assistant' ? (
                        <Bot className="h-3.5 w-3.5 text-brand" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </div>
                  )}
                  <div
                    className={cn(
                      'min-w-0 max-w-[86%] border px-3 py-2',
                      entry.role === 'user'
                        ? 'border-brand/35 bg-brand/10 text-foreground'
                        : entry.role === 'error'
                          ? 'border-destructive/35 bg-destructive/5 text-destructive'
                          : 'border-border bg-card text-foreground'
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words text-[12px] leading-6">{entry.text}</div>
                    {entry.events && entry.events.length > 0 && <ToolEvents events={entry.events} />}
                  </div>
                  {entry.role === 'user' && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-panel">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {approval && (
                <div className="flex gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-warning/40 bg-warning/10">
                    <ShieldCheck className="h-3.5 w-3.5 text-warning" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <ApprovalCard approval={approval} busy={approving} onApprove={(value) => void approve(value)} />
                  </div>
                </div>
              )}

              {sending && (
                <div className="flex gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-panel">
                    <Bot className="h-3.5 w-3.5 text-brand" />
                  </div>
                  <div className="flex items-center gap-2 border border-border bg-card px-3 py-2 text-[11.5px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 spin" />
                    正在思考并查询 PVE…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-5 py-3">
        <div className="mx-auto w-full max-w-[820px]">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void send()
                }
              }}
              placeholder={
                configured
                  ? '告诉 AI 你想查询或操作什么…（Ctrl+Enter 发送）'
                  : '先到「首选项 → AI 助手」配置服务'
              }
              className="min-h-[56px] resize-none text-[12px]"
              disabled={sending || Boolean(approval)}
            />
            <Button
              size="sm"
              className="h-9"
              onClick={() => void send()}
              disabled={!input.trim() || sending || Boolean(approval) || !configured}
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 spin" /> : <Send className="h-3.5 w-3.5" />}
              发送
            </Button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>{AI_PERMISSION_HINTS[settings.aiPermission]}</span>
            <span>工具白名单：查询 / 电源操作 / 创建快照</span>
          </div>
        </div>
      </div>
    </div>
  )
}
