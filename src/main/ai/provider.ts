import type { AiProvider } from '@shared/types'

/**
 * OpenAI 兼容的聊天接口客户端。
 *
 * 同时覆盖 OpenAI / DeepSeek / 本地 Ollama（/v1 兼容层）以及自建网关；
 * 工具调用走标准 `tools` / `tool_calls` 字段。
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

export async function chatCompletion(
  config: AiRuntimeConfig,
  messages: ProviderMessage[],
  tools: ProviderTool[]
): Promise<ProviderReply> {
  if (!config.model.trim()) throw new Error('还没有配置 AI 模型。')
  // 本地 Ollama / 自建网关经常不校验 Key；OpenAI / DeepSeek 必须配置
  if ((config.provider === 'openai' || config.provider === 'deepseek') && !config.apiKey) {
    throw new Error('还没有配置 API Key，请先在「首选项 → AI 助手」里填写。')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  try {
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
    const response = await fetch(endpointOf(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    const raw = await response.text()
    let payload: unknown = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object'
          ? String(
              (payload as { error?: { message?: string } }).error?.message ??
                (payload as { message?: string }).message ??
                raw.slice(0, 300)
            )
          : raw.slice(0, 300)
      if (response.status === 401 || response.status === 403) {
        throw new Error(`AI 认证失败（${response.status}）：API Key 无效或没有权限。`)
      }
      if (response.status === 404) {
        throw new Error(`AI 接口不存在（404）：请检查 base URL 与模型名。${message ? ` · ${message}` : ''}`)
      }
      if (response.status === 429) {
        throw new Error('AI 请求太频繁或额度不足（429），请稍后再试。')
      }
      throw new Error(`AI 请求失败（${response.status}）：${message || '未知错误'}`)
    }

    const choice = payload as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: ProviderToolCall[] }
        finish_reason?: string
      }>
      error?: { message?: string }
    }
    const message = choice.choices?.[0]?.message
    if (!message) {
      throw new Error(choice.error?.message || 'AI 返回了空结果（choices 为空）。')
    }

    return {
      content: typeof message.content === 'string' ? message.content : '',
      toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
      finishReason: choice.choices?.[0]?.finish_reason
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI 请求超时（120 秒），请检查网络或换一个更小的模型。')
    }
    if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
      throw new Error(
        `无法连接 AI 接口：${config.baseUrl}。本地 Ollama 请确认已经运行，远程接口请检查网络与证书。`
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
