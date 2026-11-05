import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import {
  DEFAULT_SERVER_URL,
  DEFAULT_USERNAME,
  MAX_REFRESH_INTERVAL,
  MIN_REFRESH_INTERVAL
} from '@shared/ipc'
import type { AppSettings, NetworkView, PreferencesPatch, SessionProfile, Theme, UiFont } from '@shared/types'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_CUSTOM_FONT,
  DEFAULT_UI_FONT,
  isUiFont,
  normalizeAccentColor,
  normalizeCustomFont
} from '@shared/appearance'
import { normalizeServerUrl } from './pve/client'

interface StoredSettings {
  serverUrl: string
  username: string
  allowSelfSigned: boolean
  rememberPassword: boolean
  theme: Theme
  refreshInterval: number
  uiFont: UiFont
  customFont: string
  accentColor: string
  networkView: NetworkView
  launchAtLogin: boolean
  appearanceVersion: 2
  encryptedPassword?: string
}

const DEFAULTS: StoredSettings = {
  serverUrl: DEFAULT_SERVER_URL,
  username: DEFAULT_USERNAME,
  allowSelfSigned: true,
  rememberPassword: false,
  theme: 'dark',
  refreshInterval: 8,
  uiFont: DEFAULT_UI_FONT,
  customFont: DEFAULT_CUSTOM_FONT,
  accentColor: DEFAULT_ACCENT_COLOR,
  networkView: 'cards',
  launchAtLogin: false,
  appearanceVersion: 2
}

function validTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

function clampRefresh(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULTS.refreshInterval
  return Math.round(Math.min(MAX_REFRESH_INTERVAL, Math.max(MIN_REFRESH_INTERVAL, parsed)))
}

export class SettingsStore {
  private readonly filePath: string
  private data: StoredSettings
  private encryptionAvailable: boolean

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'settings.json')
    this.encryptionAvailable = safeStorage.isEncryptionAvailable()
    this.data = this.load()
  }

  private load(): StoredSettings {
    try {
      if (!fs.existsSync(this.filePath)) return { ...DEFAULTS }
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<StoredSettings>
      let serverUrl = typeof raw.serverUrl === 'string' ? raw.serverUrl : DEFAULTS.serverUrl
      try {
        serverUrl = normalizeServerUrl(serverUrl)
      } catch {
        serverUrl = DEFAULTS.serverUrl
      }
      const appearanceVersion = raw.appearanceVersion === 2 ? 2 : 1
      const rawAccent = normalizeAccentColor(raw.accentColor)
      const migratedAccent =
        appearanceVersion === 1 && (!rawAccent || rawAccent === '#f26b1d') ? DEFAULT_ACCENT_COLOR : rawAccent
      const migratedFont =
        appearanceVersion === 1 && raw.uiFont === 'inter' ? DEFAULT_UI_FONT : isUiFont(raw.uiFont) ? raw.uiFont : DEFAULTS.uiFont
      return {
        serverUrl,
        username: typeof raw.username === 'string' && raw.username ? raw.username : DEFAULTS.username,
        allowSelfSigned: raw.allowSelfSigned !== false,
        rememberPassword: raw.rememberPassword === true,
        theme: validTheme(raw.theme) ? raw.theme : DEFAULTS.theme,
        refreshInterval: clampRefresh(raw.refreshInterval),
        uiFont: migratedFont,
        customFont: normalizeCustomFont(raw.customFont),
        accentColor: migratedAccent ?? DEFAULTS.accentColor,
        networkView: raw.networkView === 'list' ? 'list' : 'cards',
        launchAtLogin: raw.launchAtLogin === true,
        appearanceVersion: 2,
        encryptedPassword:
          typeof raw.encryptedPassword === 'string' && raw.encryptedPassword
            ? raw.encryptedPassword
            : undefined
      }
    } catch {
      return { ...DEFAULTS }
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 })
      fs.renameSync(tmp, this.filePath)
    } catch (error) {
      console.error('Failed to persist settings', error)
    }
  }

  get(): AppSettings {
    return {
      serverUrl: this.data.serverUrl,
      username: this.data.username,
      allowSelfSigned: this.data.allowSelfSigned,
      rememberPassword: this.data.rememberPassword,
      hasSavedPassword: Boolean(this.data.encryptedPassword),
      credentialStorageAvailable: this.encryptionAvailable,
      theme: this.data.theme,
      refreshInterval: this.data.refreshInterval,
      uiFont: this.data.uiFont,
      customFont: this.data.customFont,
      accentColor: this.data.accentColor,
      networkView: this.data.networkView,
      launchAtLogin: this.data.launchAtLogin
    }
  }

  syncLaunchAtLogin(): void {
    if (process.platform !== 'win32' || !app.isPackaged) return
    const current = app.getLoginItemSettings().openAtLogin
    if (current === this.data.launchAtLogin) return
    app.setLoginItemSettings({
      openAtLogin: this.data.launchAtLogin,
      path: process.execPath
    })
  }

  recordLogin(input: {
    serverUrl: string
    username: string
    password: string
    rememberPassword: boolean
    allowSelfSigned: boolean
  }, _session: SessionProfile): void {
    this.data.serverUrl = normalizeServerUrl(input.serverUrl)
    this.data.username = input.username.trim()
    this.data.allowSelfSigned = input.allowSelfSigned
    this.data.rememberPassword = input.rememberPassword
    if (input.rememberPassword && this.encryptionAvailable) {
      try {
        this.data.encryptedPassword = safeStorage.encryptString(input.password).toString('base64')
      } catch {
        this.data.encryptedPassword = undefined
        this.data.rememberPassword = false
      }
    } else {
      this.data.encryptedPassword = undefined
    }
    this.persist()
  }

  getSavedPassword(): string | null {
    if (!this.data.rememberPassword || !this.data.encryptedPassword || !this.encryptionAvailable) {
      return null
    }
    try {
      return safeStorage.decryptString(Buffer.from(this.data.encryptedPassword, 'base64'))
    } catch {
      return null
    }
  }

  updatePreferences(patch: PreferencesPatch): AppSettings {
    if (patch.theme !== undefined) {
      if (!validTheme(patch.theme)) throw new Error('主题设置无效。')
      this.data.theme = patch.theme
    }
    if (patch.refreshInterval !== undefined) {
      this.data.refreshInterval = clampRefresh(patch.refreshInterval)
    }
    if (patch.uiFont !== undefined) {
      if (!isUiFont(patch.uiFont)) throw new Error('界面字体设置无效。')
      this.data.uiFont = patch.uiFont
    }
    if (patch.customFont !== undefined) {
      this.data.customFont = normalizeCustomFont(patch.customFont)
    }
    if (patch.accentColor !== undefined) {
      const accent = normalizeAccentColor(patch.accentColor)
      if (!accent) throw new Error('强调色必须是 #RRGGBB 格式。')
      this.data.accentColor = accent
    }
    if (patch.networkView !== undefined) {
      if (patch.networkView !== 'cards' && patch.networkView !== 'list') {
        throw new Error('网络接口展示方式无效。')
      }
      this.data.networkView = patch.networkView
    }
    if (patch.launchAtLogin !== undefined) {
      if (typeof patch.launchAtLogin !== 'boolean') throw new Error('开机自启设置无效。')
      this.data.launchAtLogin = patch.launchAtLogin
    }
    this.persist()
    this.syncLaunchAtLogin()
    return this.get()
  }

  forgetCredentials(): AppSettings {
    this.data.rememberPassword = false
    this.data.encryptedPassword = undefined
    this.persist()
    return this.get()
  }

  setRememberedServer(serverUrl: string, username: string): void {
    this.data.serverUrl = normalizeServerUrl(serverUrl)
    this.data.username = username
    this.persist()
  }
}
