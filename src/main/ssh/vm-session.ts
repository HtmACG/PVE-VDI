import { randomUUID } from 'node:crypto'
import type { Agent } from 'node:https'
import { WebSocket, type RawData } from 'ws'
import type { SshShellEvent } from '@shared/types'
import type { SshPool, SshTarget } from './client'
import { resolveSshTarget, type SshTargetInput } from './resolve'
import type { PveManager } from '../pve/service'

/**
 * PVE termproxy WebSocket 的 TLS / 认证参数。
 * 自签名证书必须把 API 客户端用的 https.Agent 传进来，否则 wss 握手直接失败。
 */
export interface ConsoleTlsOptions {
  rejectUnauthorized?: boolean
  agent?: Agent
  cookie?: string
}

/**
 * 虚拟机控制台会话（xterm.js）。
 *
 * 三种后端，统一对外冒成一条“终端会话”：
 *   1. PVE termproxy / ttyd —— 走 PVE 自己的 vncwebsocket 打隧道，帧格式见下方 decode。
 *   2. QEMU 串口 —— 节点上 `qm terminal`（SSH exec + pty）。
 *   3. 客户机 SSH —— 装了 sshd 的虚拟机（尤其 Windows + Win32-OpenSSH）直连；
 *      文件面板也跟着走这条，看的才是虚拟机里的文件。
 *
 * 后端判定顺序由调用方给（`VmBackend`），这里只负责把它跑成会话。
 */

export type VmBackend = 'termproxy' | 'serial' | 'guest-ssh'

export interface VmSessionRequest {
  node: string
  vmid: number
  type: 'qemu' | 'lxc'
  name?: string
  cols: number
  rows: number
  /** PVE 侧 ticket 换出来的 ws 地址（termproxy 后端用） */
  wsUrl?: string
  /** termproxy 认证用的 PVE 用户名与 ticket */
  user?: string
  ticket?: string
  /** 仅 qemu 串口后端用：节点上的 `qm terminal <vmid>` */
  nodeTarget?: SshTarget
  /** 仅客户机 SSH 后端用 */
  guestTarget?: SshTarget
  /** termproxy WebSocket 的 TLS 参数（自签名证书、Cookie） */
  tls?: ConsoleTlsOptions
  /** 覆盖会话标题（节点 Shell / 串口回退时用） */
  title?: string
  /**
   * 认证通过后在 PVE 通道里执行的命令。
   * QEMU 串口没有独立 termproxy，只能先开节点 Shell 再跑 `qm terminal <vmid>`。
   */
  command?: string
  backend: VmBackend
}

export interface VmSessionInfo {
  sessionId: string
  host: string
  username: string
  title: string
  cols: number
  rows: number
  backend: VmBackend
}

type Emit = (event: SshShellEvent) => void

interface VmHandle {
  session: VmSessionInfo
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
}

/**
 * PVE termproxy 的 WebSocket 帧协议（PVE 源码 novnc 的 termproxy 客户端同款）：
 *   上游 → 客户端：认证成功后先回 "OK"（2 字节），其后是裸 PTY 字节流。
 *   客户端 → 上游：`0:<字节长度>:<数据>` 写输入；`1:<列>:<行>:` 调窗口；`2` 心跳。
 *
 * 关键在**认证成功后必须把 "OK" 从流里剥掉**。如果直接把整段塞给 xterm，
 * 屏幕上会先出现一个多余的 "OK"，更糟的是若认证回包与首批数据同包到达，
 * 剥错一位就会把后续输入写坏。
 */
class TermProxyBridge {
  private socket: WebSocket | null = null
  private authed = false
  private buffer: Buffer = Buffer.alloc(0)
  private closed = false
  private heartbeat: NodeJS.Timeout | null = null
  private errored = false
  /** 认证完成前排队的输入 */
  private pending: string[] = []

  constructor(private readonly options: {
    wsUrl: string
    user: string
    ticket: string
    emit: Emit
    sessionId: string
    onClose: () => void
    tls?: ConsoleTlsOptions
  }) {}

  open(): void {
    const { wsUrl, user, ticket, emit, sessionId, tls } = this.options
    /**
     * 必须用 ws + 显式 TLS agent，不能用渲染进程/Node 的全局 WebSocket：
     * PVE 默认自签名证书，全局 WebSocket 不接受自定义 CA/agent，
     * 握手会直接失败，表现为「PVE 隧道握手失败」。
     */
    const socket = new WebSocket(wsUrl, ['binary'], {
      rejectUnauthorized: tls?.rejectUnauthorized !== false,
      ...(tls?.agent ? { agent: tls.agent } : {}),
      headers: {
        ...(tls?.cookie ? { Cookie: tls.cookie } : {}),
        'User-Agent': 'PVE-VDI/1.8'
      },
      perMessageDeflate: false
    })
    this.socket = socket

    socket.on('open', () => {
      // 认证串必须是 "{user}:{ticket}\n"，PVE 用 user 里的 realm 校验 ticket 归属
      socket.send(`${user}:${ticket}\n`)
      // termproxy 需要应用层心跳；不发的话空闲一段时间会被 PVE 断开
      this.heartbeat = setInterval(() => {
        if (this.closed || socket.readyState !== WebSocket.OPEN) return
        try {
          socket.send('2')
        } catch {
          /* 正在关闭的瞬间可能抛，忽略即可 */
        }
      }, 30_000)
    })

    socket.on('message', (data) => {
      if (this.closed) return
      const chunk = toBuffer(data)
      if (!chunk.length) return

      if (!this.authed) {
        this.buffer = Buffer.concat([this.buffer, chunk])
        // 至少要等到能判出前两个字节
        if (this.buffer.length < 2) return
        const head = this.buffer.subarray(0, 2).toString('latin1')
        if (head !== 'OK') {
          // 认证失败时 PVE 回的是错误文本，原样吐给用户看
          emit({ type: 'data', sessionId, data: `\r\n\x1b[31m${clean(this.buffer.toString('utf8'))}\x1b[0m\r\n` })
          this.buffer = Buffer.alloc(0)
          return
        }
        this.authed = true
        const rest = this.buffer.subarray(2)
        this.buffer = Buffer.alloc(0)
        if (rest.length) emit({ type: 'data', sessionId, data: rest.toString('utf8') })
        // 认证前排队的命令（例如串口回退的 `qm terminal`）现在补发
        if (this.pending.length) {
          const pending = this.pending
          this.pending = []
          for (const item of pending) this.write(item)
        }
        return
      }

      emit({ type: 'data', sessionId, data: chunk.toString('utf8') })
    })

    socket.on('error', (error) => {
      this.clearHeartbeat()
      if (this.closed || this.errored) return
      this.errored = true
      emit({
        type: 'data',
        sessionId,
        data: `\r\n\x1b[31m[无法连接虚拟机控制台：${describeTunnelError(error)}]\x1b[0m\r\n`
      })
    })

    socket.on('close', () => {
      this.clearHeartbeat()
      if (this.closed) return
      this.closed = true
      this.options.onClose()
    })
  }

  /** 认证完成后发送；已认证则立即发送（串口回退的 qm terminal 用） */
  sendOnReady(data: string): void {
    if (this.authed) this.write(data)
    else this.pending.push(data)
  }

  write(data: string): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    // 长度按 UTF-8 字节算，中文输入才不会串位
    const bytes = Buffer.byteLength(data, 'utf8')
    try {
      socket.send(`0:${bytes}:${data}`)
    } catch {
      /* 关闭竞态，忽略 */
    }
  }

  resize(cols: number, rows: number): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    try {
      socket.send(`1:${Math.max(20, cols)}:${Math.max(5, rows)}:`)
    } catch {
      /* 关闭竞态，忽略 */
    }
  }

  close(): void {
    this.closed = true
    this.clearHeartbeat()
    try {
      this.socket?.close()
    } catch {
      /* 已经断开 */
    }
  }

  private clearHeartbeat(): void {
    if (!this.heartbeat) return
    clearInterval(this.heartbeat)
    this.heartbeat = null
  }
}

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[])
  if (typeof data === 'string') return Buffer.from(data, 'utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  return Buffer.alloc(0)
}

/** 把 WebSocket / TLS 的英文报错翻成可操作的中文 */
function describeTunnelError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/self[-\s]?signed|unable to verify|CERT_|certificate/i.test(message)) {
    return '证书校验失败；若 PVE 使用自签名证书，请在登录页勾选「允许自签名证书」后重新登录'
  }
  if (/\b(401|403)\b/.test(message)) return '控制台票据被拒绝（401/403），请重新登录后再试'
  if (/\b404\b/.test(message)) return 'PVE 没有返回控制台接口（404）'
  if (/ECONNREFUSED/i.test(message)) return 'PVE 拒绝连接'
  if (/ETIMEDOUT|timeout/i.test(message)) return '连接 PVE 超时'
  return message ? message.slice(0, 120) : 'PVE 隧道握手失败'
}

function clean(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f]+/g, '').trim() || '虚拟机控制台认证失败'
}

export class VmSessionManager {
  private readonly handles = new Map<string, VmHandle>()
  private readonly listeners = new Set<Emit>()

  constructor(private readonly pool: SshPool) {}

  /** 与 ShellManager.onEvent 同款签名，方便 ipc 层用同一段广播代码订阅 */
  onEvent(listener: Emit): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit = (event: SshShellEvent): void => {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        /* 单个监听器异常不影响其它 */
      }
    }
  }

  list(): VmSessionInfo[] {
    return [...this.handles.values()].map((handle) => handle.session)
  }

  has(sessionId: string): boolean {
    return this.handles.has(sessionId)
  }

  /**
   * 开一个虚拟机终端会话。
   *
   * termproxy 后端在 PVE 主进程内部就能跑通，不依赖节点 SSH——这也是
   * 「Windows 虚拟机、没配串口的虚拟机也能用 xterm.js」的关键：只要装了 OpenSSH
   * 就能走 guest-ssh，否则还能退回 QEMU 串口，最差才是 termproxy 报错。
   */
  async open(request: VmSessionRequest): Promise<VmSessionInfo> {
    if (request.backend === 'termproxy') return this.openTermProxy(request)
    if (request.backend === 'serial') return this.openSerial(request)
    return this.openGuestSsh(request)
  }

  private baseSession(request: VmSessionRequest): VmSessionInfo {
    const label =
      request.title?.trim() ||
      request.name?.trim() ||
      `${request.type === 'qemu' ? 'QEMU' : 'LXC'} ${request.vmid}`
    return {
      sessionId: randomUUID(),
      host: request.node,
      username: request.user?.split('@')[0] ?? '',
      title: label,
      cols: request.cols,
      rows: request.rows,
      backend: request.backend
    }
  }

  private openTermProxy(request: VmSessionRequest): VmSessionInfo {
    if (!request.wsUrl) throw new Error('PVE 没有返回控制台地址。')
    if (!request.ticket) throw new Error('PVE 没有返回控制台 ticket。')
    const session = this.baseSession(request)
    const emit = this.emit

    const bridge = new TermProxyBridge({
      wsUrl: request.wsUrl,
      user: request.user ?? 'root@pam',
      ticket: request.ticket,
      tls: request.tls,
      emit,
      sessionId: session.sessionId,
      onClose: () => {
        this.handles.delete(session.sessionId)
        emit({
          type: 'exit',
          sessionId: session.sessionId,
          reason: request.command ? '串口控制台已关闭' : 'PVE 控制台已断开'
        })
      }
    })

    this.handles.set(session.sessionId, {
      session,
      write: (data) => bridge.write(data),
      resize: (cols, rows) => bridge.resize(cols, rows),
      close: () => {
        this.handles.delete(session.sessionId)
        bridge.close()
      }
    })

    if (request.command) {
      // 先关回显再 clear，节点 shell 的提示符/命令回显就被清掉了，
      // 用户看到的是 qm terminal 之后的串口画面。
      bridge.sendOnReady(`stty -echo; clear; ${request.command}\r`)
    }
    bridge.open()
    return session
  }

  private async openSerial(request: VmSessionRequest): Promise<VmSessionInfo> {
    if (!request.nodeTarget) throw new Error('缺少节点 SSH 凭据，无法打开串口控制台。')
    const session = this.baseSession(request)
    const emit = this.emit
    // qm terminal 会挂进 QEMU 的 serial0；-escape 关掉「Ctrl-O 退出」以免用户误按
    const channel = await this.pool.openShell(
      request.nodeTarget,
      { cols: request.cols, rows: request.rows },
      `qm terminal ${request.vmid}`
    )

    let finished = false
    const finish = (reason: string): void => {
      if (finished) return
      finished = true
      this.handles.delete(session.sessionId)
      emit({ type: 'exit', sessionId: session.sessionId, reason })
    }

    channel.on('data', (chunk: Buffer) => {
      emit({ type: 'data', sessionId: session.sessionId, data: chunk.toString('utf8') })
    })
    channel.stderr.on('data', (chunk: Buffer) => {
      emit({ type: 'data', sessionId: session.sessionId, data: chunk.toString('utf8') })
    })
    // 没有 error 监听器的 EventEmitter 会抛异常，直接崩主进程
    channel.on('error', (error: Error) => {
      finish(`串口连接错误：${error.message}`)
    })
    channel.stderr.on('error', () => {
      /* 视为断线 */
    })
    channel.on('close', () => {
      finish('串口控制台已关闭')
    })

    this.handles.set(session.sessionId, {
      session,
      write: (data) => {
        try {
          channel.write(data)
        } catch {
          /* 通道已关闭 */
        }
      },
      resize: (cols, rows) => {
        session.cols = cols
        session.rows = rows
        try {
          channel.setWindow(Math.max(5, rows), Math.max(20, cols), 0, 0)
        } catch {
          /* 通道已关闭 */
        }
      },
      close: () => {
        this.handles.delete(session.sessionId)
        try {
          channel.end()
        } catch {
          /* 已经关了 */
        }
      }
    })

    return session
  }

  private async openGuestSsh(request: VmSessionRequest): Promise<VmSessionInfo> {
    if (!request.guestTarget) throw new Error('缺少虚拟机的 SSH 地址或凭据。')
    const session = this.baseSession(request)
    session.username = request.guestTarget.username
    session.host = request.guestTarget.host
    const emit = this.emit
    const channel = await this.pool.openShell(request.guestTarget, {
      cols: request.cols,
      rows: request.rows
    })

    let finished = false
    const finish = (reason: string): void => {
      if (finished) return
      finished = true
      this.handles.delete(session.sessionId)
      emit({ type: 'exit', sessionId: session.sessionId, reason })
    }

    channel.on('data', (chunk: Buffer) => {
      emit({ type: 'data', sessionId: session.sessionId, data: chunk.toString('utf8') })
    })
    channel.stderr.on('data', (chunk: Buffer) => {
      emit({ type: 'data', sessionId: session.sessionId, data: chunk.toString('utf8') })
    })
    channel.on('error', (error: Error) => {
      finish(`虚拟机 SSH 连接错误：${error.message}`)
    })
    channel.stderr.on('error', () => {
      /* 视为断线 */
    })
    channel.on('close', () => {
      finish('虚拟机 SSH 会话已结束')
    })

    this.handles.set(session.sessionId, {
      session,
      write: (data) => {
        try {
          channel.write(data)
        } catch {
          /* 通道已关闭 */
        }
      },
      resize: (cols, rows) => {
        session.cols = cols
        session.rows = rows
        try {
          channel.setWindow(Math.max(5, rows), Math.max(20, cols), 0, 0)
        } catch {
          /* 通道已关闭 */
        }
      },
      close: () => {
        this.handles.delete(session.sessionId)
        try {
          channel.end()
        } catch {
          /* 已经关了 */
        }
      }
    })

    return session
  }

  write(sessionId: string, data: string): boolean {
    const handle = this.handles.get(sessionId)
    if (!handle) return false
    handle.write(data)
    return true
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const handle = this.handles.get(sessionId)
    if (!handle) return false
    handle.resize(cols, rows)
    return true
  }

  close(sessionId: string): void {
    this.handles.get(sessionId)?.close()
  }

  closeAll(): void {
    for (const sessionId of [...this.handles.keys()]) this.close(sessionId)
  }
}

export { resolveSshTarget, type SshTargetInput, type PveManager }
