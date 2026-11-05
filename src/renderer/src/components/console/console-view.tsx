import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Clipboard,
  ClipboardCopy,
  Keyboard,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  TerminalSquare,
  Unplug,
  X
} from 'lucide-react'
import type { ConsoleOpenRequest, ConsoleSessionInfo } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { WindowButtons } from '@renderer/components/layout/window-buttons'
import { Textarea } from '@renderer/components/ui/input'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'
import '@xterm/xterm/css/xterm.css'

type ConsolePhase = 'opening' | 'connecting' | 'connected' | 'disconnected' | 'error'

interface ConsoleViewProps {
  request: ConsoleOpenRequest
  onClose: () => void
}

function phaseLabel(phase: ConsolePhase): string {
  switch (phase) {
    case 'opening':
      return '分配会话'
    case 'connecting':
      return '连接中'
    case 'connected':
      return '已连接'
    case 'disconnected':
      return '已断开'
    case 'error':
      return '连接失败'
    default:
      return '待连接'
  }
}

function phaseBadge(phase: ConsolePhase): React.JSX.Element {
  const color =
    phase === 'connected'
      ? 'text-success'
      : phase === 'error'
        ? 'text-destructive'
        : phase === 'disconnected'
          ? 'text-muted-foreground'
          : 'text-brand'
  return <span className={cn('text-[11px] font-medium', color)}>{phaseLabel(phase)}</span>
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length
}

export function ConsoleView({ request, onClose }: ConsoleViewProps): React.JSX.Element {
  const [phase, setPhase] = useState<ConsolePhase>('opening')
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<ConsoleSessionInfo | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const [scaleViewport, setScaleViewport] = useState(true)
  const scaleViewportRef = useRef(true)
  const [clipboardOpen, setClipboardOpen] = useState(false)
  const [clipboardText, setClipboardText] = useState('')
  const [remoteClipboard, setRemoteClipboard] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const noVncRef = useRef<HTMLDivElement>(null)
  const termHostRef = useRef<HTMLDivElement>(null)
  const noVncClientRef = useRef<{ disconnect: () => void; sendCtrlAltDel: () => void; clipboardPasteFrom: (text: string) => void; scaleViewport: boolean; focus: () => void } | null>(null)
  const xtermRef = useRef<{ focus: () => void; getSelection: () => string; paste: (data: string) => void } | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)

  const retry = useCallback(() => {
    setRetryToken((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!request) return
    let cancelled = false
    let cleanupNoVnc: (() => void) | null = null
    let terminal: {
      dispose: () => void
      focus: () => void
      write: (data: string | Uint8Array) => void
      onData: (callback: (data: string) => void) => { dispose: () => void }
      onResize: (callback: (size: { cols: number; rows: number }) => void) => { dispose: () => void }
      getSelection: () => string
      cols: number
      rows: number
    } | null = null
    let fitAddon: { fit: () => void; dispose: () => void } | null = null
    let resizeObserver: ResizeObserver | null = null
    let resizeTimer: number | undefined
    let pingTimer: number | undefined
    let inputDisposable: { dispose: () => void } | null = null
    let resizeDisposable: { dispose: () => void } | null = null
    let closingIntentionally = false

    setPhase('opening')
    setError(null)
    setSession(null)
    setRemoteClipboard('')
    setClipboardOpen(false)

    const closeActiveSession = (): void => {
      const id = activeSessionIdRef.current
      activeSessionIdRef.current = null
      if (id) void window.pvevdi.consoleClose(id)
    }

    const connectNoVnc = async (nextSession: ConsoleSessionInfo): Promise<void> => {
      const target = noVncRef.current
      if (!target || cancelled) return
      target.innerHTML = ''
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      if (cancelled) return

      const module = await import('@novnc/novnc')
      if (cancelled) return
      const RFB = module.default
      const client = new RFB(target, nextSession.wsUrl, {
        credentials: { password: nextSession.vncPassword },
        shared: true,
        wsProtocols: ['binary']
      })
      noVncClientRef.current = client
      client.scaleViewport = scaleViewportRef.current
      client.resizeSession = false
      client.focusOnClick = true
      client.background = '#050608'
      client.showDotCursor = false

      const handleConnect = (): void => {
        if (cancelled) return
        setPhase('connected')
        setError(null)
        client.focus()
      }
      const handleDisconnect = (event: Event): void => {
        if (cancelled || closingIntentionally) return
        const detail = (event as CustomEvent<{ clean?: boolean }>).detail
        setPhase('disconnected')
        setError(detail?.clean === false ? 'VNC 会话被远端关闭。' : null)
      }
      const handleSecurityFailure = (event: Event): void => {
        if (cancelled) return
        const detail = (event as CustomEvent<{ reason?: string }>).detail
        setError(detail?.reason ? `VNC 安全协商失败：${detail.reason}` : 'VNC 安全协商失败。')
        setPhase('error')
      }
      const handleCredentials = (): void => {
        if (cancelled) return
        if (nextSession.vncPassword) client.sendCredentials({ password: nextSession.vncPassword })
        else setError('VNC 要求额外凭据。')
      }
      const handleClipboard = (event: Event): void => {
        const detail = (event as CustomEvent<{ text?: string }>).detail
        if (detail?.text) setRemoteClipboard(detail.text)
      }

      client.addEventListener('connect', handleConnect as never)
      client.addEventListener('disconnect', handleDisconnect as never)
      client.addEventListener('securityfailure', handleSecurityFailure as never)
      client.addEventListener('credentialsrequired', handleCredentials as never)
      client.addEventListener('clipboard', handleClipboard as never)
      cleanupNoVnc = (): void => {
        client.removeEventListener('connect', handleConnect as never)
        client.removeEventListener('disconnect', handleDisconnect as never)
        client.removeEventListener('securityfailure', handleSecurityFailure as never)
        client.removeEventListener('credentialsrequired', handleCredentials as never)
        client.removeEventListener('clipboard', handleClipboard as never)
        client.disconnect()
        target.innerHTML = ''
      }
    }

    const connectXterm = async (nextSession: ConsoleSessionInfo): Promise<void> => {
      const host = termHostRef.current
      if (!host || cancelled) return
      host.innerHTML = ''
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit')
      ])
      if (cancelled) return

      const term = new Terminal({
        allowProposedApi: true,
        allowTransparency: false,
        cursorBlink: true,
        cursorStyle: 'bar',
        fontFamily: "'JetBrains Mono Variable', 'Cascadia Code', Consolas, monospace",
        fontSize: 13,
        fontWeight: '400',
        lineHeight: 1.18,
        letterSpacing: 0,
        scrollback: 5000,
        theme: {
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
        }
      })
      terminal = term
      xtermRef.current = term
      const fit = new FitAddon()
      fitAddon = fit
      term.loadAddon(fit)
      term.open(host)
      fit.fit()
      term.focus()

      const socket = new WebSocket(nextSession.wsUrl, ['binary'])
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket
      let authenticated = false

      const sendResize = (): void => {
        if (authenticated && socket.readyState === WebSocket.OPEN) {
          socket.send(`1:${term.cols}:${term.rows}:`)
        }
      }

      const fitTerminal = (): void => {
        if (!host.isConnected) return
        try {
          fit.fit()
        } catch {
          // The element can briefly have no size while the window is laid out.
        }
      }

      socket.onopen = (): void => {
        if (cancelled) return
        setPhase('connecting')
      }
      socket.onmessage = (event): void => {
        if (cancelled) return
        const data = new Uint8Array(event.data as ArrayBuffer)
        if (!authenticated) {
          if (data[0] === 0x4f && data[1] === 0x4b) {
            authenticated = true
            setPhase('connected')
            setError(null)
            if (data.length > 2) term.write(data.subarray(2))
            requestAnimationFrame(() => {
              fitTerminal()
              term.focus()
              sendResize()
            })
          } else {
            setError('终端认证被 PVE 拒绝。')
            setPhase('error')
            socket.close()
          }
          return
        }
        term.write(data)
      }
      socket.onerror = (): void => {
        if (cancelled || closingIntentionally) return
        setError('无法连接到 PVE 终端。')
        setPhase('error')
      }
      socket.onclose = (event): void => {
        if (cancelled || closingIntentionally) return
        if (!authenticated) {
          setError(event.reason || '终端连接被关闭。')
          setPhase('error')
        } else {
          setPhase('disconnected')
        }
      }

      inputDisposable = term.onData((data) => {
        if (!authenticated || socket.readyState !== WebSocket.OPEN) return
        socket.send(`0:${utf8Length(data)}:${data}`)
      })
      resizeDisposable = term.onResize(() => sendResize())

      resizeObserver = new ResizeObserver(() => {
        if (resizeTimer) window.clearTimeout(resizeTimer)
        resizeTimer = window.setTimeout(() => {
          fitTerminal()
        }, 80)
      })
      resizeObserver.observe(host)

      pingTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('2')
      }, 30_000)

      requestAnimationFrame(() => fitTerminal())
    }

    const run = async (): Promise<void> => {
      try {
        const nextSession = await unwrap(window.pvevdi.consoleOpen(request))
        activeSessionIdRef.current = nextSession.sessionId
        if (cancelled) {
          void window.pvevdi.consoleClose(nextSession.sessionId)
          return
        }
        setSession(nextSession)
        setPhase('connecting')
        if (nextSession.mode === 'novnc') await connectNoVnc(nextSession)
        else await connectXterm(nextSession)
      } catch (err) {
        if (cancelled) return
        setError(errorDetail(err))
        setPhase('error')
      }
    }

    void run()

    return () => {
      cancelled = true
      closingIntentionally = true
      cleanupNoVnc?.()
      if (inputDisposable) inputDisposable.dispose()
      if (resizeDisposable) resizeDisposable.dispose()
      if (pingTimer) window.clearInterval(pingTimer)
      if (resizeTimer) window.clearTimeout(resizeTimer)
      if (resizeObserver) resizeObserver.disconnect()
      try {
        socketRef.current?.close()
      } catch {
        // Ignore already-closed sockets.
      }
      socketRef.current = null
      noVncClientRef.current = null
      xtermRef.current = null
      fitAddon?.dispose()
      if (terminal) {
        try {
          terminal.dispose()
        } catch {
          // Ignore a disposed terminal.
        }
      }
      if (termHostRef.current) termHostRef.current.innerHTML = ''
      if (noVncRef.current) noVncRef.current.innerHTML = ''
      closeActiveSession()
    }
  }, [request, retryToken])

  useEffect(() => {
    const onFullscreenChange = (): void => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const toggleFullscreen = async (): Promise<void> => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (contentRef.current) {
        await contentRef.current.requestFullscreen()
      }
    } catch (err) {
      toast.error('无法切换全屏', { description: errorDetail(err) })
    }
  }

  const copySelection = async (): Promise<void> => {
    const text = xtermRef.current?.getSelection() ?? ''
    if (!text) {
      toast.error('没有选中终端文本')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制终端选区')
    } catch (err) {
      toast.error('复制失败', { description: errorDetail(err) })
    }
  }

  const setScale = (value: boolean): void => {
    scaleViewportRef.current = value
    setScaleViewport(value)
    if (noVncClientRef.current) noVncClientRef.current.scaleViewport = value
  }

  const sendClipboard = (): void => {
    if (!clipboardText.trim()) return
    noVncClientRef.current?.clipboardPasteFrom(clipboardText)
    toast.success('剪贴板内容已发送到虚拟机')
    setClipboardText('')
    setClipboardOpen(false)
  }

  const isNoVnc = session?.mode === 'novnc'
  const isXterm = session?.mode === 'xterm'
  const requestedXterm = request?.kind === 'node' || request?.type === 'lxc'
  const consoleModeHint = session?.mode ?? (requestedXterm ? 'xterm' : 'novnc')

  return (
    <div
      ref={contentRef}
      data-console-root="true"
      className="flex h-screen w-screen flex-col overflow-hidden border border-border bg-[#050608] text-foreground"
    >
      <header className="drag-region flex h-10 shrink-0 items-stretch border-b border-border bg-card">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
          {consoleModeHint === 'xterm' ? (
            <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-[11px] font-medium text-foreground">
            {session?.title ?? request.name ?? '控制台'}
          </span>
          <span className="hidden truncate font-mono text-[9px] text-muted-foreground/70 lg:block">
            {session?.subtitle ?? `${request.node} · ${request.type?.toUpperCase() ?? 'NODE'} ${request.vmid ?? ''}`}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 px-3">{phaseBadge(phase)}</div>
        <WindowButtons />
      </header>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {isNoVnc && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => noVncClientRef.current?.sendCtrlAltDel()}
                disabled={phase !== 'connected'}
              >
                <Keyboard className="h-3.5 w-3.5" />
                Ctrl+Alt+Del
              </Button>
              <Button
                variant={clipboardOpen ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setClipboardOpen((value) => !value)}
                disabled={phase !== 'connected'}
              >
                <Clipboard className="h-3.5 w-3.5" />
                剪贴板
              </Button>
              <Button
                variant={scaleViewport ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setScale(!scaleViewport)}
                disabled={phase !== 'connected'}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                {scaleViewport ? '适应窗口' : '原始尺寸'}
              </Button>
            </>
          )}
          {isXterm && (
            <Button variant="outline" size="sm" onClick={() => void copySelection()} disabled={phase !== 'connected'}>
              <ClipboardCopy className="h-3.5 w-3.5" />
              复制选区
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={retry} disabled={phase === 'opening'}>
            <RefreshCw className="h-3.5 w-3.5" />
            重连
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? '退出全屏' : '全屏'}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#050608]">
          <div ref={noVncRef} className={cn('absolute inset-0', isNoVnc ? 'block' : 'hidden')} />
          <div
            ref={termHostRef}
            className={cn('absolute inset-0 overflow-hidden px-3 pt-2', isXterm ? 'block' : 'hidden')}
          />

          {phase === 'opening' || phase === 'connecting' ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#050608]/92">
              <div className="flex flex-col items-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center border border-border bg-card">
                  <Loader2 className="h-5 w-5 spin text-brand" />
                </div>
                <div className="text-center">
                  <div className="text-[12px] text-foreground">
                    {phase === 'opening' ? '正在分配控制台会话' : '正在建立 PVE 控制通道'}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {consoleModeHint === 'novnc' ? 'noVNC / RFB 003.008' : 'xterm.js / termproxy'}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {phase === 'error' || phase === 'disconnected' ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#050608]/95">
              <div className="w-[380px] max-w-[calc(100%-32px)] border border-destructive/35 bg-card p-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-destructive">
                  <Unplug className="h-3.5 w-3.5" />
                  控制台连接中断
                </div>
                <p className="mt-2 break-words text-[10px] leading-5 text-muted-foreground">
                  {error || '控制台连接已断开。'}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={retry}>
                    <RefreshCw className="h-3 w-3" />
                    重新连接
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    <X className="h-3 w-3" />
                    关闭
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {clipboardOpen && isNoVnc && (
            <div className="absolute bottom-4 right-4 z-20 w-[330px] border border-border-strong bg-card shadow-[0_18px_60px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-2 text-[10px] font-medium text-foreground">
                  <Clipboard className="h-3 w-3 text-brand" />
                  发送剪贴板到虚拟机
                </div>
                <button
                  type="button"
                  onClick={() => setClipboardOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="关闭剪贴板面板"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-2 p-3">
                <Textarea
                  value={clipboardText}
                  onChange={(event) => setClipboardText(event.target.value)}
                  placeholder="在此粘贴或输入要发送到客户机的文本…"
                  className="h-28 resize-none font-mono text-[10px]"
                  autoFocus
                />
                {remoteClipboard && (
                  <div className="max-h-16 overflow-auto border border-border bg-background p-2 font-mono text-[10px] leading-4 text-muted-foreground">
                    <div className="mb-1 text-[9px] text-muted-foreground">来自客户机</div>
                    {remoteClipboard}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setClipboardOpen(false)}>
                    取消
                  </Button>
                  <Button size="sm" onClick={sendClipboard} disabled={!clipboardText.trim()}>
                    发送
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-3 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span>本地回环桥 / {session?.mode === 'novnc' ? 'RFB' : 'termproxy'}</span>
          </span>
          <span className="flex items-center gap-2">
            {session?.username && <span>{session.username}</span>}
            <span className="h-2.5 w-px bg-border" />
            <span>{phase === 'connected' ? '会话活跃' : phaseLabel(phase)}</span>
          </span>
        </div>
      </div>
  )
}
