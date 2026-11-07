/**
 * 虚拟机控制台能力判定（纯函数，不依赖 Electron / PVE 客户端）。
 *
 * 判定依据只有两样：
 *   1. 虚拟机配置里有没有一条 socket 串口（`serial0: socket=...`），
 *      QEMU 的 `qm terminal` 就是挂在这条串口上的；
 *   2. 客户机 SSH（22 端口）能不能连上，探测结果由调用方传入。
 *
 * 两者都没有就是「用不了」——菜单里置灰并说明原因，不再靠 ttyd 这种
 * 节点级能力猜测（PVE 的 ttyd 服务是给节点 shell 用的，跟 QEMU 串口无关，
 * 之前的 `nodeHasTtyd()` 在探测失败时还默认返回 true，导致所有 QEMU 都被当成可用）。
 *
 * LXC 例外：容器本身就有 pty，xterm.js 始终可用。
 */

export type ConsoleBackend = 'guest-ssh' | 'pty'

export interface ConsoleCapabilityInput {
  type: 'qemu' | 'lxc'
  /** 当前运行状态：running / stopped / ... */
  status: string
  /** PVE 的虚拟机配置（原始字段） */
  config: Record<string, unknown>
  /**
   * 客户机 SSH 探测结果：
   *   true      → 22 端口可达
   *   false     → 探测过，不可达
   *   undefined → 无法探测（没开 Guest Agent、虚拟机未运行等），不下否定结论
   */
  guestSsh?: boolean
  /** config.vnc 是否为 0（QEMU 关了 VNC） */
  vncEnabled?: boolean
}

export interface ConsoleCapability {
  vnc: boolean
  xterm: boolean
  backend?: ConsoleBackend
  vncReason?: string
  xtermReason?: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return fallback
  return String(value)
}

/** QEMU 是否配置了可挂终端的串口（PVE 写法：serial0: socket） */
export function hasSerialSocket(config: Record<string, unknown>): boolean {
  if (config.serial0 === undefined || config.serial0 === null) return false
  return str(record(config.serial0).type).toLowerCase() === 'socket'
}

export function deriveConsoleCapability(input: ConsoleCapabilityInput): ConsoleCapability {
  const { type, status, config, guestSsh } = input
  const vga = (str(config.vga, 'std') || 'std').toLowerCase()
  const vgaBlocks = vga.startsWith('none') || vga.startsWith('serial')
  // 调用方没显式给 vncEnabled 时，从 config.vnc 里读（PVE 关闭 VNC 时是 0）
  const vncEnabled =
    input.vncEnabled === undefined
      ? config.vnc === undefined || config.vnc === null || str(config.vnc) !== '0'
      : input.vncEnabled
  const vnc = type === 'lxc' ? false : vncEnabled && !vgaBlocks

  if (type === 'lxc') {
    return {
      vnc: false,
      xterm: true,
      backend: 'pty',
      vncReason: 'LXC 容器没有图形界面，只能用终端控制台'
    }
  }

  /**
   * QEMU 串口方案已取消：xterm.js 统一走客户机 SSH 账号密码。
   * 运行中的 QEMU 一律允许打开，没探测到 IP 时在终端窗口里手动填写 SSH 地址与凭据。
   */
  const xterm = status === 'running'
  let xtermReason: string | undefined
  if (!xterm) {
    xtermReason = '虚拟机未运行，启动后才能打开 SSH 终端'
  } else if (guestSsh === false) {
    xtermReason = '客户机 22 端口不可达；打开终端时可手动填写 SSH 地址与账号密码'
  } else if (guestSsh === undefined) {
    xtermReason = '未能自动探测客户机 IP；打开终端时手动填写 SSH 地址即可'
  }

  let vncReason: string | undefined
  if (!vnc) {
    vncReason =
      !vncEnabled
        ? '该 QEMU 实例未启用 VNC 服务器（vnc 参数为 0）'
        : vgaBlocks
          ? '显示类型被设为 none / serialN，虚拟机没有 VGA 输出'
          : '该虚拟机不支持 VNC 控制台'
  }

  return {
    vnc,
    xterm,
    backend: 'guest-ssh',
    vncReason,
    xtermReason
  }
}
