import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { IncomingMessage } from 'node:http'
import type https from 'node:https'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import type { ConsoleSessionInfo } from '@shared/types'

export interface ConsoleUpstream {
  url: string
  headers: Record<string, string>
  agent: https.Agent
  rejectUnauthorized: boolean
  initialPayload?: string
}

interface PendingMessage {
  data: RawData
  isBinary: boolean
}

interface LocalConnection {
  client: WebSocket
  upstream?: WebSocket
  queue: PendingMessage[]
  closed: boolean
}

interface SessionRecord {
  info: ConsoleSessionInfo
  upstream: ConsoleUpstream
  connections: Set<LocalConnection>
  expiryTimer: NodeJS.Timeout
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000

function safeClose(socket: WebSocket | undefined, code = 1000, reason = ''): void {
  if (!socket) return
  try {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(code, reason.slice(0, 120))
    }
  } catch {
    // The socket may already be gone.
  }
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * A loopback-only WebSocket bridge. The renderer never talks to PVE's TLS
 * endpoint directly: tickets and cookies stay in the main process while the
 * noVNC / xterm.js clients connect to a short-lived, token-scoped local port.
 */
export class ConsoleHost {
  private server: WebSocketServer | null = null
  private port = 0
  private starting: Promise<void> | null = null
  private sessions = new Map<string, SessionRecord>()

  private async start(): Promise<void> {
    if (this.server) return
    if (this.starting) return this.starting

    this.starting = new Promise<void>((resolve, reject) => {
      const server = new WebSocketServer({
        host: '127.0.0.1',
        port: 0,
        perMessageDeflate: false,
        maxPayload: 8 * 1024 * 1024,
        handleProtocols: (protocols) => (protocols.has('binary') ? 'binary' : false)
      })

      const onError = (error: Error): void => {
        server.off('listening', onListening)
        this.starting = null
        reject(error)
      }
      const onListening = (): void => {
        server.off('error', onError)
        this.port = (server.address() as AddressInfo).port
        this.server = server
        this.starting = null
        server.on('connection', (client, request) => this.handleConnection(client, request))
        resolve()
      }

      server.once('error', onError)
      server.once('listening', onListening)
    })

    return this.starting
  }

  async createSession(info: Omit<ConsoleSessionInfo, 'sessionId' | 'wsUrl' | 'expiresAt'>, upstream: ConsoleUpstream): Promise<ConsoleSessionInfo> {
    await this.start()
    const sessionId = randomBytes(24).toString('base64url')
    const expiresAt = Date.now() + SESSION_TTL_MS
    const wsUrl = `ws://127.0.0.1:${this.port}/console/${sessionId}`
    const fullInfo: ConsoleSessionInfo = { ...info, sessionId, wsUrl, expiresAt }

    const expiryTimer = setTimeout(() => this.closeSession(sessionId), SESSION_TTL_MS)
    expiryTimer.unref?.()

    this.sessions.set(sessionId, {
      info: fullInfo,
      upstream,
      connections: new Set(),
      expiryTimer
    })
    return fullInfo
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.sessions.delete(sessionId)
    clearTimeout(session.expiryTimer)
    for (const connection of session.connections) {
      this.closeConnection(connection)
    }
    session.connections.clear()
  }

  closeAll(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      this.closeSession(sessionId)
    }
  }

  private closeConnection(connection: LocalConnection): void {
    if (connection.closed) return
    connection.closed = true
    safeClose(connection.client, 1000, 'Console closed')
    safeClose(connection.upstream, 1000, 'Console closed')
    connection.queue.length = 0
  }

  private handleConnection(client: WebSocket, request: IncomingMessage): void {
    if (!isLoopback(request.socket.remoteAddress)) {
      safeClose(client, 4003, 'Loopback connections only')
      return
    }

    let token = ''
    try {
      const url = new URL(request.url ?? '/', 'ws://127.0.0.1')
      token = url.pathname.split('/').filter(Boolean).at(-1) ?? ''
    } catch {
      safeClose(client, 4000, 'Invalid console path')
      return
    }

    const session = this.sessions.get(token)
    if (!session) {
      safeClose(client, 4004, 'Console session not found')
      return
    }

    const connection: LocalConnection = { client, queue: [], closed: false }
    session.connections.add(connection)
    client.binaryType = 'nodebuffer'

    const upstream = new WebSocket(session.upstream.url, ['binary'], {
      agent: session.upstream.agent,
      rejectUnauthorized: session.upstream.rejectUnauthorized,
      headers: session.upstream.headers,
      handshakeTimeout: 20_000,
      perMessageDeflate: false,
      maxPayload: 8 * 1024 * 1024
    })
    connection.upstream = upstream

    client.on('message', (data, isBinary) => {
      if (connection.closed) return
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary })
      } else if (upstream.readyState === WebSocket.CONNECTING) {
        connection.queue.push({ data, isBinary })
      }
    })
    client.on('close', () => {
      session.connections.delete(connection)
      this.closeConnection(connection)
    })
    client.on('error', () => {
      session.connections.delete(connection)
      this.closeConnection(connection)
    })

    upstream.on('open', () => {
      if (connection.closed) {
        safeClose(upstream)
        return
      }
      if (session.upstream.initialPayload) {
        upstream.send(session.upstream.initialPayload)
      }
      for (const pending of connection.queue) {
        if (upstream.readyState !== WebSocket.OPEN) break
        upstream.send(pending.data, { binary: pending.isBinary })
      }
      connection.queue.length = 0
    })
    upstream.on('message', (data, isBinary) => {
      if (connection.closed || client.readyState !== WebSocket.OPEN) return
      client.send(data, { binary: isBinary })
    })
    upstream.on('unexpected-response', () => {
      safeClose(client, 1011, 'PVE console rejected the connection')
      session.connections.delete(connection)
      this.closeConnection(connection)
    })
    upstream.on('error', () => {
      safeClose(client, 1011, 'PVE console connection failed')
      session.connections.delete(connection)
      this.closeConnection(connection)
    })
    upstream.on('close', (_code, reason) => {
      if (!connection.closed) {
        safeClose(client, 1011, reason.toString() || 'PVE console closed')
      }
      session.connections.delete(connection)
      this.closeConnection(connection)
    })
  }
}
