import { EventEmitter } from 'node:events'
import { Client, type ClientChannel, type SFTPWrapper } from 'ssh2'

/**
 * SSH 连接管理器。
 *
 * 三块功能共用一条连接：
 *   - exec() 执行一次性命令（采样 /proc/stat、上传下发等）
 *   - openShell() 开交互式 PTY，喂给 xterm.js
 *   - sftp() 拿 SFTP 会话做文件管理
 *
 * 连接按 host:port 缓存并复用。PFX 的 PVE 节点 SSH 只有密码认证，
 * 所以这里只实现 password 一种，凭据直接沿用 PVE 登录的那套。
 */

export interface SshTarget {
  host: string
  port: number
  username: string
  password: string
}

export interface SshExecResult {
  code: number | null
  stdout: string
  stderr: string
}

interface PooledConnection {
  client: Client
  target: SshTarget
  /** 正在建立中的连接，避免同一目标并发重复握手 */
  pending?: Promise<Client>
  sftpPending?: Promise<SFTPWrapper>
  sftp?: SFTPWrapper
}

const CONNECT_TIMEOUT_MS = 12_000
const EXEC_TIMEOUT_MS = 15_000

function keyOf(target: SshTarget): string {
  return `${target.host}:${target.port}:${target.username}`
}

export class SshPool extends EventEmitter {
  private readonly pool = new Map<string, PooledConnection>()

  /** 建立（或复用）到目标的连接 */
  async connect(target: SshTarget): Promise<Client> {
    const key = keyOf(target)
    const existing = this.pool.get(key)
    if (existing) {
      if (existing.pending) return existing.pending
      return existing.client
    }

    const client = new Client()
    const entry: PooledConnection = { client, target }
    this.pool.set(key, entry)

    entry.pending = new Promise<Client>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        client.destroy()
        this.pool.delete(key)
        reject(new Error(`连接 ${target.host}:${target.port} 超时，请确认节点已开启 SSH。`))
      }, CONNECT_TIMEOUT_MS)

      client.once('ready', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        entry.pending = undefined
        resolve(client)
      })

      // 连接建立后的 error 也必须有人接：ssh2 的 Client / Channel 都是 EventEmitter，
      // 没有监听器的 'error' 会抛异常，把 Electron 主进程直接带崩（xterm 一断线就复现）。
      client.on('error', (error: Error & { level?: string }) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          this.pool.delete(key)
          reject(translateSshError(error, target))
          return
        }
        // 已连上之后的网络错误：从池里摘掉，下次操作自动重连，不让异常冒泡
        console.error('SSH connection error:', target.host, error.message)
        this.drop(key)
      })

      client.once('close', () => {
        this.drop(key)
      })

      try {
        client.connect({
          host: target.host,
          port: target.port,
          username: target.username,
          password: target.password,
          readyTimeout: CONNECT_TIMEOUT_MS,
          // PVE 节点首次连接时指纹不定，交给用户自己判断是否信任该地址
          algorithms: undefined
        })
      } catch (error) {
        settled = true
        clearTimeout(timer)
        this.pool.delete(key)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })

    try {
      return await entry.pending
    } finally {
      entry.pending = undefined
    }
  }

  private drop(key: string): void {
    const entry = this.pool.get(key)
    if (!entry) return
    this.pool.delete(key)
    try {
      entry.sftp?.end()
    } catch {
      /* 已经断了，忽略 */
    }
  }

  /** 执行一次性命令，返回 stdout / stderr 与退出码 */
  async exec(target: SshTarget, command: string): Promise<SshExecResult> {
    const client = await this.connect(target)
    return new Promise<SshExecResult>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error(`执行命令超时：${command}`))
      }, EXEC_TIMEOUT_MS)

      client.exec(command, (error, channel) => {
        if (error) {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            reject(error)
          }
          return
        }
        let stdout = ''
        let stderr = ''
        let code: number | null = null
        channel.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8')
        })
        channel.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8')
        })
        channel.on('exit', (exitCode: number | null) => {
          code = exitCode
        })
        channel.on('error', (channelError: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(channelError)
        })
        channel.stderr.on('error', () => {
          /* 连接中断时 stderr 也可能报错，交给 channel 的 error/close 处理 */
        })
        channel.on('close', () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ code, stdout, stderr })
        })
      })
    })
  }

  /**
   * 开一个交互式 shell，返回 PTY 通道；调用方负责写数据和关闭。
   * 传 command 时用 `exec` 起一条带 PTY 的命令（虚拟机串口控制台靠这个）。
   */
  async openShell(
    target: SshTarget,
    size: { cols: number; rows: number },
    command?: string
  ): Promise<ClientChannel> {
    const client = await this.connect(target)
    const pty = {
      term: 'xterm-256color',
      cols: Math.max(20, size.cols),
      rows: Math.max(5, size.rows)
    }
    return new Promise<ClientChannel>((resolve, reject) => {
      const done = (error: Error | undefined, channel: ClientChannel): void => {
        if (error) {
          reject(error)
          return
        }
        resolve(channel)
      }
      if (command) {
        client.exec(command, { pty }, done)
        return
      }
      client.shell(pty, done)
    })
  }

  /** 取（或建立）SFTP 会话 */
  async sftp(target: SshTarget): Promise<SFTPWrapper> {
    const client = await this.connect(target)
    const key = keyOf(target)
    const entry = this.pool.get(key)
    if (!entry) throw new Error('SSH 连接已断开，请重试。')
    if (entry.sftp) return entry.sftp

    if (entry.sftpPending) return entry.sftpPending

    entry.sftpPending = new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((error, sftp) => {
        if (error) {
          reject(error)
          return
        }
        entry.sftp = sftp
        sftp.on('close', () => {
          entry.sftp = undefined
        })
        sftp.on('error', () => {
          // SFTP 通道断开时不要让未处理的 error 冒到主进程
          entry.sftp = undefined
        })
        resolve(sftp)
      })
    })

    try {
      return await entry.sftpPending
    } finally {
      entry.sftpPending = undefined
    }
  }

  /** 主动断开某个目标 */
  disconnect(target: SshTarget): void {
    const key = keyOf(target)
    const entry = this.pool.get(key)
    if (!entry) return
    try {
      entry.client.end()
    } catch {
      /* 忽略 */
    }
    this.pool.delete(key)
  }

  /** 调整已开 PTY 的窗口大小 */
  static resize(channel: ClientChannel, size: { cols: number; rows: number }): void {
    try {
      channel.setWindow(Math.max(5, size.rows), Math.max(20, size.cols), 0, 0)
    } catch {
      /* 通道已关闭 */
    }
  }
}

/** 把 ssh2 的英文错误翻成能看懂的中文 */
function translateSshError(error: Error & { level?: string }, target: SshTarget): Error {
  const message = error.message || String(error)
  if (/authentication methods failed|All configured authentication/i.test(message)) {
    return new Error(
      `SSH 登录 ${target.username}@${target.host} 失败：账号或密码不正确。如果节点只允许密钥登录，请改用密钥。`
    )
  }
  if (error.level === 'client-authentication') {
    return new Error(`SSH 认证失败：${message}`)
  }
  if (/ECONNREFUSED/i.test(message)) {
    return new Error(
      `无法连接 ${target.host}:${target.port}：端口拒绝连接。请确认节点已安装并启动 SSH 服务（systemctl status ssh）。`
    )
  }
  if (/ETIMEDOUT|Timed out/i.test(message)) {
    return new Error(`连接 ${target.host}:${target.port} 超时，请检查节点网络与防火墙规则。`)
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return new Error(`无法解析主机名 ${target.host}。`)
  }
  return new Error(`SSH 连接失败：${message}`)
}

export const sshPool = new SshPool()
