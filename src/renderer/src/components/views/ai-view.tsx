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
  '列出所有运行中的虚拟机，按节点分组',
  '最近有哪些失败的任务？帮我看看原因',
  '把 VM 204 启动起来，然后确认状态',
  '给 VM 204 创建一个名为 before-upgrade 的快照'
]

function entryId(): string {
  return crypto.randomUUID()
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

function toolStatusLabel(status: AiToolEvent['status']): string {
  if (status === 'ok') return '已完成'
  if (status === 'error') return '失败'
  if (status === 'denied') return '已拒绝'
  return '等待确认'
}

function ToolEvents({ events }: { events: AiToolEvent[] }): React.JSX.Element {
  return (
    <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
      {events.map((event) => (
        <div key={event.id} className="flex min-w-0 items-center gap-1.5 text-[10.5px] leading-4">
          {event.status === 'ok' ? (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
          ) : event.status === 'pending' ? (
            <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
          ) : event.status === 'denied' ? (
            <ShieldAlert className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <XCircle className="h-3 w-3 shrink-0 text-destructive" />
          )}
          <span className="shrink-0 text-foreground/80">{event.title}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{event.summary}</span>
          <span className={cn('shrink-0', event.status === 'ok' ? 'text-success' : 'text-muted-foreground')}>
            {toolStatusLabel(event.status)}
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
    <div className={cn('border-l-2 bg-card px-3 py-2.5', danger ? 'border-l-destructive' : 'border-l-warning')}>
      <div className="flex items-center gap-2">
        <ShieldAlert className={cn('h-3.5 w-3.5 shrink-0', danger ? 'text-destructive' : 'text-warning')} />
        <span className="text-[12px] font-medium text-foreground">需要确认：{approval.title}</span>
        {danger && (
          <span className="border border-destructive/40 px-1 py-0.5 text-[9px] text-destructive">高风险</span>
        )}
      </div>
      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{approval.summary}</div>
      <pre className="mt-2 max-h-28 overflow-auto border border-border bg-background px-2 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
        {JSON.stringify(approval.args, null, 2)}
      </pre>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant={danger ? 'destructive' : 'default'} disabled={busy} onClick={() => onApprove(true)}>
          {busy ? <Loader2 className="h-3 w-3 spin" /> : <ShieldCheck className="h-3 w-3" />}
          允许执行
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onApprove(false)}>
          拒绝
        </Button>
        <span className="text-[10px] text-muted-foreground">确认后才会调用 PVE API</span>
      </div>
    </div>
  )
}

function Thinking(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 py-1 text-[11.5px] text-muted-foreground">
      <span className="flex gap-1">
        <span className="h-1 w-1 animate-pulse bg-brand" />
        <span className="h-1 w-1 animate-pulse bg-brand [animation-delay:120ms]" />
        <span className="h-1 w-1 animate-pulse bg-brand [animation-delay:240ms]" />
      </span>
      正在查询 PVE…
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

  const updateEntries = (next: ChatEntry[]): void => {
    cache.entries = next
    setEntries(next)
  }

  const applyResult = (result: AiChatResult): void => {
    updateEntries([
      ...cache.entries,
      {
        id: entryId(),
        role: 'assistant' as const,
        text: result.reply,
        events: result.events,
        at: Date.now()
      }
    ])
    cache.approval = result.approval ?? null
    setApproval(result.approval ?? null)
    setStreamText('')
  }

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending || approval) return
    setError(null)
    setStreamText('')
    updateEntries([...cache.entries, { id: entryId(), role: 'user', text, at: Date.now() }])
    setInput('')
    setSending(true)
    try {
      const result = await unwrap(window.pvevdi.aiChat({ conversationId: cache.conversationId, text }))
      applyResult(result)
    } catch (err) {
      const message = errorDetail(err)
      setError(message)
      setStreamText('')
      updateEntries([...cache.entries, { id: entryId(), role: 'error', text: message, at: Date.now() }])
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
  const busy = sending || approving

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2.5 lg:px-5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center font-mono text-[13px] font-semibold tracking-[-0.06em] text-brand">
          AI
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-foreground">AI 运维助手</span>
            <span className="border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {AI_PERMISSION_LABELS[settings.aiPermission]}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
            {preset.label}
            {settings.aiModel ? ` · ${settings.aiModel}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="mr-1 hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
            <span className={cn('h-1.5 w-1.5', configured ? 'bg-success' : 'bg-warning')} />
            {configured ? '已就绪' : '待配置'}
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
        <div className="mx-auto w-full max-w-[780px] px-4 py-5 lg:px-5">
          {!configured && (
            <div className="mb-4 border-l-2 border-l-warning bg-warning/[0.04] px-3 py-2.5">
              <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                还没有配置 AI 服务
              </div>
              <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
                支持本地 Ollama、DeepSeek、OpenAI GPT 和任意 OpenAI 兼容接口。到「首选项 → AI 助手」填写地址、模型和 API Key。
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={onOpenSettings}>
                去配置
              </Button>
            </div>
          )}

          {error && (
            <div className="mb-3 flex items-start gap-2 border-l-2 border-l-destructive bg-destructive/[0.04] px-3 py-2 text-[11.5px] text-destructive">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="shrink-0 opacity-70 hover:opacity-100"
                aria-label="关闭错误"
              >
                <XCircle className="h-3 w-3" />
              </button>
            </div>
          )}

          {empty ? (
            <div className="py-6">
              <div className="text-[13px] font-medium text-foreground">直接描述你想查询或执行的操作</div>
              <div className="mt-1 max-w-[560px] text-[11.5px] leading-5 text-muted-foreground">
                AI 会使用受限工具读取 PVE 数据；变更操作遵循当前权限边界。可以从下面的示例开始。
              </div>
              <div className="mt-4 grid w-full max-w-[620px] gap-2 sm:grid-cols-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="border border-border bg-card/50 px-3 py-2.5 text-left text-[11.5px] leading-5 text-foreground/90 transition-colors hover:border-brand/45 hover:bg-brand/[0.04]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {entries.map((entry) => {
                if (entry.role === 'error') {
                  return (
                    <div key={entry.id} className="flex items-start gap-2 text-[11px] text-destructive">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 break-words">{entry.text}</span>
                    </div>
                  )
                }
                const isUser = entry.role === 'user'
                return (
                  <div key={entry.id} className={cn('flex gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
                    {!isUser && (
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[9px] font-semibold text-brand">
                        AI
                      </div>
                    )}
                    <div className={cn('min-w-0', isUser ? 'max-w-[80%]' : 'max-w-[88%]')}>
                      <div
                        className={cn(
                          'mb-1 flex items-center gap-2 text-[10px] text-muted-foreground',
                          isUser && 'justify-end'
                        )}
                      >
                        <span>{isUser ? '你' : 'AI 助手'}</span>
                        <span>{clock(entry.at)}</span>
                      </div>
                      <div
                        className={cn(
                          'px-3 py-2',
                          isUser
                            ? 'bg-brand/[0.07] text-[12.5px] leading-6 text-foreground'
                            : 'border-l-2 border-l-brand/60 bg-card/40 text-foreground'
                        )}
                      >
                        {isUser ? (
                          <div className="whitespace-pre-wrap break-words">{entry.text}</div>
                        ) : (
                          <Markdown text={entry.text} />
                        )}
                        {entry.events && entry.events.length > 0 && <ToolEvents events={entry.events} />}
                      </div>
                    </div>
                  </div>
                )
              })}

              {busy && (
                <div className="flex gap-2.5">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[9px] font-semibold text-brand">
                    AI
                  </div>
                  <div className="min-w-0 max-w-[88%]">
                    <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>AI 助手</span>
                      <span>正在生成</span>
                    </div>
                    {streamText ? (
                      <div className="border-l-2 border-l-brand/60 bg-card/40 px-3 py-2">
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
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[9px] font-semibold text-warning">
                    !
                  </div>
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

      <div className="shrink-0 border-t border-border bg-card px-4 py-3 lg:px-5">
        <div className="mx-auto w-full max-w-[780px]">
          <div className="border border-border bg-background focus-within:border-brand/50">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void send()
                }
              }}
              placeholder={configured ? '告诉 AI 你想查询或操作什么…' : '先到「首选项 → AI 助手」配置服务'}
              className="min-h-[64px] resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-[12.5px] leading-6 shadow-none focus-visible:ring-0"
              disabled={busy || Boolean(approval)}
            />
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-2 py-1.5">
              <span className="truncate text-[10px] text-muted-foreground">
                Ctrl+Enter 发送 · {AI_PERMISSION_HINTS[settings.aiPermission]}
              </span>
              <Button
                size="sm"
                className="h-7 shrink-0 px-3"
                onClick={() => void send()}
                disabled={!input.trim() || busy || Boolean(approval) || !configured}
              >
                {busy ? <Loader2 className="h-3 w-3 spin" /> : <ArrowUp className="h-3 w-3" />}
                发送
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
