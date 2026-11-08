import type { AiPermission, AiProvider } from './types'

export interface AiProviderPreset {
  label: string
  baseUrl: string
  model: string
  needsKey: boolean
  hint: string
}

export const AI_PROVIDER_PRESETS: Record<AiProvider, AiProviderPreset> = {
  openai: {
    label: 'OpenAI / GPT',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsKey: true,
    hint: '支持 OpenAI 兼容接口'
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    needsKey: true,
    hint: 'DeepSeek 官方 API，支持 function calling'
  },
  ollama: {
    label: '本地 Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b',
    needsKey: false,
    hint: '本机 Ollama；模型需支持 tools（如 qwen2.5、llama3.1）'
  },
  custom: {
    label: '自定义 OpenAI 兼容接口',
    baseUrl: '',
    model: '',
    needsKey: false,
    hint: '填写自建网关或代理的 base URL（到 /v1 为止）；Key 可选'
  }
}

export const AI_PERMISSION_LABELS: Record<AiPermission, string> = {
  'read-only': '只读',
  confirm: '每次确认',
  full: '完全授权'
}

export const AI_PERMISSION_HINTS: Record<AiPermission, string> = {
  'read-only': 'AI 只能查询节点、虚拟机、任务，不能做任何变更',
  confirm: '查询自动执行；启动、关机、快照等变更必须在对话里点击确认',
  full: '变更工具直接执行，不再逐次确认；仅建议在测试/受控环境使用'
}

export const AI_DEFAULT_PERMISSION: AiPermission = 'confirm'
