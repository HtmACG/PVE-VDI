import { sshPool, type SshPool, type SshTarget } from './client'
import { ShellManager } from './shell'
import { SshWindowManager } from './windows'
import { resolveGuestTarget, resolveSshTarget, type GuestSshInput, type SshTargetInput } from './resolve'
import { sampleCoreLoads, probeSsh } from './metrics'
import { VmSessionManager, type VmSessionInfo, type VmSessionRequest } from './vm-session'
import type { PveManager } from '../pve/service'
import type { SettingsStore } from '../settings'

/**
 * SSH 侧的聚合入口：把池、shell 管理、目标解析捏成一个对象交给 IPC 层用。
 * 这样 ipc.ts 只需要一句 `servers.shell`，不用知道底下分了几块。
 */
export interface SshServers {
  pool: SshPool
  shell: ShellManager
  /** 虚拟机终端会话（termproxy / 串口 / 客户机 SSH 三种后端） */
  vmSessions: VmSessionManager
  windows: SshWindowManager | null
  attachWindows(manager: SshWindowManager): void
  /** 由 ipc 层注入：关窗时回收虚拟机控制台桥 */
  setVmConsoleCloser(closer: (sessionId: string) => void): void
  /** 主进程侧 PVE 服务，SSH 窗口里的虚拟机控制台要用它换 ticket */
  manager: PveManager
  target(input?: SshTargetInput): SshTarget
  /** 解析客户机（虚拟机自己的 sshd）目标 */
  guestTarget(input: GuestSshInput): SshTarget
  probe(input?: SshTargetInput): ReturnType<typeof probeSsh>
  sampleCores(input?: SshTargetInput): Promise<number[] | undefined>
}

export function createSshServers(store: SettingsStore, manager: PveManager): SshServers {
  const pool = sshPool
  const shell = new ShellManager(pool)
  let windows: SshWindowManager | null = null
  let vmConsoleCloser: ((sessionId: string) => void) | null = null

  const vmSessions = new VmSessionManager(pool)

  // 把按核负载采样注入 PveManager：dashboard 刷新时顺带取一次 /proc/stat
  manager.setCoreSampler(() => {
    try {
      return sampleCoreLoads(pool, resolveSshTarget(store, manager))
    } catch {
      // 凭据不全或地址未配置时静默跳过，前端退回占位形态
      return Promise.resolve(undefined)
    }
  })

  return {
    pool,
    shell,
    vmSessions,
    get windows() {
      return windows
    },
    attachWindows: (next) => {
      windows = next
      if (vmConsoleCloser) next.setVmConsoleCloser(vmConsoleCloser)
    },
    setVmConsoleCloser: (closer) => {
      vmConsoleCloser = closer
      windows?.setVmConsoleCloser(closer)
    },
    target: (input) => resolveSshTarget(store, manager, input),
    guestTarget: (input) => resolveGuestTarget(store, input),
    manager,
    probe: (input) => {
      let target: SshTarget
      try {
        target = resolveSshTarget(store, manager, input)
      } catch (error) {
        return Promise.resolve({
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        })
      }
      return probeSsh(pool, target).then((result) => ({
        ...result,
        host: target.host,
        port: target.port,
        username: target.username
      }))
    },
    sampleCores: (input) => {
      try {
        return sampleCoreLoads(pool, resolveSshTarget(store, manager, input))
      } catch {
        return Promise.resolve(undefined)
      }
    }
  }
}

export { sshPool }
export { SshWindowManager }
