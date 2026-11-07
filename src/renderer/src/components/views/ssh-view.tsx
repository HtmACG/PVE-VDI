import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Cloud, Eye, EyeOff, FolderTree, KeyRound, Loader2, PanelRightClose, PanelRightOpen, Plus, ShieldCheck, TerminalSquare, X } from 'lucide-react'
import type { SshShellSession, SshTargetOverride, Theme, VmTerminalTarget } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { XTERM_THEMES, currentTheme } from '@renderer/components/console/terminal-theme'
import { SftpPanel } from '@renderer/components/console/sftp-panel'
import '@xterm/xterm/css/xterm.css'

/**
 * 多标签 SSH 终端。
 *
 * 每个标签对应主进程里的一条 PTY。xterm 实例按 sessionId 缓存并常驻，
 * 切标签只是显隐 DOM——销毁重建会丢滚动历史和当前行，这是不能接受的。
 */

interface Tab {
  session: SshShellSession
  /** 用于 CSS 显隐，不参与渲染内容 */
  key: string
}

type Phase = 'opening' | 'ready' | 'closed' | 'error'

interface SshViewProps {
  /** 打开窗口时预置几个标签（1~6） */
  initialTabs?: number
  /** 连接参数覆盖；不传就用 PVE 的地址与账号 */
  override?: SshTargetOverride
  /** 节点 Shell：SSH 不可用时按节点名回退到 PVE termproxy */
  node?: string
  /** 打开了某台虚拟机的控制台时，新标签接串口 / pty 而不是登录 shell */
  vm?: VmTerminalTarget
}

export function SshView({ initialTabs = 1, override, node, vm }: SshViewProps = {}): React.JSX.Element {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Record<string, Phase>>({})
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [showFiles, setShowFiles] = useState(true)
  const [theme, setTheme] = useState<Theme>(currentTheme)
  /** 用户在窗口里填写的客户机 SSH 凭据（只存在渲染进程内存） */
  const [guestAuth, setGuestAuth] = useState<SshTargetOverride | undefined>(undefined)
  const [authOpen, setAuthOpen] = useState(false)
  const [authForm, setAuthForm] = useState({ host: '', port: '22', username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)

  // sessionId → { term, fit, host }
  const termsRef = useRef<
    Map<string, { term: import('@xterm/xterm').Terminal; fit: import('@xterm/addon-fit').FitAddon; host: HTMLDivElement }>
  >(new Map())
  const openedRef = useRef(false)

  /**
   * 文件面板的目标。
   *
   * 只允许连虚拟机自己的 sshd。虚拟机终端走串口 / pty 时没有客户机 SSH，
   * 这时直接隐藏文件面板——绝不能悄悄退回 PVE 宿主机，让人误以为在看虚拟机文件。
   */
  const guestTarget = useMemo<SshTargetOverride | undefined>(() => {
    const host = guestAuth?.host?.trim() || vm?.guestHost
    if (!host) return undefined
    const isWindows = /^win/i.test(vm?.ostype ?? '')
    return {
      host,
      port: guestAuth?.port ?? vm?.guestPort ?? 22,
      username: guestAuth?.username?.trim() || vm?.guestUser || (isWindows ? 'Administrator' : 'root'),
      password: guestAuth?.password
    }
  }, [guestAuth, vm?.guestHost, vm?.guestPort, vm?.guestUser, vm?.ostype])

  const isVmConsole = Boolean(vm?.node)
  const activeSession = tabs.find((tab) => tab.session.sessionId === activeId)?.session
  /** 节点 SSH 窗口可以浏览节点文件；PVE 通道回退时没有 SFTP，虚拟机窗口只接受客户机 SSH */
  /**
   * 节点窗口只有确认走 SSH 后才挂文件面板：
   * 否则面板会在终端回退到 PVE 通道之前先发一次 SFTP 请求，
   * 同一个「SSH 密码不正确」会弹两遍（终端一次、文件面板一次）。
   */
  const filesAvailable = isVmConsole
    ? activeSession?.transport === 'guest-ssh' && Boolean(guestTarget?.host)
    : activeSession?.transport === 'ssh'

  const openAuthDialog = useCallback((): void => {
    const isWindows = /^win/i.test(vm?.ostype ?? '')
    setAuthForm({
      host: guestTarget?.host ?? vm?.guestHost ?? '',
      port: String(guestTarget?.port ?? vm?.guestPort ?? 22),
      username: guestTarget?.username ?? vm?.guestUser ?? (isWindows ? 'Administrator' : 'root'),
      password: ''
    })
    setShowPassword(false)
    setAuthOpen(true)
  }, [guestTarget, vm?.guestHost, vm?.guestPort, vm?.guestUser, vm?.ostype])

  // 主题跟随
  useEffect(() => {
    const root = document.documentElement
    const sync = (): void => setTheme(currentTheme())
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    for (const entry of termsRef.current.values()) {
      entry.term.options.theme = XTERM_THEMES[theme]
    }
  }, [theme])

  /** 建 xterm 实例并挂到自己的容器上 */
  const createTerminal = useCallback(
    async (session: SshShellSession, host: HTMLDivElement) => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
      const term = new Terminal({
        fontFamily: 'JetBrains Mono Variable, Consolas, monospace',
        fontSize: 12.5,
        lineHeight: 1.5,
        cursorBlink: true,
        scrollback: 6000,
        allowProposedApi: true,
        theme: XTERM_THEMES[currentTheme()]
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(host)
      requestAnimationFrame(() => {
        try {
          fit.fit()
          void window.pvevdi.sshShellResize(session.sessionId, term.cols, term.rows)
        } catch {
          /* 容器还没挂载，等 ResizeObserver 再试 */
        }
      })

      term.onData((data) => {
        void window.pvevdi.sshShellWrite(session.sessionId, data)
      })

      termsRef.current.set(session.sessionId, { term, fit, host })
      return term
    },
    []
  )

  /** 新开一个标签；auth 用于「填写客户机凭据后立即重连」 */
  const openTab = useCallback(
    async (auth?: SshTargetOverride) => {
      const guestHost = auth?.host?.trim() || guestAuth?.host?.trim() || vm?.guestHost
      if (vm?.type === 'qemu' && !guestHost) {
        openAuthDialog()
        return
      }
      setOpening(true)
      setError(null)
      try {
        // 先按一个保守尺寸建会话，挂上后再 fit 到实际大小
        const result = await window.pvevdi.sshShellOpen({
          override,
          node,
          guest: auth ?? guestAuth,
          vm,
          cols: 120,
          rows: 32
        })
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        const session = result.data
        setTabs((current) => [...current, { session, key: session.sessionId }])
        setActiveId(session.sessionId)
        setPhase((current) => ({ ...current, [session.sessionId]: 'ready' }))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
      setOpening(false)
    }
  }, [override, node, vm, guestAuth, openAuthDialog])

  // 首次进入按 bootstrap 指定的数量开标签；QEMU 没探测到 IP 时先弹凭据窗口
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    if (vm?.type === 'qemu' && !vm.guestHost) {
      openAuthDialog()
      return
    }
    const count = Math.min(6, Math.max(1, Math.floor(initialTabs) || 1))
    void (async () => {
      for (let index = 0; index < count; index += 1) {
        await openTab()
      }
    })()
  }, [openTab, initialTabs, vm, openAuthDialog])

  // 订阅会话输出
  useEffect(() => {
    const dispose = window.pvevdi.onSshShellEvent((event) => {
      const entry = termsRef.current.get(event.sessionId)
      if (!entry) return
      try {
        if (event.type === 'data') {
          entry.term.write(event.data)
        } else if (event.type === 'exit') {
          entry.term.write('\r\n\x1b[33m[连接已断开]\x1b[0m\r\n')
          setPhase((current) => ({ ...current, [event.sessionId]: 'closed' }))
        }
      } catch (error) {
        // 终端已销毁或写入异常：只丢这一条数据，别让渲染进程崩
        console.error('xterm.js 写入失败', error)
      }
    })
    return dispose
  }, [])

  const closeTab = useCallback((sessionId: string) => {
    const entry = termsRef.current.get(sessionId)
    // 先从索引里摘掉，再 dispose：xterm 销毁时可能同步触发 ResizeObserver，
    // 回调里必须找不到这条会话，避免对已销毁的 Terminal 调 fit()。
    termsRef.current.delete(sessionId)
    entry?.term.dispose()
    void window.pvevdi.sshShellClose(sessionId)
    setTabs((current) => {
      const next = current.filter((tab) => tab.session.sessionId !== sessionId)
      setActiveId((active) => (active === sessionId ? (next[next.length - 1]?.session.sessionId ?? null) : active))
      return next
    })
    setPhase((current) => {
      const next = { ...current }
      delete next[sessionId]
      return next
    })
  }, [])

  // 关闭视图时清掉所有会话，避免主进程里留死连接
  useEffect(() => {
    const terms = termsRef.current
    return () => {
      for (const [sessionId, entry] of terms) {
        terms.delete(sessionId)
        try {
          entry.term.dispose()
        } catch {
          /* 已销毁 */
        }
        void window.pvevdi.sshShellClose(sessionId)
      }
    }
  }, [])

  const active = tabs.find((tab) => tab.session.sessionId === activeId) ?? null

  const saveAuth = (): void => {
    const host = authForm.host.trim()
    if (!host) {
      setError('请填写客户机 SSH 主机地址。')
      return
    }
    const port = Number(authForm.port) || 22
    const next: SshTargetOverride = {
      host,
      port,
      username: authForm.username.trim() || undefined,
      password: authForm.password || undefined
    }
    setGuestAuth(next)
    setAuthOpen(false)
    void openTab(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* 标签栏：参考截图形态——扁平标签，选中项白底 + 底部黑色下划线 */}
      <div className="flex shrink-0 items-stretch border-b border-border bg-panel/50">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {tabs.map((tab) => {
            const phaseState = phase[tab.session.sessionId] ?? 'opening'
            const isActive = tab.session.sessionId === activeId
            const dotClass =
              phaseState === 'ready'
                ? 'bg-success'
                : phaseState === 'closed'
                  ? 'bg-border-strong'
                  : phaseState === 'error'
                    ? 'bg-destructive'
                    : 'bg-warning'
            return (
              <div
                key={tab.key}
                className={cn(
                  'group relative flex shrink-0 items-center gap-1.5 border-r border-border/70 pl-2 pr-1 transition-colors',
                  isActive
                    ? 'bg-card text-foreground'
                    : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
                )}
              >
                {/* 选中态：底部 2px 下划线 */}
                <span
                  className={cn(
                    'pointer-events-none absolute inset-x-0 bottom-0 h-[2px] transition-colors',
                    isActive ? 'bg-foreground' : 'bg-transparent'
                  )}
                />
                <button
                  type="button"
                  onClick={() => closeTab(tab.session.sessionId)}
                  className={cn(
                    'rounded p-[2px] text-muted-foreground transition-colors hover:bg-panel hover:text-foreground',
                    isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70'
                  )}
                  title="关闭标签"
                >
                  <X className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveId(tab.session.sessionId)}
                  className="flex h-9 items-center gap-1.5 pr-2"
                  title={tab.session.title}
                >
                  <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="max-w-[160px] truncate text-[12px]">{tab.session.title}</span>
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />
                </button>
              </div>
            )
          })}
          <div className="flex shrink-0 items-center px-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void openTab()}
              disabled={opening}
              title="新建 SSH 标签"
            >
              {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border/70 px-1">
          {vm && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={openAuthDialog}
              title="客户机 SSH 账号密码"
              aria-label="客户机 SSH 账号密码"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
          )}
          {filesAvailable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowFiles((value) => !value)}
              title={showFiles ? '收起文件面板' : '展开文件面板'}
            >
              {showFiles ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/8 px-3 py-2 text-[11.5px] text-destructive">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          {vm && (
            <button
              type="button"
              onClick={openAuthDialog}
              className="shrink-0 underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              填写 SSH 凭据
            </button>
          )}
          <button type="button" onClick={() => setError(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/*
        分隔线由这一层统一画：
        原来终端区和文件面板各自是 flex 兄弟，文件面板底栏的 border-t 只盖住自己那 340px，
        终端下方就是一片空白，看起来像「分割线断了一截」。
        改成外层 border-b，两个子区域都不画底边，线才是一条完整的横线。
      */}
      <div className="flex min-h-0 flex-1 border-b border-border">
        <div className="relative min-w-0 flex-1 bg-[#050608]">
          {tabs.length === 0 ? (
            <EmptyTerminals opening={opening} isVm={isVmConsole} onOpen={() => void openTab()} />
          ) : (
            tabs.map((tab) => (
              <TerminalSlot
                key={tab.key}
                session={tab.session}
                active={tab.session.sessionId === activeId}
                theme={theme}
                createTerminal={createTerminal}
                termsRef={termsRef}
              />
            ))
          )}
        </div>

        {showFiles && filesAvailable && (
          <div className="hidden w-[340px] shrink-0 border-l border-border bg-card lg:block">
            <SftpPanel className="h-full" guest={guestTarget} />
          </div>
        )}
      </div>

      {/* 底部状态条：会话信息 + 提示（上边线已由上一层统一画，这里不再重复 border-t） */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-1 font-mono text-[10.5px] text-muted-foreground">
        <span className="truncate">
          {active ? `${active.session.username}@${active.session.host}` : '未连接'} · xterm.js
        </span>
        <span className="flex items-center gap-2">
          <FolderTree className="h-3 w-3" />
          {tabs.length} 个会话
          {/* 文件面板跟终端可能不是一台机器：终端可能是串口，面板却连的是客户机 */}
          {/* 文件面板只连虚拟机内部；串口 / pty 终端没有客户机 SSH 时直接标明不可用 */}
          {isVmConsole ? (
            guestTarget?.host && active?.session.transport === 'guest-ssh' ? (
              <span data-files-source="guest" className="rounded bg-success/10 px-1 text-success">
                文件：{guestTarget.username}@{guestTarget.host}
              </span>
            ) : (
              <span
                data-files-source="unavailable"
                title={
                  vm?.type === 'lxc'
                    ? '容器终端暂不提供文件面板，避免把 PVE 宿主机的目录当成容器内部'
                    : '当前终端走串口 / pty，无法访问虚拟机文件系统；在客户机开启 SSH 后可浏览虚拟机内部文件'
                }
                className="rounded px-1 text-muted-foreground/70"
              >
                文件：不可用（{vm?.type === 'lxc' ? '容器终端' : '需客户机 SSH'}）
              </span>
            )
          ) : active?.session.transport === 'termproxy' ? (
            <span
              data-files-source="unavailable"
              title="节点 SSH 不可用，当前走 PVE termproxy 通道，不支持 SFTP 文件管理"
              className="rounded px-1 text-muted-foreground/70"
            >
              文件：PVE 通道不支持
            </span>
          ) : (
            <span data-files-source="node" className="rounded px-1 text-muted-foreground/70">
              文件：节点宿主机
            </span>
          )}
        </span>
      </div>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-w-[560px] p-0">
          <div className="border-b border-border bg-panel/40 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-brand/40 bg-brand/10">
                <ShieldCheck className="h-4 w-4 text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[14px]">客户机 SSH 凭据</DialogTitle>
                <DialogDescription className="mt-1 text-[11.5px] leading-5">
                  QEMU 串口控制台已取消，终端统一通过虚拟机内部的 sshd 登录。
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div>
              <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-muted-foreground">
                连接目标
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                <Input
                  value={authForm.host}
                  onChange={(event) => setAuthForm((form) => ({ ...form, host: event.target.value }))}
                  placeholder="10.10.12.204"
                  className="font-mono"
                  aria-label="客户机 SSH 主机"
                  autoFocus
                />
                <Input
                  value={authForm.port}
                  onChange={(event) => setAuthForm((form) => ({ ...form, port: event.target.value }))}
                  inputMode="numeric"
                  className="font-mono"
                  aria-label="客户机 SSH 端口"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-muted-foreground">
                登录凭据
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={authForm.username}
                  onChange={(event) => setAuthForm((form) => ({ ...form, username: event.target.value }))}
                  placeholder="root / Administrator"
                  className="font-mono"
                  aria-label="客户机 SSH 账号"
                />
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={authForm.password}
                    onChange={(event) => setAuthForm((form) => ({ ...form, password: event.target.value }))}
                    placeholder="密码"
                    className="pr-9 font-mono"
                    aria-label="客户机 SSH 密码"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="mt-1.5 text-[10.5px] text-muted-foreground">
                密码留空时，依次尝试本应用缓存的 cloud-init 密码、PVE 登录密码。
              </div>
            </div>

            <div className="flex items-start gap-2.5 border border-border bg-panel/35 px-3 py-2.5">
              <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">
                {vm?.guestUser ? (
                  <>
                    cloud-init 用户：<span className="font-mono text-foreground">{vm.guestUser}</span>。
                    PVE API 不会返回 cipassword，密码需要手填或使用应用内缓存。
                  </>
                ) : (
                  '没有从 cloud-init 配置读到 ciuser；如果 VM 使用 cloud-init，可在 PVE 里填写 ciuser 后重开终端。'
                )}
              </div>
              {vm?.guestUser && (
                <button
                  type="button"
                  onClick={() => setAuthForm((form) => ({ ...form, username: vm.guestUser ?? form.username }))}
                  className="shrink-0 text-[10.5px] text-brand underline underline-offset-2 hover:opacity-80"
                >
                  填入账号
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border bg-panel/30 px-5 py-3">
            <span className="mr-auto text-[10px] text-muted-foreground">密码只保存在当前窗口内存</span>
            <Button variant="outline" size="sm" onClick={() => setAuthOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={saveAuth}>
              保存并连接
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** 单个终端容器：常驻 DOM，靠显隐切换，保留滚动历史 */
function TerminalSlot({
  session,
  active,
  theme,
  createTerminal,
  termsRef
}: {
  session: SshShellSession
  active: boolean
  theme: Theme
  createTerminal: (session: SshShellSession, host: HTMLDivElement) => Promise<unknown>
  termsRef: React.RefObject<
    Map<string, { term: import('@xterm/xterm').Terminal; fit: import('@xterm/addon-fit').FitAddon; host: HTMLDivElement }>
  >
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const lastFit = useRef({ width: 0, height: 0 })

  /**
   * 只在宿主尺寸真的变化时才 fit。
   * ResizeObserver 会被 xterm 自身的布局变化触发，如果每次都同步 fit，
   * 在部分 Windows/VDI 环境里会形成 measure ↔ fit 反馈环，把渲染进程卡死。
   */
  const fitNow = useCallback((): void => {
    const host = hostRef.current
    const entry = termsRef.current?.get(session.sessionId)
    if (!host || !entry) return
    const width = host.clientWidth
    const height = host.clientHeight
    if (width < 20 || height < 20) return
    const last = lastFit.current
    if (last.width === width && last.height === height) return
    try {
      // 先算目标行列数：没有任何变化就不调用 fit()。
      // fit() 会改 xterm 内部布局，可能再次触发 ResizeObserver；
      // 用 proposeDimensions 做闸门可以从根上断掉 measure ↔ fit 反馈环。
      const proposed = entry.fit.proposeDimensions()
      if (!proposed) return
      if (proposed.cols === entry.term.cols && proposed.rows === entry.term.rows) {
        lastFit.current = { width, height }
        return
      }
      entry.fit.fit()
      lastFit.current = { width, height }
      void window.pvevdi.sshShellResize(session.sessionId, entry.term.cols, entry.term.rows)
    } catch {
      /* 容器尺寸为 0 时 fit 会抛，忽略 */
    }
  }, [session.sessionId, termsRef])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let frame = 0
    void createTerminal(session, host)
      .then((term) => {
        if (disposed) {
          ;(term as { dispose?: () => void } | undefined)?.dispose?.()
          return
        }
        setReady(true)
        fitNow()
      })
      .catch((error) => {
        // 初始化失败（资源加载 / 容器异常）只影响这一个标签，不能让渲染进程崩
        console.error('xterm.js 初始化失败', error)
      })

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fitNow)
    })
    observer.observe(host)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [createTerminal, fitNow, session])

  // 切到这个标签时重新适配尺寸（隐藏期间容器是 0×0，尺寸是错的）
  useEffect(() => {
    if (!active || !ready) return
    const frame = requestAnimationFrame(() => {
      fitNow()
      const entry = termsRef.current?.get(session.sessionId)
      entry?.term.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [active, ready, session.sessionId, termsRef, fitNow])

  useEffect(() => {
    const entry = termsRef.current?.get(session.sessionId)
    if (entry) entry.term.options.theme = XTERM_THEMES[theme]
  }, [theme, session.sessionId, termsRef])

  return (
    <div
      ref={hostRef}
      className={cn('absolute inset-0 px-2.5 py-2', active ? 'block' : 'hidden')}
      style={{ background: XTERM_THEMES[theme].background }}
    />
  )
}

function EmptyTerminals({
  opening,
  isVm,
  onOpen
}: {
  opening: boolean
  isVm?: boolean
  onOpen: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <TerminalSquare className="h-7 w-7 text-muted-foreground/50" />
      <div>
        <div className="text-[13px] text-foreground">
          {isVm ? '还没有虚拟机 SSH 会话' : '还没有 SSH 会话'}
        </div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">
          {isVm ? '填写客户机 IP 与账号密码即可登录' : '用 PVE 节点的账号密码直连 shell'}
        </div>
      </div>
      <Button size="sm" onClick={onOpen} disabled={opening}>
        {opening ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        {isVm ? '填写 SSH 凭据' : '新建会话'}
      </Button>
    </div>
  )
}
