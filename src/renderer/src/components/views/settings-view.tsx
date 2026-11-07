import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  EthernetPort,
  Globe2,
  History,
  Image as ImageIcon,
  Mail,
  Moon,
  Power,
  RefreshCw,
  Server,
  Sun,
  Trash2,
  Unplug,
  KeyRound,
  LayoutGrid,
  LockKeyhole,
  Network,
  Palette,
  Type
} from 'lucide-react'
import { FaGithub } from 'react-icons/fa6'
import type {
  AppSettings,
  BackgroundImages,
  BackgroundKind,
  BackgroundPickResult,
  DashboardData,
  PreferencesPatch,
  SessionProfile,
  Theme,
  UiFont,
  UpdateCheckResult
} from '@shared/types'
import {
  ACCENT_COLORS,
  DEFAULT_ACCENT_COLOR,
  UI_FONT_OPTIONS,
  normalizeAccentColor,
  normalizeCustomFont,
  resolveFontStack
} from '@shared/appearance'
import { PageHeader, PanelHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { DataRow } from '@renderer/components/common'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { APP_AUTHOR } from '@shared/app-info'
import { APP_CHANGELOG } from '@shared/changelog'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { formatDateTime, splitLicense } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'

interface SettingsViewProps {
  settings: AppSettings
  session: SessionProfile
  dashboard: DashboardData
  theme: Theme
  appVersion: string
  electronVersion: string
  backgrounds: BackgroundImages
  onUpdatePreferences: (patch: PreferencesPatch) => Promise<void>
  onBackgroundChange: (result: BackgroundPickResult) => void
  onForgetCredentials: () => Promise<void>
  onDisconnect: () => void
}

export function SettingsView({
  settings,
  session,
  dashboard,
  theme,
  appVersion,
  electronVersion,
  backgrounds,
  onUpdatePreferences,
  onBackgroundChange,
  onForgetCredentials,
  onDisconnect
}: SettingsViewProps): React.JSX.Element {
  const [saving, setSaving] = useState(false)
  const [forgetOpen, setForgetOpen] = useState(false)
  const [forgetting, setForgetting] = useState(false)
  const [customFontDraft, setCustomFontDraft] = useState(settings.customFont)
  const [customFontError, setCustomFontError] = useState<string | null>(null)
  const [accentDraft, setAccentDraft] = useState(settings.accentColor)
  const [accentError, setAccentError] = useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [backgroundBusy, setBackgroundBusy] = useState<BackgroundKind | null>(null)
  const [testingNotification, setTestingNotification] = useState(false)

  useEffect(() => {
    setCustomFontDraft(settings.customFont)
  }, [settings.customFont])

  useEffect(() => {
    setAccentDraft(settings.accentColor)
  }, [settings.accentColor])

  const update = async (patch: PreferencesPatch): Promise<void> => {
    setSaving(true)
    try {
      await onUpdatePreferences(patch)
    } finally {
      setSaving(false)
    }
  }

  const applyCustomFont = async (): Promise<void> => {
    const normalized = normalizeCustomFont(customFontDraft)
    if (!normalized) {
      setCustomFontError('请输入一个字体族名称。')
      return
    }
    setCustomFontError(null)
    setCustomFontDraft(normalized)
    await update({ uiFont: 'custom', customFont: normalized })
  }

  const applyAccent = async (): Promise<void> => {
    const normalized = normalizeAccentColor(accentDraft)
    if (!normalized) {
      setAccentError('请输入有效的 #RRGGBB 颜色值。')
      return
    }
    setAccentError(null)
    setAccentDraft(normalized)
    await update({ accentColor: normalized })
  }

  const fontPreview = resolveFontStack(
    settings.uiFont === 'custom' ? 'custom' : settings.uiFont,
    settings.uiFont === 'custom' ? customFontDraft : settings.customFont
  )
  const validAccent = normalizeAccentColor(accentDraft) ?? settings.accentColor ?? DEFAULT_ACCENT_COLOR

  const checkUpdates = async (): Promise<void> => {
    setCheckingUpdates(true)
    setUpdateError(null)
    try {
      const result = await unwrap(window.pvevdi.checkUpdates())
      setUpdateInfo(result)
    } catch (err) {
      setUpdateError(errorDetail(err))
    } finally {
      setCheckingUpdates(false)
    }
  }

  const openExternal = (url: string): void => {
    void window.pvevdi.openExternal(url)
  }

  const sendTestNotification = async (): Promise<void> => {
    setTestingNotification(true)
    try {
      await unwrap(window.pvevdi.testNotification())
      toast.success('已发送测试通知', {
        description: '如果没有看到，请检查 Windows 通知设置与「专注助手」。'
      })
    } catch (err) {
      toast.error('无法发送通知', { description: errorDetail(err) })
    } finally {
      setTestingNotification(false)
    }
  }

  const pickBackground = async (kind: BackgroundKind): Promise<void> => {
    setBackgroundBusy(kind)
    try {
      const result = await unwrap(window.pvevdi.pickBackground(kind))
      if (!result) return
      onBackgroundChange(result)
      toast.success(kind === 'login' ? '登录页背景已更新' : '软件背景已更新')
    } catch (err) {
      toast.error('无法设置背景', { description: errorDetail(err) })
    } finally {
      setBackgroundBusy(null)
    }
  }

  const clearBackground = async (kind: BackgroundKind): Promise<void> => {
    setBackgroundBusy(kind)
    try {
      const result = await unwrap(window.pvevdi.clearBackground(kind))
      onBackgroundChange(result)
      toast.success(kind === 'login' ? '登录页背景已清除' : '软件背景已清除')
    } catch (err) {
      toast.error('无法清除背景', { description: errorDetail(err) })
    } finally {
      setBackgroundBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${session.clusterName} 集群`}
        title="首选项"
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-7">
          <Card>
            <PanelHeader
              title="可视化设置"
            />
            <div className="space-y-5 p-4">
              <div>
                <div className="mb-2 text-[12px] font-medium text-muted-foreground">主题</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'dark' as const, label: '深色', description: '高对比 / 深色界面', icon: Moon },
                    { value: 'light' as const, label: '浅色', description: '明亮 / 浅色界面', icon: Sun }
                  ].map((option) => {
                    const Icon = option.icon
                    const active = theme === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={saving}
                        onClick={() => void update({ theme: option.value })}
                        className={cn(
                          'flex items-center gap-3 border p-3 text-left transition-colors',
                          active ? 'border-brand/60 bg-brand/[0.05]' : 'border-border bg-panel/30 hover:border-border-strong'
                        )}
                      >
                        <div className={cn('flex h-8 w-8 items-center justify-center', active ? 'text-brand' : 'text-muted-foreground')}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-[12px] font-medium text-foreground">{option.label}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{option.description}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Type className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <div className="text-[12px] text-foreground">界面字体</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">控制页面主字体；数据仍使用等宽字体。</div>
                    </div>
                  </div>
                  <Select
                    value={settings.uiFont}
                    disabled={saving}
                    onValueChange={(value) => void update({ uiFont: value as UiFont })}
                  >
                    <SelectTrigger className="h-8 w-[180px] text-[12px]" aria-label="界面字体">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {UI_FONT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} · {option.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {settings.uiFont === 'custom' && (
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    <Input
                      value={customFontDraft}
                      onChange={(event) => {
                        setCustomFontDraft(event.target.value)
                        setCustomFontError(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void applyCustomFont()
                      }}
                      placeholder={'"HarmonyOS Sans SC", "Microsoft YaHei", sans-serif'}
                      aria-label="自定义字体族"
                      className="h-8 min-w-[220px] flex-1 font-mono text-[12px]"
                      disabled={saving}
                    />
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => void applyCustomFont()}>
                      应用字体
                    </Button>
                  </div>
                )}
                {customFontError && <div className="mt-1.5 text-[11px] text-destructive">{customFontError}</div>}

                <div className="mt-3 border border-border bg-panel/30 p-3" style={{ fontFamily: fontPreview }}>
                  <div className="text-[11px] text-muted-foreground">字体预览</div>
                  <div className="mt-1 text-[14px] font-medium text-foreground">节点资源 72.4% · 虚拟机 28 台</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">存储 1.8 TB / 10.0 TB · 最近同步 2 秒前</div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <div className="text-[12px] text-foreground">强调色</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">用于导航、图表、资源条与交互高亮。</div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">{settings.accentColor}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      disabled={saving}
                      onClick={() => void update({ accentColor: color.value })}
                      className={cn(
                        'h-8 w-8 border-2 transition-colors',
                        settings.accentColor === color.value ? 'border-foreground' : 'border-transparent'
                      )}
                      style={{ backgroundColor: color.value }}
                      aria-label={`使用${color.name}强调色`}
                      title={`${color.name} ${color.value}`}
                    />
                  ))}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={validAccent}
                    onChange={(event) => {
                      setAccentDraft(event.target.value)
                      setAccentError(null)
                    }}
                    aria-label="选择强调色"
                    className="h-8 w-9 cursor-pointer border border-border bg-transparent p-0.5"
                  />
                  <Input
                    value={accentDraft}
                    onChange={(event) => {
                      setAccentDraft(event.target.value)
                      setAccentError(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void applyAccent()
                    }}
                    aria-label="强调色十六进制值"
                    placeholder="#f26b1d"
                    className="h-8 w-[130px] font-mono text-[12px]"
                    disabled={saving}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving || normalizeAccentColor(accentDraft) === settings.accentColor}
                    onClick={() => void applyAccent()}
                  >
                    应用颜色
                  </Button>
                  {accentError && <span className="text-[11px] text-destructive">{accentError}</span>}
                </div>
                <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  浅色与深色主题共用同一强调色。若自定义颜色对比度不足，可尝试选择预设色。
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Network className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <div className="text-[12px] text-foreground">网络接口展示</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">控制节点设置中的网卡概览方式。</div>
                    </div>
                  </div>
                  <Select
                    value={settings.networkView}
                    disabled={saving}
                    onValueChange={(value) => void update({ networkView: value as 'cards' | 'list' })}
                  >
                    <SelectTrigger className="h-8 w-[150px] text-[12px]" aria-label="网络接口展示方式">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="cards">卡片</SelectItem>
                      <SelectItem value="list">列表</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_1fr_1fr] gap-2 border border-border bg-panel/25 p-3">
                  {[
                    { label: 'WAN', tone: 'text-brand', highlighted: true, active: true },
                    { label: 'LAN', tone: 'text-info', highlighted: true, active: false },
                    { label: 'ETH', tone: 'text-muted-foreground', highlighted: false, active: false }
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col items-center gap-1.5">
                      <EthernetPort className={cn('h-7 w-10', item.tone)} strokeWidth={1.35} />
                      <span className="font-mono text-[10px] text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                  <div className="col-span-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <LayoutGrid className="h-3 w-3" />
                    卡片视图用于快速识别接口；表格仍保留完整参数。
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-[12px] text-foreground">状态刷新间隔</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">登录状态、节点遥测和任务会按此频率同步。</div>
                </div>
                  <Select
                    value={String(settings.refreshInterval)}
                    disabled={saving}
                    onValueChange={(value) => void update({ refreshInterval: Number(value) })}
                  >
                    <SelectTrigger className="h-8 w-[150px] font-mono text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {[5, 8, 15, 30, 60].map((seconds) => (
                        <SelectItem key={seconds} value={String(seconds)}>
                          {seconds} 秒
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-3 text-[11px] text-muted-foreground">资源占用数据每 2 秒独立刷新。</div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[12px] text-muted-foreground">
                    最近同步 {formatDateTime(dashboard.fetchedAt)} · {dashboard.latencyMs}ms
                  </span>
                </div>
                <span className="text-[11px] text-success">自动刷新</span>
              </div>
            </div>
          </Card>

          <Card>
            <PanelHeader title="背景" description="登录页与主界面可分别使用本地背景图片。" />
            <div className="divide-y divide-border">
              {[
                {
                  kind: 'login' as const,
                  label: '登录页背景',
                  description: '显示在登录页左侧画面区域；未设置时使用默认插画。',
                  url: backgrounds.login,
                  has: settings.hasLoginBackground
                },
                {
                  kind: 'app' as const,
                  label: '软件背景',
                  description: '显示在主界面内容区的空白区域；卡片、标题栏和侧栏保持不透明。',
                  url: backgrounds.app,
                  has: settings.hasAppBackground
                }
              ].map((item) => (
                <div key={item.kind} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="relative flex h-[68px] w-[120px] shrink-0 items-center justify-center overflow-hidden border border-border bg-panel/40">
                    {item.url ? (
                      <img src={item.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
                      {item.label}
                      <span className={item.has ? 'text-[10px] text-success' : 'text-[10px] text-muted-foreground'}>
                        {item.has ? '已设置' : '未设置'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{item.description}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">支持 JPG / PNG / WebP / GIF，最大 16 MB</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={backgroundBusy === item.kind}
                      onClick={() => void pickBackground(item.kind)}
                    >
                      <ImageIcon className="h-3 w-3" />
                      选择图片
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!item.has || backgroundBusy === item.kind}
                      onClick={() => void clearBackground(item.kind)}
                    >
                      <Trash2 className="h-3 w-3" />
                      清除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <PanelHeader title="启动" />
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-2.5">
                <Power className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-[12px] text-foreground">开机自启</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">登录 Windows 后自动启动 PVE VDI。</div>
                </div>
              </div>
              <Switch
                checked={settings.launchAtLogin}
                disabled={saving}
                onCheckedChange={(value) => void update({ launchAtLogin: value })}
                aria-label="开机自启"
              />
            </div>
          </Card>

          <Card>
            <PanelHeader
              title="桌面通知"
              description="通过 Windows 通知中心提醒集群事件；窗口收起到托盘时同样生效。"
              actions={
                <Switch
                  checked={settings.notificationsEnabled}
                  disabled={saving}
                  onCheckedChange={(value) => void update({ notificationsEnabled: value })}
                  aria-label="桌面通知"
                />
              }
            />
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Power className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-[12px] text-foreground">虚拟机关机</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">虚拟机从运行变成已停止时提醒。</div>
                  </div>
                </div>
                <Switch
                  checked={settings.notifyVmShutdown}
                  disabled={saving || !settings.notificationsEnabled}
                  onCheckedChange={(value) => void update({ notifyVmShutdown: value })}
                  aria-label="虚拟机关机通知"
                />
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-[12px] text-foreground">任务失败</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">PVE 任务以失败状态结束时提醒。</div>
                  </div>
                </div>
                <Switch
                  checked={settings.notifyTaskFailure}
                  disabled={saving || !settings.notificationsEnabled}
                  onCheckedChange={(value) => void update({ notifyTaskFailure: value })}
                  aria-label="任务失败通知"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-[12px] text-foreground">测试通知</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    确认 Windows 通知未被系统设置或「专注助手」拦截。
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving || testingNotification || !settings.notificationsEnabled}
                  onClick={() => void sendTestNotification()}
                >
                  <Bell className="h-3 w-3" />
                  发送测试通知
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <PanelHeader
              title="凭据与安全"
              actions={
                <span className={settings.credentialStorageAvailable ? 'text-[12px] text-success' : 'text-[12px] text-warning'}>
                  {settings.credentialStorageAvailable ? 'DPAPI 可用' : '加密存储不可用'}
                </span>
              }
            />
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-3 border border-border bg-panel/30 p-3">
                <div className="flex h-8 w-8 items-center justify-center">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] text-foreground">
                    {settings.hasSavedPassword ? '已保存加密凭据' : '未保存凭据'}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {settings.hasSavedPassword
                      ? '下次启动时使用 Windows DPAPI 解密的密码自动连接。'
                      : '每次启动需要手动输入密码。不会保存明文密码。'}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={!settings.hasSavedPassword}
                  onClick={() => setForgetOpen(true)}
                >
                  <Trash2 className="h-3 w-3" />
                  清除已保存凭据
                </Button>
              </div>

              <div className="flex items-start gap-2 border border-warning/20 bg-warning/[0.04] p-3">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <p className="text-[10px] leading-4 text-muted-foreground">
                  {settings.allowSelfSigned
                    ? '当前允许 PVE 自签名证书，应用不会验证 TLS 证书链。请确保连接到可信的局域网服务器。'
                    : '当前启用严格 TLS 校验，PVE 证书必须被 Windows 信任。'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div className="text-[10px] text-muted-foreground">
                  凭据仅存储在这台设备的应用数据目录中；API 票据不会写入磁盘。
                </div>
                <Button variant="destructive" size="sm" onClick={onDisconnect}>
                  <Unplug className="h-3 w-3" />
                  断开连接
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-3 xl:col-span-5">
          <Card>
            <PanelHeader title="当前连接" actions={<span className="text-[12px] text-success">已连接</span>} />
            <div className="px-4">
              <DataRow label="PVE 地址" mono>{session.serverUrl.replace(/^https?:\/\//, '')}</DataRow>
              <DataRow label="账户" mono>{session.username}</DataRow>
              <DataRow label="集群" mono>{session.clusterName}</DataRow>
              <DataRow label="PVE 版本" mono>{dashboard.version.version}</DataRow>
              <DataRow label="节点" mono>{dashboard.nodes.length}</DataRow>
              <DataRow label="连接建立" mono>{formatDateTime(session.connectedAt)}</DataRow>
            </div>
            <div className="border-t border-border p-4">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <LockKeyhole className="h-3 w-3 text-success" />
                TLS {settings.allowSelfSigned ? '允许自签名证书' : '严格校验证书'}
              </div>
              <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground/80">
                {dashboard.nodes[0]?.sslFingerprint ?? '证书指纹不可用'}
              </div>
            </div>
          </Card>

          <Card>
            <PanelHeader title="应用信息" />
            <div className="px-4">
              <DataRow label="产品">PVE VDI</DataRow>
              <DataRow label="版本" mono>v{appVersion}</DataRow>
              <DataRow label="Electron" mono>{electronVersion}</DataRow>
              <DataRow label="界面框架">React · Tailwind · shadcn/ui</DataRow>
              <DataRow label="控制台">noVNC 1.7 · xterm.js 6</DataRow>
              <DataRow label="API" mono>PVE API2 / JSON</DataRow>
              <DataRow label="集群节点" mono>{dashboard.nodes.map((node) => `${node.node} (${splitLicense(node.pveVersion ?? '—')})`).join(', ')}</DataRow>
            </div>
            <div className="border-t border-border p-4">
              <div className="flex items-start gap-2">
                <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-[11px] leading-5 text-muted-foreground">
                  桌面端直接通过 Electron 主进程访问 PVE API。渲染进程禁用 Node.js，仅通过受限 IPC 通道请求数据。
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <PanelHeader
              title="开发者与更新"
              actions={
                <Button variant="outline" size="sm" onClick={() => void checkUpdates()} loading={checkingUpdates}>
                  <RefreshCw className="h-3 w-3" />
                  检查更新
                </Button>
              }
            />
            <div className="space-y-3 p-4">
              <div className="border border-border p-3">
                <div className="text-[12px] font-medium text-foreground">{APP_AUTHOR.name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openExternal(`mailto:${APP_AUTHOR.email}`)}>
                    <Mail className="h-3 w-3" />
                    {APP_AUTHOR.email}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openExternal(APP_AUTHOR.website)}>
                    <Globe2 className="h-3 w-3" />
                    {APP_AUTHOR.websiteLabel}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openExternal(APP_AUTHOR.github)}>
                    <FaGithub className="h-3 w-3" />
                    GitHub
                  </Button>
                </div>
              </div>

              <div className="border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] text-foreground">
                    当前版本 <span className="font-mono text-[11px] text-muted-foreground">v{appVersion}</span>
                  </div>
                  {updateInfo ? (
                    updateInfo.hasUpdate ? (
                      <span className="text-[11px] text-brand">发现 v{updateInfo.latestVersion}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        已是最新版本
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] text-muted-foreground">尚未检查</span>
                  )}
                </div>
                {updateError && <div className="mt-2 text-[11px] leading-4 text-destructive">{updateError}</div>}
                {updateInfo?.hasUpdate && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openExternal(updateInfo.releaseUrl)}>
                      <Download className="h-3 w-3" />
                      打开下载页
                    </Button>
                    {updateInfo.publishedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatDateTime(new Date(updateInfo.publishedAt).getTime())}
                      </span>
                    )}
                  </div>
                )}
                {updateInfo && !updateInfo.hasUpdate && (
                  <div className="mt-1 text-[10px] leading-4 text-muted-foreground">
                    GitHub 最新版本 v{updateInfo.latestVersion}
                    {updateInfo.source === 'tag' ? '（tag）' : ''}
                  </div>
                )}
                {updateInfo?.notes && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap border border-border bg-background p-2 text-[10px] leading-4 text-muted-foreground">
                    {updateInfo.notes}
                  </pre>
                )}
                {!updateInfo && !updateError && (
                  <div className="mt-1 text-[10px] leading-4 text-muted-foreground">
                    通过 GitHub 仓库读取 Release / Tag 并比较版本。
                  </div>
                )}
              </div>

              <Button variant="ghost" size="sm" className="px-2" onClick={() => setChangelogOpen(true)}>
                <History className="h-3 w-3" />
                更新日志
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <AlertDialog open={forgetOpen} onOpenChange={setForgetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清除已保存的凭据？</AlertDialogTitle>
            <AlertDialogDescription>
              当前已保存的加密密码将被从本机删除。当前会话仍保持连接，但下次启动需要重新输入密码。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={forgetting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={forgetting}
              onClick={async (event) => {
                event.preventDefault()
                setForgetting(true)
                try {
                  await onForgetCredentials()
                  setForgetOpen(false)
                } finally {
                  setForgetting(false)
                }
              }}
            >
              清除凭据
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={changelogOpen} onOpenChange={setChangelogOpen}>
        <DialogContent className="max-h-[82vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>更新日志</DialogTitle>
            <DialogDescription>PVE VDI 的版本变更记录。</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {APP_CHANGELOG.map((entry) => (
              <section key={entry.version}>
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
                  <span className="font-mono text-[12px] text-foreground">v{entry.version}</span>
                  <span className="text-[11px] text-muted-foreground">{entry.date}</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {entry.items.map((item) => (
                    <li key={item} className="flex gap-2 text-[11px] leading-5 text-muted-foreground">
                      <span className="mt-[7px] h-1 w-1 shrink-0 bg-muted-foreground/60" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
