import type { PveManager } from '../pve/service'
import type { SettingsStore } from '../settings'
import type { SshTarget } from './client'

/**
 * 把 PVE 的连接信息翻译成 SSH 目标。
 *
 * 约定：SSH 连到 PVE 服务器地址的 22 端口，账号用 PVE 登录名去掉 realm 后缀
 * （root@pam → root）。密码优先用本次登录实际使用的那个，其次才回落到
 * 设置里记住的密码——用户改过密码但没勾记住时，这样才对得上。
 */

export interface SshTargetInput {
  /** 覆盖主机；不传则用 PVE 地址 */
  host?: string
  /** 覆盖端口；默认 22 */
  port?: number
  /** 覆盖账号；不传则从 PVE 用户名推导 */
  username?: string
  /** 覆盖密码；不传则用已保存的密码 */
  password?: string
}

/** PVE 的 root@pam / user@pve 这类用户名去掉 realm，得到系统账号 */
export function deriveSystemUser(pveUsername: string): string {
  const at = pveUsername.indexOf('@')
  const name = at >= 0 ? pveUsername.slice(0, at) : pveUsername
  return name.trim() || 'root'
}

/** 从 PVE 服务器地址里取主机名，顺便去掉端口与协议 */
export function hostFromServerUrl(serverUrl: string): string {
  try {
    return new URL(serverUrl).hostname
  } catch {
    return serverUrl.replace(/^https?:\/\//i, '').replace(/[:/].*$/, '')
  }
}

export function resolveSshTarget(store: SettingsStore, manager: PveManager, input?: SshTargetInput): SshTarget {
  const settings = store.get()
  const session = manager.session
  const host = input?.host?.trim() || hostFromServerUrl(session?.serverUrl ?? settings.serverUrl)
  const pveUser = session?.username || settings.username
  const username = input?.username?.trim() || deriveSystemUser(pveUser)
  // PVE 登录用的密码只在内存里，记住的密码从设置解密；两者都可能为空
  const password = input?.password ?? store.getSavedPassword() ?? ''

  if (!host) throw new Error('还没有配置 PVE 服务器地址，无法建立 SSH 连接。')
  if (!username) throw new Error('缺少 SSH 账号。')
  if (!password) {
    throw new Error(
      '没有可用的 SSH 密码。请确认登录时勾选了「记住密码」，或在 SSH 面板里手动填写账号密码。'
    )
  }

  return {
    host,
    port: input?.port && input.port > 0 && input.port < 65536 ? input.port : 22,
    username,
    password
  }
}

/**
 * 客户机 SSH 目标。
 *
 * 和上面的节点目标不同：这里连的是**虚拟机自己的** sshd，所以主机必须显式给出
 * （PVE 的 Guest Agent 报回来的接口地址）。账号优先用用户手填的，
 * 否则按 ostype 猜一个：Windows 用 Administrator、其余用 root。
 */
export interface GuestSshInput {
  host: string
  port?: number
  username?: string
  password?: string
  /** 客户机操作系统：windows 时默认账号是 Administrator */
  ostype?: string
}

export function resolveGuestTarget(store: SettingsStore, input: GuestSshInput): SshTarget {
  const host = input.host?.trim()
  if (!host) throw new Error('这台虚拟机没有可用的 IP 地址，无法通过 SSH 连接。')

  const isWindows = /^win/i.test(input.ostype ?? '')
  const username = input.username?.trim() || (isWindows ? 'Administrator' : 'root')
  // 用户没填就用 PVE 那套密码试一把（绝大多数人装机时设的是同一个）
  const password = input.password ?? store.getSavedPassword() ?? ''
  if (!password) {
    throw new Error('缺少客户机 SSH 密码，请在连接设置里填写。')
  }

  return {
    host,
    port: input.port && input.port > 0 && input.port < 65536 ? input.port : 22,
    username,
    password
  }
}
