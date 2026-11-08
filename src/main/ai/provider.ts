import type { AiProvider } from '@shared/types'

/**
 * OpenAI 兼容的聊天接口客户端。
 *
 * 同时覆盖 OpenAI / DeepSeek / 本地 Ollama（/v1 兼容层）以及自建网关；
 * 工具调用走标准 `tools` / `tool_calls` 字段，生产聊天使用 SSE 流式输出。
 */

export interface AiRuntimeConfig {
  provider: AiProvider
  baseUrl: string
  model: string
  apiKey: string | null
  permission: 'read-only' | 'confirm' | 'full'
}

export interface ProviderToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ProviderMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ProviderToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ProviderTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ProviderReply {
  content: string
  toolCalls: ProviderToolCall[]
  finishReason?: string
}

function endpointOf(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('还没有配置 AI 接口地址。')
  if (/\/chat\/completions$/i.test(base)) return base
  return `${base}/chat/completions`
}

function requestBody(config: AiRuntimeConfig, messages: ProviderMessage[], tools: ProviderTool[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: 0.2,
    max_tokens: 2048
  }
  if (tools.length) {
    body.tools = tools
    body.tool_choice = 'auto'
  }
  return body
}

function errorForStatus(status: number, raw: string, payload: unknown): Error {
  const message =
    payload && typeof payload === 'object'
      ? String(
          (payload as { error?: { message?: string } }).error?.message ??
            (payload as { message?: string }).message ??
            raw.slice(0, 300)
        )
      : raw.slice(0, 300)
  if (status === 401 || status === 403) {
    return new Error(`AI 认证失败（${status}）：API Key 无效或没有权限。`)
  }
  if (status === 404) {
    return new Error(`AI 接口不存在（404）：请检查 base URL 与模型名。${message ? ` · ${message}` : ''}`)
  }
  if (status === 429) return new Error('AI 请求太频繁或额度不足（429），请稍后再试。')
  return new Error(`AI 请求失败（${status}）：${message || '未知错误'}`)
}

function assertConfig(config: AiRuntimeConfig): void {
  if (!config.model.trim()) throw new Error('还没有配置 AI 模型。')
  // 本地 Ollama / 自建网关经常不校验 Key；OpenAI / DeepSeek 必须配置
  if ((config.provider === 'openai' || config.provider === 'deepseek') && !config.apiKey) {
    throw new Error('还没有配置 API Key，请先在「首选项 → AI 助手」里填写。')
  }
}

function fetchOptions(config: AiRuntimeConfig, body: unknown, signal: AbortSignal): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
    },
    body: JSON.stringify(body),
    signal
  }
}

function timeoutController(): { controller: AbortController; done: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  return { controller, done: () => clearTimeout(timer) }
}

export async function chatCompletion(
  config: AiRuntimeConfig,
  messages: ProviderMessage[],
  tools: ProviderTool[]
): Promise<ProviderReply> {
  assertConfig(config)
  const { controller, done } = timeoutController()
  try {
    const response = await fetch(endpointOf(config.baseUrl), fetchOptions(config, requestBody(config, messages, tools), controller.signal))
    const raw = await response.text()
    let payload: unknown = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      payload = null
    }
    if (!response.ok) throw errorForStatus(response.status, raw, payload)

    const choice = payload as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: ProviderToolCall[] }
        finish_reason?: string
      }>
      error?: { message?: string }
    }
    const message = choice.choices?.[0]?.message
    if (!message) throw new Error(choice.error?.message || 'AI 返回了空结果（choices 为空）。')
    return {
      content: typeof message.content === 'string' ? message.content : '',
      toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
      finishReason: choice.choices?.[0]?.finish_reason
    }
  } catch (error) {
    throw normalizeFetchError(error, config)
  } finally {
    done()
  }
}

/**
 * SSE 流式聊天。tool_calls 会按 index 累积（OpenAI 兼容接口会把一个工具调用拆成多个 chunk）。
 */
export async function chatCompletionStream(
  config: AiRuntimeConfig,
  messages: ProviderMessage[],
  tools: ProviderTool[],
  onDelta: (delta: string) => void
): Promise<ProviderReply> {
  assertConfig(config)
  const { controller, done } = timeoutController()
  try {
    const response = await fetch(
      endpointOf(config.baseUrl),
      fetchOptions(
        config,
        { ...requestBody(config, messages, tools), stream: true },
        controller.signal
      )
    )
    if (!response.ok) {
      const raw = await response.text()
      let payload: unknown = null
      try {
        payload = raw ? JSON.parse(raw) : null
      } catch {
        payload = null
      }
      throw errorForStatus(response.status, raw, payload)
    }
    if (!response.body) throw new Error('AI 接口没有返回可读取的流。')

    // 少数自建网关会忽略 stream:true，直接返回普通 JSON；这里做一次兼容
    if ((response.headers.get('content-type') ?? '').includes('application/json')) {
      const raw = await response.text()
      const payload = raw ? JSON.parse(raw) : null
      const message = (payload as { choices?: Array<{ message?: { content?: string | null; tool_calls?: ProviderToolCall[] } }> })
        ?.choices?.[0]?.message
      if (!message) throw new Error('AI 返回了空结果（choices 为空）。')
      const content = typeof message.content === 'string' ? message.content : ''
      if (content) onDelta(content)
      return {
        content,
        toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : []
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let finishReason: string | undefined
    const calls = new Map<number, { id: string; name: string; arguments: string }>()

    const consumeLine = (line: string): boolean => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) return false
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') return data === '[DONE]'
      let payload: {
        choices?: Array<{
          delta?: {
            content?: string | null
            tool_calls?: Array<{
              index?: number
              id?: string
              type?: string
              function?: { name?: string; arguments?: string }
            }>
          }
          finish_reason?: string
        }>
      }
      try {
        payload = JSON.parse(data)
      } catch {
        return false
      }
      const choice = payload.choices?.[0]
      if (!choice) return false
      if (choice.finish_reason) finishReason = choice.finish_reason
      const delta = choice.delta
      if (delta?.content) {
        content += delta.content
        onDelta(delta.content)
      }
      for (const [fallbackIndex, part] of (delta?.tool_calls ?? []).entries()) {
        const index = typeof part.index === 'number' ? part.index : fallbackIndex
        const current = calls.get(index) ?? { id: '', name: '', arguments: '' }
        if (part.id) current.id = part.id
        if (part.function?.name) current.name += part.function.name
        if (part.function?.arguments) current.arguments += part.function.arguments
        calls.set(index, current)
      }
      return false
    }

    let doneReading = false
    while (!doneReading) {
      const { value, done: streamDone } = await reader.read()
      buffer += decoder.decode(value, { stream: !streamDone })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (consumeLine(line)) doneReading = true
        newline = buffer.indexOf('\n')
      }
      if (streamDone) {
        if (buffer.trim()) consumeLine(buffer)
        break
      }
    }

    return {
      content,
      toolCalls: [...calls.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, call]) => ({
          id: call.id || `call_${Math.random().toString(36).slice(2)}`,
          type: 'function' as const,
          function: { name: call.name, arguments: call.arguments || '{}' }
        })),
      finishReason
    }
  } catch (error) {
    throw normalizeFetchError(error, config)
  } finally {
    done()
  }
}

function normalizeFetchError(error: unknown, config: AiRuntimeConfig): Error {
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error('AI 请求超时（120 秒），请检查网络或换一个更小的模型。')
  }
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    return new Error(
      `无法连接 AI 接口：${config.baseUrl}。本地 Ollama 请确认已经运行，远程接口请检查网络与证书。`
    )
  }
  return error instanceof Error ? error : new Error(String(error))
}
