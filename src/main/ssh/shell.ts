import { randomUUID } from 'node:crypto'
import type { ClientChannel } from 'ssh2'
import type { SshPool, SshTarget } from './client'

/**
 * 多路 SSH 终端会话管理。
 *
 * 每个会话是一条独立 PTY，用 sessionId 索引。渲染进程只管收发字符串，
 * 生命周期（关闭 / 断线）都在这边兜住，避免 xterm 那边留着死通道。
 */

export interface ShellSession {
  sessionId: string
  host: string
  username: string
  title: string
  createdAt: number
  cols: number
  rows: number
}

interface ShellHandle {
  session: ShellSession
  channel: ClientChannel
  target: SshTarget
}

export type ShellEvent =
  | { type: 'data'; sessionId: string; data: string }
  | { type: 'exit'; sessionId: string; reason: string }

type ShellListener = (event: ShellEvent) => void

export class ShellManager {
  private readonly handles = new Map<string, ShellHandle>()
  private readonly listeners = new Set<ShellListener>()

  constructor(private readonly pool: SshPool) {}

  onEvent(listener: ShellListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: ShellEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        /* 单个监听器异常不影响其它 */
      }
    }
  }

  list(): ShellSession[] {
    return [...this.handles.values()].map((handle) => handle.session)
  }

  /**
   * 打开一条「已经在跑某个程序」的通道（虚拟机串口控制台）。
   * 复用同一套会话登记，前端拿到 sessionId 后跟普通 shell 完全一样。
   */
  async attach(
    input: {
      target: SshTarget
      cols: number
      rows: number
      title?: string
      command: string
    }
  ): Promise<ShellSession> {
    return this.register(input.target, input, input.command)
  }

  /** 开一个新会话；title 由前端传，用来显示「节点 · 序号」 */
  async open(input: {
    target: SshTarget
    cols: number
    rows: number
    title?: string
  }): Promise<ShellSession> {
    return this.register(input.target, input)
  }

  private async register(
    target: SshTarget,
    input: { cols: number; rows: number; title?: string },
    command?: string
  ): Promise<ShellSession> {
    const channel = await this.pool.openShell(target, { cols: input.cols, rows: input.rows }, command)
    const session: ShellSession = {
      sessionId: randomUUID(),
      host: target.host,
      username: target.username,
      title: input.title || `${target.username}@${target.host}`,
      createdAt: Date.now(),
      cols: input.cols,
      rows: input.rows
    }

    this.handles.set(session.sessionId, { session, channel, target })

    let finished = false
    const finish = (reason: string): void => {
      if (finished) return
      finished = true
      this.handles.delete(session.sessionId)
      this.emit({ type: 'exit', sessionId: session.sessionId, reason })
    }

    channel.on('data', (chunk: Buffer) => {
      this.emit({ type: 'data', sessionId: session.sessionId, data: chunk.toString('utf8') })
    })

    channel.stderr.on('data', (chunk: Buffer) => {
      this.emit({ type: 'data', sessionId: session.sessionId, data: chunk.toString('utf8') })
    })

    // EventEmitter 的 'error' 没有监听器会直接抛异常，把主进程整个带崩；
    // SSH 断线时通道错误是很常见的，这里必须接住。
    channel.on('error', (error: Error) => {
      finish(`连接错误：${error.message}`)
    })
    channel.stderr.on('error', () => {
      /* stderr 的异常按普通断线处理即可 */
    })

    channel.on('close', () => {
      finish('shell closed')
    })

    return session
  }

  write(sessionId: string, data: string): void {
    const handle = this.handles.get(sessionId)
    if (!handle) throw new Error('SSH 会话不存在或已断开。')
    handle.channel.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const handle = this.handles.get(sessionId)
    if (!handle) return
    handle.session.cols = cols
    handle.session.rows = rows
    handle.channel.setWindow(Math.max(5, rows), Math.max(20, cols), 0, 0)
  }

  close(sessionId: string): void {
    const handle = this.handles.get(sessionId)
    if (!handle) return
    this.handles.delete(sessionId)
    try {
      handle.channel.end()
    } catch {
      /* 已经关了 */
    }
  }

  closeAll(): void {
    for (const sessionId of [...this.handles.keys()]) this.close(sessionId)
  }
}
