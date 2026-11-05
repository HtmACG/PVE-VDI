import type { AppSettings } from '@shared/types'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_CUSTOM_FONT,
  DEFAULT_UI_FONT,
  normalizeAccentColor,
  readableForeground,
  resolveFontStack
} from '@shared/appearance'

export function applyAppearance(settings: AppSettings | null | undefined): void {
  const root = document.documentElement
  const theme = settings?.theme ?? 'dark'
  const uiFont = settings?.uiFont ?? DEFAULT_UI_FONT
  const customFont = settings?.customFont ?? DEFAULT_CUSTOM_FONT
  const accent = normalizeAccentColor(settings?.accentColor) ?? DEFAULT_ACCENT_COLOR
  const fontStack = resolveFontStack(uiFont, customFont)

  root.classList.toggle('light', theme === 'light')
  root.classList.toggle('dark', theme !== 'light')
  root.style.setProperty('--ui-font', fontStack)
  root.style.setProperty('--font-sans', fontStack)
  root.style.setProperty('--brand', accent)
  root.style.setProperty('--ring', accent)
  root.style.setProperty('--brand-fg', readableForeground(accent))
}
