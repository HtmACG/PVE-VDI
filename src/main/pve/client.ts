import https from 'node:https'
import type { IncomingMessage } from 'node:http'
import type { ApiError } from '@shared/types'

export class PveError extends Error {
  readonly code: string
  readonly status?: number
  readonly detail?: string

  constructor(code: string, message: string, options?: { status?: number; detail?: string }) {
    super(message)
    this.name = 'PveError'
    this.code = code
    this.status = options?.status
    this.detail = options?.detail
  }
}

export interface PveCredentials {
  serverUrl: string
  username: string
  password: string
  allowSelfSigned: boolean
}

interface LoginTicket {
  ticket: string
  CSRFPreventionToken: string
  username: string
  clustername?: string
}

type QueryValue = string | number | boolean | null | undefined | Array<string | number>
type QueryParams = Record<string, QueryValue>
type FormValue = string | number | boolean | null | undefined
type FormBody = Record<string, FormValue>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  params?: QueryParams
  form?: FormBody
  timeoutMs?: number
  skipAuth?: boolean
  isLogin?: boolean
  retried?: boolean
}

export function normalizeServerUrl(input: string): string {
  let candidate = input.trim()
  if (!candidate) {
    throw new PveError('VALIDATION', '请输入 Proxmox VE 服务器地址。')
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`
  }

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new PveError('VALIDATION', 'PVE 服务器地址格式无效。')
  }

  if (url.protocol !== 'https:') {
    throw new PveError('VALIDATION', 'PVE API 必须通过 HTTPS 连接（默认端口 8006）。')
  }
  if (url.username || url.password) {
    throw new PveError('VALIDATION', '请勿在服务器地址中嵌入账号或密码。')
  }
  if (!url.hostname) {
    throw new PveError('VALIDATION', 'PVE 服务器地址缺少主机名。')
  }

  const port = url.port || '8006'
  const host = url.hostname
  return `${url.protocol}//${host}:${port}`
}

function buildQuery(params?: QueryParams): string {
  if (!params) return ''
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, String(item))
    } else if (typeof value === 'boolean') {
      query.append(key, value ? '1' : '0')
    } else {
      query.append(key, String(value))
    }
  }
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

function buildForm(body?: FormBody): string {
  if (!body) return ''
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null || value === '') continue
    form.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  }
  return form.toString()
}

function parsePveError(status: number, raw: string, isLogin: boolean): PveError {
  let message = ''
  let detail = ''
  try {
    const payload = JSON.parse(raw) as {
      message?: string
      errors?: Record<string, string>
      data?: unknown
    }
    message = payload.message?.trim() ?? ''
    if (payload.errors && Object.keys(payload.errors).length > 0) {
      detail = Object.entries(payload.errors)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' · ')
    }
  } catch {
    detail = raw.slice(0, 500)
  }

  if (status === 401) {
    return new PveError(
      isLogin ? 'AUTH_FAILED' : 'AUTH_REQUIRED',
      isLogin ? '账号或密码错误，无法建立 PVE 会话。' : 'PVE 会话已失效，请重新登录。',
      { status, detail: detail || message }
    )
  }
  if (status === 403) {
    return new PveError('FORBIDDEN', '当前账号没有执行此操作的权限。', {
      status,
      detail: [message, detail].filter(Boolean).join(' · ')
    })
  }
  if (status === 404) {
    return new PveError('NOT_FOUND', 'PVE 上未找到请求的资源。', {
      status,
      detail: [message, detail].filter(Boolean).join(' · ')
    })
  }
  return new PveError('PVE_ERROR', message || `PVE API 请求失败（HTTP ${status}）。`, {
    status,
    detail: detail || undefined
  })
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof PveError) {
    return {
      code: error.code,
      message: error.message,
      detail: error.detail,
      status: error.status
    }
  }

  const nodeError = error as NodeJS.ErrnoException
  const code = nodeError?.code ?? 'UNKNOWN'
  const detail = nodeError?.message ?? String(error)

  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return {
        code,
        message: '无法解析 PVE 服务器地址，请检查地址和 DNS 设置。',
        detail
      }
    case 'ECONNREFUSED':
      return {
        code,
        message: 'PVE 拒绝连接，请确认地址、端口与防火墙设置。',
        detail
      }
    case 'ECONNRESET':
    case 'EPIPE':
      return {
        code,
        message: '连接被 PVE 中断，请稍后重试。',
        detail
      }
    case 'ETIMEDOUT':
    case 'TIMEOUT':
      return {
        code: 'TIMEOUT',
        message: '连接 PVE 超时，请检查网络连通性。',
        detail
      }
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return {
        code: 'TLS_ERROR',
        message: 'TLS 证书校验失败。如使用 PVE 默认自签名证书，请允许自签名证书。',
        detail
      }
    default:
      return {
        code,
        message: '操作失败，请稍后重试。',
        detail
      }
  }
}

function validateUpid(upid: string): void {
  if (!/^UPID:[A-Za-z0-9:_.@-]+$/.test(upid)) {
    throw new PveError('VALIDATION', '任务标识格式无效。')
  }
}

function validateNodeName(node: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(node)) {
    throw new PveError('VALIDATION', '节点名称格式无效。')
  }
}

/**
 * Small, dependency-free PVE API client. PVE uses a ticket cookie plus a CSRF
 * token for mutating requests. The client never exposes the ticket to the
 * renderer. Credentials stay in memory so an expired ticket can be renewed.
 */
export class PveClient {
  private base: URL
  private agent: https.Agent
  private credentials: PveCredentials
  private ticket = ''
  private csrf = ''
  private clusterName = ''
  private authPromise: Promise<void> | null = null
  private disposed = false

  constructor(credentials: PveCredentials) {
    const normalized = normalizeServerUrl(credentials.serverUrl)
    this.base = new URL(normalized)
    this.credentials = { ...credentials, serverUrl: normalized }
    this.agent = this.createAgent(credentials.allowSelfSigned)
  }

  private createAgent(allowSelfSigned: boolean): https.Agent {
    return new https.Agent({
      rejectUnauthorized: !allowSelfSigned,
      keepAlive: true,
      maxSockets: 12
    })
  }

  get serverUrl(): string {
    return this.credentials.serverUrl
  }

  get username(): string {
    return this.credentials.username
  }

  get cluster(): string {
    return this.clusterName
  }

  get authenticated(): boolean {
    return Boolean(this.ticket)
  }

  get allowSelfSigned(): boolean {
    return this.credentials.allowSelfSigned
  }

  get tlsAgent(): https.Agent {
    return this.agent
  }

  get authCookieHeader(): string {
    return this.ticket ? `PVEAuthCookie=${this.ticket}` : ''
  }

  async login(): Promise<{ username: string; clusterName: string }> {
    this.ticket = ''
    this.csrf = ''
    await this.authenticate()
    return { username: this.credentials.username, clusterName: this.clusterName }
  }

  dispose(): void {
    this.disposed = true
    this.ticket = ''
    this.csrf = ''
    this.agent.destroy()
  }

  private async authenticate(): Promise<void> {
    if (this.disposed) {
      throw new PveError('DISPOSED', '当前连接已关闭。')
    }
    if (this.authPromise) {
      await this.authPromise
      return
    }

    const promise = this.execute<LoginTicket>('/access/ticket', {
      method: 'POST',
      form: {
        username: this.credentials.username,
        password: this.credentials.password
      },
      skipAuth: true,
      isLogin: true,
      retried: true,
      timeoutMs: 20_000
    }).then((result) => {
      this.ticket = result.ticket
      this.csrf = result.CSRFPreventionToken
      this.clusterName = result.clustername ?? ''
    })

    this.authPromise = promise.finally(() => {
      this.authPromise = null
    })
    await this.authPromise
  }

  private async ensureAuth(): Promise<void> {
    if (!this.ticket) {
      await this.authenticate()
    }
  }

  async request<T>(
    path: string,
    options: Omit<RequestOptions, 'skipAuth' | 'isLogin' | 'retried'> = {}
  ): Promise<T> {
    if (!path.startsWith('/')) {
      throw new PveError('VALIDATION', 'API 路径无效。')
    }
    await this.ensureAuth()
    let retried = false
    try {
      return await this.execute<T>(path, options)
    } catch (error) {
      if (error instanceof PveError && error.status === 401 && !retried) {
        retried = true
        this.ticket = ''
        this.csrf = ''
        await this.authenticate()
        return this.execute<T>(path, { ...options, retried: true })
      }
      throw error
    }
  }

  private execute<T>(path: string, options: RequestOptions): Promise<T> {
    const method = options.method ?? 'GET'
    const body = options.form ? buildForm(options.form) : ''
    const query = buildQuery(options.params)
    const timeoutMs = options.timeoutMs ?? 25_000
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'PVE-VDI/1.0'
    }

    if (!options.skipAuth) {
      headers.Cookie = `PVEAuthCookie=${this.ticket}`
      if (method !== 'GET') {
        headers.CSRFPreventionToken = this.csrf
      }
    }
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      headers['Content-Length'] = String(Buffer.byteLength(body))
    }

    const hostname = this.base.hostname.replace(/^\[|\]$/g, '')
    const port = Number(this.base.port || (this.base.protocol === 'https:' ? 443 : 80))

    return new Promise<T>((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          port,
          path: `/api2/json${path}${query}`,
          method,
          headers,
          agent: this.agent,
          timeout: timeoutMs
        },
        (response: IncomingMessage) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer) => chunks.push(chunk))
          response.on('error', (error) => {
            reject(new PveError('NETWORK_ERROR', '读取 PVE 响应失败。', { detail: error.message }))
          })
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8')
            const status = response.statusCode ?? 0
            if (status < 200 || status >= 300) {
              reject(parsePveError(status, raw, Boolean(options.isLogin)))
              return
            }
            if (!raw.trim()) {
              resolve(undefined as T)
              return
            }
            try {
              const envelope = JSON.parse(raw) as { data?: T }
              resolve(envelope.data as T)
            } catch {
              reject(
                new PveError('INVALID_RESPONSE', 'PVE 返回了无法解析的响应。', {
                  status,
                  detail: raw.slice(0, 300)
                })
              )
            }
          })
        }
      )

      req.on('timeout', () => {
        req.destroy(new PveError('TIMEOUT', '连接 PVE 超时，请检查网络。'))
      })
      req.on('error', (error) => {
        if (error instanceof PveError) reject(error)
        else reject(error)
      })
      if (body) req.write(body)
      req.end()
    })
  }

  async getTaskLog(node: string, upid: string): Promise<Array<{ n: number; t: string }>> {
    validateNodeName(node)
    validateUpid(upid)
    const data = await this.request<Array<{ n: number; t: string }>>(
      `/nodes/${encodeURIComponent(node)}/tasks/${upid}/log?limit=500`,
      { timeoutMs: 20_000 }
    )
    return data ?? []
  }

  async getTaskStatus(node: string, upid: string): Promise<{ status?: string; exitstatus?: string }> {
    validateNodeName(node)
    validateUpid(upid)
    return this.request(`/nodes/${encodeURIComponent(node)}/tasks/${upid}/status`)
  }
}

export { validateNodeName, validateUpid }
