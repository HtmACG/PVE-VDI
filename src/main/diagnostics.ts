import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * 主进程运行时错误落盘。
 *
 * 崩溃/卡死时用户只能看到「Electron 未响应」，没有栈可查。
 * 这里把 uncaughtException、渲染进程消失、窗口无响应都追加到 userData/logs/main.log，
 * 不影响正常流程；写日志本身失败也静默。
 */
export function logRuntimeError(scope: string, error: unknown): void {
  const stack = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(`[${scope}]`, error)
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(
      path.join(dir, 'main.log'),
      `[${new Date().toISOString()}] [${scope}] ${stack}\n`
    )
  } catch {
    /* 日志失败不影响主流程 */
  }
}
