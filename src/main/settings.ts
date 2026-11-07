import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import {
  DEFAULT_SERVER_URL,
  DEFAULT_USERNAME,
  MAX_REFRESH_INTERVAL,
  MIN_REFRESH_INTERVAL
} from '@shared/ipc'
import type {
  AppSettings,
  BackgroundImages,
  BackgroundKind,
  NetworkView,
  PreferencesPatch,
  SessionProfile,
  Theme,
  UiFont
} from '@shared/types'
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
  notificationsEnabled: boolean
  notifyVmShutdown: boolean
  notifyTaskFailure: boolean
  appearanceVersion: 2
  loginBackground?: string
  appBackground?: string
  encryptedPassword?: string
  /** 应用内写入过 cloud-init 密码的虚拟机；PVE API 不回传 cipassword，只能自己缓存 */
  encryptedCloudInitPasswords?: Record<string, string>
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
  notificationsEnabled: true,
  notifyVmShutdown: true,
  notifyTaskFailure: true,
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
  private readonly backgroundCache = new Map<BackgroundKind, string>()

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
        notificationsEnabled: raw.notificationsEnabled !== false,
        notifyVmShutdown: raw.notifyVmShutdown !== false,
        notifyTaskFailure: raw.notifyTaskFailure !== false,
        appearanceVersion: 2,
        loginBackground: typeof raw.loginBackground === 'string' ? raw.loginBackground : undefined,
        appBackground: typeof raw.appBackground === 'string' ? raw.appBackground : undefined,
        encryptedPassword:
          typeof raw.encryptedPassword === 'string' && raw.encryptedPassword
            ? raw.encryptedPassword
            : undefined,
        encryptedCloudInitPasswords:
          raw.encryptedCloudInitPasswords &&
          typeof raw.encryptedCloudInitPasswords === 'object' &&
          !Array.isArray(raw.encryptedCloudInitPasswords)
            ? Object.fromEntries(
                Object.entries(raw.encryptedCloudInitPasswords).filter(
                  ([key, value]) => /^\d+$/.test(key) && typeof value === 'string'
                )
              )
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
      launchAtLogin: this.data.launchAtLogin,
      notificationsEnabled: this.data.notificationsEnabled,
      notifyVmShutdown: this.data.notifyVmShutdown,
      notifyTaskFailure: this.data.notifyTaskFailure,
      hasLoginBackground: Boolean(this.backgroundFilePath('login')),
      hasAppBackground: Boolean(this.backgroundFilePath('app'))
    }
  }

  private backgroundDir(): string {
    return path.join(app.getPath('userData'), 'backgrounds')
  }

  private backgroundName(kind: BackgroundKind): string | undefined {
    return kind === 'login' ? this.data.loginBackground : this.data.appBackground
  }

  private backgroundFilePath(kind: BackgroundKind): string | null {
    const name = this.backgroundName(kind)
    if (!name || path.basename(name) !== name) return null
    const full = path.join(this.backgroundDir(), name)
    return fs.existsSync(full) ? full : null
  }

  private readBackground(kind: BackgroundKind): string | undefined {
    const cached = this.backgroundCache.get(kind)
    if (cached) return cached
    const file = this.backgroundFilePath(kind)
    if (!file) return undefined
    try {
      const ext = path.extname(file).toLowerCase()
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : 'image/jpeg'
      const data = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
      this.backgroundCache.set(kind, data)
      return data
    } catch {
      return undefined
    }
  }

  getBackgrounds(): BackgroundImages {
    return {
      login: this.readBackground('login'),
      app: this.readBackground('app')
    }
  }

  private removeBackgroundFile(kind: BackgroundKind): void {
    const name = this.backgroundName(kind)
    if (!name) return
    try {
      fs.rmSync(path.join(this.backgroundDir(), name), { force: true })
    } catch {
      // A missing background file is equivalent to no background.
    }
  }

  setBackground(kind: BackgroundKind, sourcePath: string): BackgroundImages {
    const source = path.resolve(sourcePath)
    let stat: fs.Stats
    try {
      stat = fs.statSync(source)
    } catch {
      throw new Error('无法读取所选图片。')
    }
    const ext = path.extname(source).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
      throw new Error('背景图片仅支持 PNG、JPEG、WebP 或 GIF。')
    }
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) {
      throw new Error('背景图片大小不能超过 16 MB。')
    }
    fs.mkdirSync(this.backgroundDir(), { recursive: true })
    this.removeBackgroundFile(kind)
    const filename = `${kind}${ext}`
    fs.copyFileSync(source, path.join(this.backgroundDir(), filename))
    if (kind === 'login') this.data.loginBackground = filename
    else this.data.appBackground = filename
    this.backgroundCache.delete(kind)
    this.persist()
    return this.getBackgrounds()
  }

  clearBackground(kind: BackgroundKind): BackgroundImages {
    this.removeBackgroundFile(kind)
    if (kind === 'login') this.data.loginBackground = undefined
    else this.data.appBackground = undefined
    this.backgroundCache.delete(kind)
    this.persist()
    return this.getBackgrounds()
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

  /** 应用内写入 cloud-init 密码时顺手缓存；PVE 的 GET config 不会回传 cipassword */
  saveCloudInitPassword(vmid: number, password: string): void {
    if (!password || !this.encryptionAvailable || !Number.isFinite(vmid)) return
    try {
      const encrypted = safeStorage.encryptString(password).toString('base64')
      this.data.encryptedCloudInitPasswords = {
        ...(this.data.encryptedCloudInitPasswords ?? {}),
        [String(vmid)]: encrypted
      }
      this.persist()
    } catch {
      /* 加密失败就不缓存，用户下次手动输入 */
    }
  }

  getCloudInitPassword(vmid: number): string | null {
    const encrypted = this.data.encryptedCloudInitPasswords?.[String(vmid)]
    if (!encrypted || !this.encryptionAvailable) return null
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
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
    if (patch.notificationsEnabled !== undefined) {
      if (typeof patch.notificationsEnabled !== 'boolean') throw new Error('桌面通知设置无效。')
      this.data.notificationsEnabled = patch.notificationsEnabled
    }
    if (patch.notifyVmShutdown !== undefined) {
      if (typeof patch.notifyVmShutdown !== 'boolean') throw new Error('虚拟机关机通知设置无效。')
      this.data.notifyVmShutdown = patch.notifyVmShutdown
    }
    if (patch.notifyTaskFailure !== undefined) {
      if (typeof patch.notifyTaskFailure !== 'boolean') throw new Error('任务失败通知设置无效。')
      this.data.notifyTaskFailure = patch.notifyTaskFailure
    }
    this.persist()
    this.syncLaunchAtLogin()
    return this.get()
  }

  forgetCredentials(): AppSettings {
    this.data.rememberPassword = false
    this.data.encryptedPassword = undefined
    this.data.encryptedCloudInitPasswords = undefined
    this.persist()
    return this.get()
  }

  setRememberedServer(serverUrl: string, username: string): void {
    this.data.serverUrl = normalizeServerUrl(serverUrl)
    this.data.username = username
    this.persist()
  }
}
