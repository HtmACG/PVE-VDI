import type { UiFont } from '@shared/types'

export const DEFAULT_ACCENT_COLOR = '#f26b1d'
export const DEFAULT_UI_FONT: UiFont = 'inter'
export const DEFAULT_CUSTOM_FONT = ''

export interface UiFontOption {
  value: UiFont
  label: string
  description: string
  stack: string
}

export const UI_FONT_OPTIONS: UiFontOption[] = [
  {
    value: 'inter',
    label: 'Inter',
    description: '默认无衬线字体',
    stack: "'Inter Variable', 'Inter', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
  },
  {
    value: 'system',
    label: '系统字体',
    description: '跟随 Windows 系统界面',
    stack:
      "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
  },
  {
    value: 'mono',
    label: '等宽字体',
    description: 'JetBrains Mono + 中文回退',
    stack:
      "'JetBrains Mono Variable', 'Cascadia Code', Consolas, 'Microsoft YaHei UI', 'PingFang SC', monospace"
  },
  {
    value: 'custom',
    label: '自定义',
    description: '填写已安装的字体族',
    stack: ''
  }
]

export const ACCENT_COLORS = [
  { name: '工业橙', value: '#f26b1d' },
  { name: '信号蓝', value: '#3b82f6' },
  { name: '青绿', value: '#0d9488' },
  { name: '紫罗兰', value: '#8b5cf6' },
  { name: '玫红', value: '#e11d48' },
  { name: '琥珀', value: '#d97706' }
] as const

export function isUiFont(value: unknown): value is UiFont {
  return value === 'inter' || value === 'system' || value === 'mono' || value === 'custom'
}

export function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
  return null
}

export function normalizeCustomFont(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CUSTOM_FONT
  return value.replace(/[{};]/g, '').trim().slice(0, 200)
}

export function resolveFontStack(uiFont: UiFont, customFont: string): string {
  if (uiFont === 'custom') {
    const custom = normalizeCustomFont(customFont)
    return custom || UI_FONT_OPTIONS[0].stack
  }
  return UI_FONT_OPTIONS.find((option) => option.value === uiFont)?.stack ?? UI_FONT_OPTIONS[0].stack
}

export function readableForeground(hexColor: string): '#0b0b0b' | '#fffaf5' {
  const normalized = normalizeAccentColor(hexColor) ?? DEFAULT_ACCENT_COLOR
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255
  const linear = (value: number): number =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  return luminance > 0.46 ? '#0b0b0b' : '#fffaf5'
}
