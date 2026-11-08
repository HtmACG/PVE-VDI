import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  XCircle
} from 'lucide-react'
import type { AiApproval, AiChatResult, AiToolEvent, AppSettings } from '@shared/types'
import { AI_PERMISSION_HINTS, AI_PERMISSION_LABELS, AI_PROVIDER_PRESETS } from '@shared/ai'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Markdown } from '@renderer/components/ai/markdown'
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
  { label: '资源巡检', prompt: '列出所有运行中的虚拟机，按节点分组' },
  { label: '故障排查', prompt: '最近有哪些失败的任务？帮我看看原因' },
  { label: '电源操作', prompt: '把 VM 204 启动起来，然后确认状态' },
  { label: '快照保护', prompt: '给 VM 204 创建一个名为 before-upgrade 的快照' }
]

function entryId(): string {
  return crypto.randomUUID()
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

function toolIcon(event: AiToolEvent): React.JSX.Element {
  if (event.status === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
  if (event.status === 'denied') return <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  if (event.status === 'pending') return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
  return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
}

function ToolEvents({ events }: { events: AiToolEvent[] }): React.JSX.Element {
  return (
    <div className="mt-2.5 border-t border-border/60 pt-2">
      <div className="mb-1 font-mono text-[8.5px] tracking-[0.18em] text-muted-foreground/70">TOOL TRACE</div>
      <div className="space-y-1">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-2 border border-border/60 bg-background/50 px-2 py-1.5 text-[10.5px]"
          >
            {toolIcon(event)}
            <div className="min-w-0 flex-1">
              <span className="font-medium text-foreground">{event.title}</span>
              <span className="ml-1.5 text-muted-foreground">{event.summary}</span>
            </div>
            <span
              className={cn(
                'shrink-0 font-mono text-[8.5px] uppercase tracking-[0.1em]',
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
                  ? 'ERR'
                  : event.status === 'pending'
                    ? 'WAIT'
                    : 'DENY'}
            </span>
          </div>
        ))}
      </div>
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
    <div className={cn('border bg-card', danger ? 'border-destructive/50' : 'border-warning/50')}>
      <div
        className={cn(
          'flex items-center gap-2 border-b px-3 py-1.5 font-mono text-[8.5px] tracking-[0.16em]',
          danger ? 'border-destructive/30 text-destructive' : 'border-warning/30 text-warning'
        )}
      >
        <ShieldAlert className="h-3 w-3" />
        {danger ? 'DANGER / 高风险操作' : 'OPERATOR CONFIRMATION / 需要授权'}
      </div>
      <div className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-foreground">{approval.title}</span>
          <span className="font-mono text-[9px] uppercase text-muted-foreground">TOOL / {approval.tool}</span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">{approval.summary}</div>
        <pre className="mt-2 max-h-28 overflow-auto border border-border bg-background p-2 font-mono text-[10px] leading-4 text-muted-foreground">
          {JSON.stringify(approval.args, null, 2)}
        </pre>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button size="sm" variant={danger ? 'destructive' : 'default'} disabled={busy} onClick={() => onApprove(true)}>
            {busy ? <Loader2 className="h-3 w-3 spin" /> : <ShieldCheck className="h-3 w-3" />}
            允许执行
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onApprove(false)}>
            拒绝
          </Button>
          <span className="font-mono text-[9px] text-muted-foreground">仅点击允许后才会调用 PVE API</span>
        </div>
      </div>
    </div>
  )
}

function Thinking(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border border-border/70 border-l-2 border-l-brand bg-card/40 px-3 py-2.5 font-mono text-[10px] text-muted-foreground">
      <span className="flex gap-1">
        <span className="h-1 w-1 animate-pulse bg-brand" />
        <span className="h-1 w-1 animate-pulse bg-brand [animation-delay:120ms]" />
        <span className="h-1 w-1 animate-pulse bg-brand [animation-delay:240ms]" />
      </span>
      AGENT 正在查询 PVE
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
  const [streamText, setStreamText] = useState('')
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
    setStreamText('')
  }, [ownerKey])

  // 主进程按 conversationId 推送 SSE 增量
  useEffect(() => {
    return window.pvevdi.onAiStream((event) => {
      if (event.conversationId !== cache.conversationId) return
      setStreamText((current) => `${current}${event.delta}`)
    })
  }, [])

  const preset = AI_PROVIDER_PRESETS[settings.aiProvider] ?? AI_PROVIDER_PRESETS.openai
  const configured =
    Boolean(settings.aiBaseUrl.trim()) &&
    Boolean(settings.aiModel.trim()) &&
    (settings.aiProvider === 'ollama' ||
      settings.aiProvider === 'custom' ||
      settings.hasAiApiKey)

  const permissionClass =
    settings.aiPermission === 'full'
      ? 'border-destructive/45 text-destructive'
      : settings.aiPermission === 'read-only'
        ? 'border-border text-muted-foreground'
        : 'border-warning/45 text-warning'

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
    setStreamText('')
  }

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending || approval) return
    setError(null)
    setStreamText('')
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
      setStreamText('')
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
    setStreamText('')
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
    setStreamText('')
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries, approval, sending, approving, streamText])

  const empty = useMemo(() => entries.length === 0, [entries])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/70 px-4 py-2.5 lg:px-5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center font-mono text-[14px] font-semibold tracking-[-0.08em] text-brand">
          AI
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[8.5px] tracking-[0.22em] text-brand/80">AI OPS / PVE AGENT</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-foreground">AI 运维助手</span>
            <span className={cn('border px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.06em]', permissionClass)}>
              PERM / {AI_PERMISSION_LABELS[settings.aiPermission]}
            </span>
          </div>
        </div>
        <div className="ml-2 hidden min-w-0 items-center gap-4 border-l border-border/70 pl-4 font-mono text-[9px] text-muted-foreground md:flex">
          <span className="min-w-0 truncate">
            MODEL <span className="text-foreground/80">{settings.aiModel || '—'}</span>
          </span>
          <span>
            TOOLS <span className="text-foreground/80">06</span>
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <span className="mr-1 hidden items-center gap-1.5 font-mono text-[8.5px] tracking-[0.1em] text-muted-foreground sm:flex">
            <span className={cn('h-1.5 w-1.5', configured ? 'bg-success' : 'bg-warning')} />
            {configured ? 'READY' : 'SETUP'}
          </span>
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[840px] px-4 py-5 lg:px-5">
          {!configured && (
            <div className="mb-4 border border-warning/40 bg-warning/[0.04] p-3">
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
            <div className="mb-3 flex items-start gap-2 border border-destructive/35 bg-destructive/[0.05] px-3 py-2 text-[11.5px] text-destructive">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{error}</span>
              <button type="button" onClick={() => setError(null)} className="shrink-0 opacity-70 hover:opacity-100">
                <XCircle className="h-3 w-3" />
              </button>
            </div>
          )}

          {empty ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="relative">
                <div className="font-mono text-[40px] font-semibold leading-none tracking-[-0.12em] text-brand">AI</div>
                <span className="absolute -right-2 top-0.5 h-1.5 w-1.5 bg-success" />
              </div>
              <div className="mt-4 font-mono text-[8.5px] tracking-[0.24em] text-brand/75">AGENT READY / 等待指令</div>
              <div className="mt-2 text-[16px] font-medium text-foreground">用一句话操作 PVE</div>
              <div className="mt-1 max-w-[520px] text-[11.5px] leading-5 text-muted-foreground">
                AI 只读取你让它查询的集群数据；变更操作受权限边界控制。当前权限：
                {AI_PERMISSION_LABELS[settings.aiPermission]}。
              </div>
              <div className="mt-5 grid w-full max-w-[640px] gap-2 sm:grid-cols-2">
                {EXAMPLE_PROMPTS.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setInput(item.prompt)}
                    className="group flex items-start gap-2.5 border border-border bg-card/50 px-3 py-2.5 text-left transition-colors hover:border-brand/45 hover:bg-brand/[0.04]"
                  >
                    <span className="font-mono text-[9px] text-brand/70">0{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[8.5px] tracking-[0.12em] text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-5 text-foreground/90">{item.prompt}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {entries.map((entry) => {
                if (entry.role === 'error') {
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 border border-destructive/35 bg-destructive/[0.04] px-3 py-2 text-[11px] text-destructive"
                    >
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 break-words">{entry.text}</span>
                    </div>
                  )
                }
                const isUser = entry.role === 'user'
                return (
                  <div key={entry.id} className={cn('flex gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
                    {!isUser && (
                      <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[8px] font-semibold text-brand">
                        AI
                      </div>
                    )}
                    <div className={cn('min-w-0', isUser ? 'max-w-[82%]' : 'max-w-[88%] flex-1')}>
                      <div
                        className={cn(
                          'mb-1 flex items-center gap-2 font-mono text-[8.5px] tracking-[0.12em] text-muted-foreground/70',
                          isUser && 'justify-end'
                        )}
                      >
                        <span>{isUser ? 'OPERATOR' : 'AGENT'}</span>
                        <span>{clock(entry.at)}</span>
                      </div>
                      <div
                        className={cn(
                          'border px-3.5 py-2.5',
                          isUser
                            ? 'border-brand/30 bg-brand/[0.06]'
                            : 'border-border/80 border-l-2 border-l-brand bg-card/55'
                        )}
                      >
                        {isUser ? (
                          <div className="whitespace-pre-wrap break-words text-[12.5px] leading-6 text-foreground">
                            {entry.text}
                          </div>
                        ) : (
                          <Markdown text={entry.text} />
                        )}
                        {entry.events && entry.events.length > 0 && <ToolEvents events={entry.events} />}
                      </div>
                    </div>
                    {isUser && <User className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.4} />}
                  </div>
                )
              })}

              {(sending || approving) && (
                <div className="flex gap-2.5">
                  <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[8px] font-semibold text-brand">
                    AI
                  </div>
                  <div className="min-w-0 max-w-[88%] flex-1">
                    <div className="mb-1 flex items-center gap-2 font-mono text-[8.5px] tracking-[0.12em] text-muted-foreground/70">
                      <span>AGENT</span>
                      <span>STREAMING</span>
                    </div>
                    {streamText ? (
                      <div className="border border-border/80 border-l-2 border-l-brand bg-card/55 px-3.5 py-2.5">
                        <Markdown text={streamText} streaming />
                      </div>
                    ) : (
                      <Thinking />
                    )}
                  </div>
                </div>
              )}

              {approval && (
                <div className="flex gap-2.5">
                  <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-warning" strokeWidth={1.4} />
                  <div className="min-w-0 flex-1">
                    <ApprovalCard approval={approval} busy={approving} onApprove={(value) => void approve(value)} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card/70 px-4 py-3 lg:px-5">
        <div className="mx-auto w-full max-w-[840px]">
          <div className="border border-border bg-background focus-within:border-brand/50">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 font-mono text-[8.5px] tracking-[0.12em] text-muted-foreground/70">
              <span>COMMAND / 指令输入</span>
              <span>{input.length}/6000</span>
            </div>
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
              className="min-h-[58px] resize-none rounded-none border-0 bg-transparent px-3 py-2 text-[12px] shadow-none focus-visible:ring-0"
              disabled={sending || Boolean(approval)}
            />
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-2 py-1.5">
              <span className="min-w-0 truncate font-mono text-[8.5px] text-muted-foreground/80">
                {AI_PERMISSION_HINTS[settings.aiPermission]}
              </span>
              <Button
                size="sm"
                className="h-7 shrink-0 px-3 font-mono text-[10px]"
                onClick={() => void send()}
                disabled={!input.trim() || sending || Boolean(approval) || !configured}
              >
                {sending ? <Loader2 className="h-3 w-3 spin" /> : <ArrowUp className="h-3 w-3" />}
                发送
              </Button>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[8.5px] text-muted-foreground/70">
            <span>TOOL WHITELIST / QUERY · POWER · SNAPSHOT</span>
            <span>{preset.label}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
