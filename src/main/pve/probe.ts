import net from 'node:net'

/**
 * TCP 端口探活。
 *
 * 用来判断客户机能不能走 SSH：只看「SYN 有没有被回应」，
 * 不做 SSH 握手——握手慢、还要密码，这里只想知道门开没开。
 * 超时给短一点（1.5s），因为它是跟着仪表盘轮询跑的，不能拖慢刷新。
 */
export function probeTcp(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const socket = new net.Socket()

    const done = (result: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    try {
      socket.connect(port, host)
    } catch {
      done(false)
    }
  })
}

/**
 * 并发探活多个主机，返回第一台通的。
 *
 * Windows 虚拟机的 Guest Agent 常报出一堆地址（回环、IPv6 链路本地、
 * 多块网卡），挨个试太慢，这里并发发出去取最先连上的那个。
 */
export async function firstReachable(
  hosts: string[],
  port: number,
  timeoutMs = 1500
): Promise<string | null> {
  const unique = [...new Set(hosts.filter((host) => host && host !== '127.0.0.1' && host !== '::1'))]
  if (unique.length === 0) return null
  const results = await Promise.all(
    unique.map(async (host) => ({ host, ok: await probeTcp(host, port, timeoutMs) }))
  )
  const hit = results.find((item) => item.ok)
  return hit ? hit.host : null
}
