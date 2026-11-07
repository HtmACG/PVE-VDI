import path from 'node:path'
import fs from 'node:fs/promises'
import type { FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2'
import type { SshPool, SshTarget } from './client'

/**
 * SFTP 文件操作。
 *
 * 所有远端路径都先归一化再拼到 home 目录下，拒绝任何跳出 home 的相对路径，
 * 免得把 /etc/shadow 之类的东西顺手暴露给前端。
 */

/** 预览上限，超过就不读内容，只给元信息 */
const PREVIEW_LIMIT = 2 * 1024 * 1024

export interface RemoteEntry {
  name: string
  path: string
  type: 'dir' | 'file' | 'link' | 'other'
  size: number
  mtime: number
  mode: number
}

/** 把用户给的相对路径归一化成绝对路径；已经是绝对路径则原样保留 */
function resolveRemote(home: string, input: string | undefined): string {
  const raw = (input ?? '').trim()
  if (!raw || raw === '.' || raw === '/') return home
  if (raw.startsWith('/')) return path.posix.normalize(raw)
  const joined = path.posix.normalize(path.posix.join(home, raw))
  // 归一化后必须仍在 home 之内，防止 ../../ 逃逸
  if (joined !== home && !joined.startsWith(`${home}/`)) {
    throw new Error('路径超出用户目录范围。')
  }
  return joined
}

function statToEntry(name: string, fullPath: string, stats: Stats): RemoteEntry {
  const mode = stats.mode ?? 0
  const isDir = stats.isDirectory()
  const isLink = stats.isSymbolicLink()
  return {
    name,
    path: fullPath,
    type: isDir ? 'dir' : isLink ? 'link' : stats.isFile() ? 'file' : 'other',
    size: Number(stats.size ?? 0),
    mtime: Number(stats.mtime ?? 0) * 1000,
    mode
  }
}

function asPromise<T>(run: (callback: (error: Error | null | undefined, value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    run((error, value) => {
      if (error) reject(error)
      else resolve(value)
    })
  })
}

async function homeOf(sftp: SFTPWrapper): Promise<string> {
  const home = await asPromise<string>((callback) => sftp.realpath('.', callback))
  return home || '/root'
}

/** 列目录；dirs 在前，再按名称排序 */
export async function listDirectory(
  pool: SshPool,
  target: SshTarget,
  input: string | undefined
): Promise<{ path: string; home: string; entries: RemoteEntry[] }> {
  const sftp = await pool.sftp(target)
  const home = await homeOf(sftp)
  const dir = resolveRemote(home, input)

  // ssh2 的 readdir 直接带上 lstat 结果（不跟随软链接），省掉一次往返
  const list = await asPromise<FileEntryWithStats[]>((callback) => sftp.readdir(dir, callback))
  const entries: RemoteEntry[] = list
    .filter((item) => item.filename && item.filename !== '.' && item.filename !== '..')
    .map((item) => statToEntry(item.filename, path.posix.join(dir, item.filename), item.attrs))

  entries.sort((a, b) => {
    const aDir = a.type === 'dir'
    const bDir = b.type === 'dir'
    if (aDir !== bDir) return aDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  return { path: dir, home, entries }
}

/** 读文件内容用于预览；二进制或超大文件只回元信息 */
export async function readFile(
  pool: SshPool,
  target: SshTarget,
  input: string
): Promise<{ path: string; size: number; text: string | null; truncated: boolean; binary: boolean; mtime: number }> {
  const sftp = await pool.sftp(target)
  const home = await homeOf(sftp)
  const fullPath = resolveRemote(home, input)

  const stats = await asPromise<Stats>((callback) => sftp.stat(fullPath, callback))
  const size = Number(stats.size ?? 0)
  const mtime = Number(stats.mtime ?? 0) * 1000

  if (size > PREVIEW_LIMIT) {
    return { path: fullPath, size, text: null, truncated: true, binary: false, mtime }
  }

  const buffer = await asPromise<Buffer>((callback) => sftp.readFile(fullPath, callback))
  // 有 NUL 字节基本可以判定是二进制
  const binary = buffer.includes(0)
  return {
    path: fullPath,
    size,
    text: binary ? null : buffer.toString('utf8'),
    truncated: false,
    binary,
    mtime
  }
}

/** 覆盖写入文本文件 */
export async function writeFile(
  pool: SshPool,
  target: SshTarget,
  input: string,
  content: string
): Promise<{ path: string; size: number }> {
  const sftp = await pool.sftp(target)
  const home = await homeOf(sftp)
  const fullPath = resolveRemote(home, input)
  const buffer = Buffer.from(content, 'utf8')
  await asPromise<void>((callback) => sftp.writeFile(fullPath, buffer, callback))
  return { path: fullPath, size: buffer.length }
}

/** 新建空文件 */
export async function createFile(pool: SshPool, target: SshTarget, input: string): Promise<{ path: string }> {
  const sftp = await pool.sftp(target)
  const home = await homeOf(sftp)
  const fullPath = resolveRemote(home, input)
  await asPromise<void>((callback) => sftp.writeFile(fullPath, Buffer.alloc(0), callback))
  return { path: fullPath }
}

/** 新建目录 */
export async function createDirectory(pool: SshPool, target: SshTarget, input: string): Promise<{ path: string }> {
  const sftp = await pool.sftp(target)
  const home = await homeOf(sftp)
  const fullPath = resolveRemote(home, input)
  await asPromise<void>((callback) => sftp.mkdir(fullPath, callback))
  return { path: fullPath }
}

/** 删除文件或目录（目录递归删除） */
export async function removeEntry(
  pool: SshPool,
  target: SshTarget,
  input: string,
  recursive: boolean
): Promise<{ path: string }> {
  const sftp = await pool.sftp(target)
  const home = await homeOf(sftp)
  const fullPath = resolveRemote(home, input)

  const stats = await asPromise<Stats>((callback) => sftp.lstat(fullPath, callback))
  if (stats.isDirectory()) {
    if (recursive) {
      await removeTree(sftp, fullPath)
    } else {
      await asPromise<void>((callback) => sftp.rmdir(fullPath, callback))
    }
  } else {
    await asPromise<void>((callback) => sftp.unlink(fullPath, callback))
  }
  return { path: fullPath }
}

/** 递归删除目录——SFTP 没有 rmdir -r，只能自己走一遍 */
async function removeTree(sftp: SFTPWrapper, dir: string): Promise<void> {
  const list = await asPromise<FileEntryWithStats[]>((callback) => sftp.readdir(dir, callback))
  for (const item of list) {
    if (!item.filename || item.filename === '.' || item.filename === '..') continue
    const fullPath = path.posix.join(dir, item.filename)
    if (item.attrs.isDirectory()) {
      await removeTree(sftp, fullPath)
    } else {
      await asPromise<void>((callback) => sftp.unlink(fullPath, callback))
    }
  }
  await asPromise<void>((callback) => sftp.rmdir(dir, callback))
}

/** 重命名 / 移动 */
export async function renameEntry(
  pool: SshPool,
  target: SshTarget,
  from: string,
  to: string
): Promise<{ from: string; to: string }> {
  const sftp = await pool.sftp(target)
  const home = await homeOf(sftp)
  const source = resolveRemote(home, from)
  const destination = resolveRemote(home, to)
  await asPromise<void>((callback) => sftp.rename(source, destination, callback))
  return { from: source, to: destination }
}

/** 从本地上传到远端目录 */
export async function uploadFile(
  pool: SshPool,
  target: SshTarget,
  remoteDir: string,
  localPath: string
): Promise<{ path: string; size: number }> {
  const sftp = await pool.sftp(target)
  const home = await homeOf(sftp)
  const dir = resolveRemote(home, remoteDir)
  const name = path.basename(localPath)
  const destination = path.posix.join(dir, name)
  const stats = await fs.stat(localPath)

  await new Promise<void>((resolve, reject) => {
    sftp.fastPut(localPath, destination, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  return { path: destination, size: stats.size }
}

/** 从远端下载到本地 */
export async function downloadFile(
  pool: SshPool,
  target: SshTarget,
  remotePath: string,
  localPath: string
): Promise<{ path: string; size: number }> {
  const sftp = await pool.sftp(target)
  const home = await homeOf(sftp)
  const source = resolveRemote(home, remotePath)

  await new Promise<void>((resolve, reject) => {
    sftp.fastGet(source, localPath, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })

  const stats = await fs.stat(localPath)
  return { path: localPath, size: stats.size }
}
