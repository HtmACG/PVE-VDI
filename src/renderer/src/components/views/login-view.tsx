import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, ShieldAlert, ShieldCheck, WifiOff } from 'lucide-react'
import type { ApiError, AppSettings, LoginResult } from '@shared/types'
import { BrandLockup } from '@renderer/components/brand'
import { WindowButtons } from '@renderer/components/layout/window-buttons'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { ClientApiError, errorDetail, unwrap } from '@renderer/lib/api'
import loginIllustration from '@renderer/assets/login-illustration.webp'

interface LoginViewProps {
  settings: AppSettings
  appVersion?: string
  initialError?: ApiError
  loginBackground?: string
  onAuthenticated: (result: LoginResult) => void
}

export function LoginView({ settings, appVersion, initialError, loginBackground, onAuthenticated }: LoginViewProps): React.JSX.Element {
  const [serverUrl, setServerUrl] = useState(settings.serverUrl)
  const [username, setUsername] = useState(settings.username)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(settings.rememberPassword)
  const [allowSelfSigned, setAllowSelfSigned] = useState(settings.allowSelfSigned)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    initialError ? [initialError.message, initialError.detail].filter(Boolean).join(' · ') : null
  )
  const [detail, setDetail] = useState<string | null>(
    initialError?.detail && initialError.detail !== initialError.message ? initialError.detail : null
  )

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    setDetail(null)
    try {
      const result = await unwrap(
        window.pvevdi.login({
          serverUrl,
          username,
          password,
          rememberPassword: remember,
          allowSelfSigned
        })
      )
      onAuthenticated(result)
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError(err.message)
        setDetail(err.detail ?? null)
      } else {
        setError(errorDetail(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-border pl-4">
        <div className="flex items-center gap-3">
          <BrandLockup compact />
          <span className="h-3 w-px bg-border" />
          <span className="text-[11px] text-muted-foreground">Proxmox VE 运维控制台</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-muted-foreground sm:block">未连接</span>
          <WindowButtons className="border-l-0" closeHint="收起到托盘（后台继续运行）" />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="relative hidden min-w-0 overflow-hidden border-r border-border bg-card lg:flex">
          <div className="absolute left-0 top-0 z-10 h-full w-[3px] bg-brand" />
          {loginBackground ? (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url("${loginBackground}")` }}
              />
              <div className="absolute inset-0 bg-black/45" />
            </>
          ) : (
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] overflow-hidden xl:block">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_62%_45%,rgba(115,158,255,0.13),transparent_66%)]" />
              <img
                src={loginIllustration}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute bottom-0 right-0 h-[94%] w-full object-contain object-bottom opacity-95 [mask-image:linear-gradient(to_right,transparent,black_22%,black_100%)]"
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-card via-card/70 to-transparent" />
            </div>
          )}
          <div className="relative z-10 flex w-full flex-col p-10 pl-14 xl:p-14 xl:pl-16">
            <div className="mt-auto max-w-[360px]">
              <p
                className={
                  loginBackground
                    ? 'mt-2 text-[20px] leading-7 tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.45)]'
                    : 'mt-2 text-[20px] leading-7 tracking-[-0.02em] text-foreground'
                }
              >
                节点、虚拟机
                <br />
                与独立控制台。
              </p>
              <p
                className={
                  loginBackground
                    ? 'mt-3 max-w-[300px] text-[12px] leading-5 text-white/75 [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]'
                    : 'mt-3 max-w-[300px] text-[12px] leading-5 text-muted-foreground'
                }
              >
                连接集群后查看资源、管理虚拟机，并为每台虚拟机或节点打开独立控制台窗口。
              </p>
            </div>
            <div
              className={
                loginBackground
                  ? 'mt-8 flex items-center justify-between border-t border-white/20 pt-4 text-[11px] text-white/60'
                  : 'mt-8 flex items-center justify-between border-t border-border pt-4 text-[11px] text-muted-foreground'
              }
            >
              <span>PVE VDI{appVersion ? ` ${appVersion}` : ''}</span>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 w-full flex-col justify-center overflow-y-auto bg-background px-8 py-10 xl:px-12">
          <div className="mx-auto w-full max-w-[360px]">
            <div className="mb-8">
              <h2 className="text-[24px] font-semibold tracking-[-0.025em] text-foreground">连接集群</h2>
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                输入 PVE 账户信息登录；密码默认不会写入磁盘。
              </p>
            </div>

            {error && (
              <div className="mb-5 border border-destructive/35 bg-destructive/[0.06] p-3">
                <div className="flex items-start gap-2">
                  <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-destructive">连接失败</div>
                    <div className="mt-1 break-words text-[12px] leading-5 text-destructive/90">{error}</div>
                    {detail && (
                      <div className="mt-1 break-words font-mono text-[11px] leading-4 text-destructive/70">{detail}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="server-url">PVE 地址</Label>
                <Input
                  id="server-url"
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                  placeholder="https://pve.example.com:8006"
                  autoComplete="url"
                  spellCheck={false}
                  className="h-9 font-mono text-[12px]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="root@pam"
                  autoComplete="username"
                  spellCheck={false}
                  className="h-9 font-mono text-[12px]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="输入 PVE 账户密码"
                    autoComplete="current-password"
                    autoFocus
                    className="h-9 pr-9 font-mono text-[12px]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-3 border-y border-border py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[12px] text-foreground">记住凭据</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">使用 Windows DPAPI 加密保存</div>
                  </div>
                  <Switch
                    checked={remember}
                    onCheckedChange={setRemember}
                    disabled={!settings.credentialStorageAvailable}
                    aria-label="记住凭据"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-[12px] text-foreground">
                      允许自签名证书
                      <ShieldAlert className="h-3 w-3 text-warning" />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">PVE 默认证书由本地 CA 签发</div>
                  </div>
                  <Switch
                    checked={allowSelfSigned}
                    onCheckedChange={setAllowSelfSigned}
                    aria-label="允许自签名证书"
                  />
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full justify-between" loading={loading}>
                <span>{loading ? '正在验证凭据…' : '建立连接'}</span>
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>

            <div className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>登录票据只保存在本机内存，不会暴露给页面。</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
