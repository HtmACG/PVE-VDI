const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  const digits = exponent === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : decimals
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`
}

export function formatBytesPerSecond(bytes: number): string {
  return `${formatBytes(bytes)}/s`
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '0%'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${Math.max(1, minutes)} 分钟`
}

export function formatUptimeShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 1) return '<1s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${secs}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function formatDateTime(value: number | string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(typeof value === 'number' ? value : value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options
  }).format(date)
}

export function formatFullDateTime(value: number | string | Date): string {
  return formatDateTime(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function relativeTime(epochSeconds: number, now = Date.now()): string {
  if (!epochSeconds) return '—'
  const deltaSeconds = Math.floor(now / 1000 - epochSeconds)
  if (deltaSeconds < 5) return '刚刚'
  if (deltaSeconds < 60) return `${deltaSeconds} 秒前`
  const minutes = Math.floor(deltaSeconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return formatDateTime(epochSeconds * 1000)
}

export function formatTimeAgoFromMs(timestamp: number): string {
  return relativeTime(Math.floor(timestamp / 1000))
}

export function shortUpid(upid: string): string {
  if (!upid) return '—'
  const parts = upid.split(':')
  return parts.length > 3 ? `…${parts[parts.length - 1] ? upid.slice(-12) : upid}` : upid
}

export function splitLicense(version: string): string {
  return version.replace(/^pve-manager\//, '').split('/')[0] ?? version
}

export function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
