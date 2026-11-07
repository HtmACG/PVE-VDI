import type { Theme } from '@shared/types'

/**
 * xterm.js 的配色。xterm 在 canvas 里画字，吃不到 Tailwind 的 CSS 变量，
 * 所以这里用硬编码色值，深浅两套分别对齐应用的主题底色。
 */
export const XTERM_THEMES: Record<Theme, Record<string, string>> = {
  dark: {
    background: '#050608',
    foreground: '#d4d4d8',
    cursor: '#f26b1d',
    cursorAccent: '#050608',
    selectionBackground: '#f26b1d40',
    black: '#18181b',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e4e4e7',
    brightBlack: '#71717a',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#fafafa'
  },
  light: {
    background: '#ffffff',
    foreground: '#27272a',
    cursor: '#0078d4',
    cursorAccent: '#ffffff',
    selectionBackground: '#0078d440',
    black: '#27272a',
    red: '#b91c1c',
    green: '#15803d',
    yellow: '#a16207',
    blue: '#1d4ed8',
    magenta: '#7e22ce',
    cyan: '#0e7490',
    white: '#e4e4e7',
    brightBlack: '#52525b',
    brightRed: '#dc2626',
    brightGreen: '#16a34a',
    brightYellow: '#ca8a04',
    brightBlue: '#2563eb',
    brightMagenta: '#9333ea',
    brightCyan: '#0891b2',
    brightWhite: '#f4f4f5'
  }
}

/** 读当前主题：html.light / html.dark 由 applyAppearance 写入 */
export function currentTheme(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}
