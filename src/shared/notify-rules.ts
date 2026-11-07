/**
 * 桌面通知的判定规则（纯函数，不依赖 Electron）。
 *
 * 主进程每次拿到新的 dashboard 快照后调用 `evaluateNotifications`：
 * 它对比上一次的状态，返回本次需要弹出的通知文案，并就地更新状态。
 * 首份快照只做基线，不会把启动前就存在的关机 / 失败当成新事件。
 */

export interface NotifyVm {
  name: string
  type: string
  vmid: number
  node: string
  status: string
  template: boolean
}

export interface NotifyTask {
  upid: string
  type: string
  id?: string
  node: string
  status: string
  startTime: number
}

export interface NotifySnapshot {
  vms: NotifyVm[]
  tasks: NotifyTask[]
}

export interface NotifyPrefs {
  enabled: boolean
  vmStopped: boolean
  taskFailed: boolean
}

export interface NotifyMessage {
  kind: 'vm-stopped' | 'task-failed'
  title: string
  body: string
}

export interface NotifyState {
  seeded: boolean
  vmStatus: Map<string, string>
  taskStatus: Map<string, string>
  /** 已经提醒过（或无需提醒）的任务 UPID，避免同一条失败反复弹窗 */
  notifiedTasks: Set<string>
}

/** 新出现的失败任务最多回溯多久（秒）；更早的历史失败只记状态，不补发通知 */
const STALE_TASK_SECONDS = 15 * 60
const MAX_NOTIFIED_TASKS = 200

export function createNotifyState(): NotifyState {
  return {
    seeded: false,
    vmStatus: new Map(),
    taskStatus: new Map(),
    notifiedTasks: new Set()
  }
}

/** 切换集群 / 重新登录时清空基线，避免拿旧集群的状态做对比 */
export function resetNotifyState(state: NotifyState): void {
  state.seeded = false
  state.vmStatus.clear()
  state.taskStatus.clear()
  state.notifiedTasks.clear()
}

function vmMessage(stopped: NotifyVm[]): NotifyMessage {
  if (stopped.length === 1) {
    const vm = stopped[0]
    return {
      kind: 'vm-stopped',
      title: '虚拟机关机',
      body: `${vm.name}（${vm.type.toUpperCase()} ${vm.vmid}）在 ${vm.node} 已关机。`
    }
  }
  const names = stopped.slice(0, 2).map((vm) => vm.name).join('、')
  return {
    kind: 'vm-stopped',
    title: '虚拟机关机',
    body:
      stopped.length === 2
        ? `${names} 已关机。`
        : `${names} 等 ${stopped.length} 台虚拟机已关机。`
  }
}

function taskLabel(task: NotifyTask, labelOf: (type: string) => string): string {
  const label = labelOf(task.type) || task.type
  return task.id ? `${label} #${task.id}` : label
}

function taskMessage(failed: NotifyTask[], labelOf: (type: string) => string): NotifyMessage {
  if (failed.length === 1) {
    return {
      kind: 'task-failed',
      title: '任务执行失败',
      body: `${taskLabel(failed[0], labelOf)} 在 ${failed[0].node} 执行失败。`
    }
  }
  const names = failed.slice(0, 2).map((task) => taskLabel(task, labelOf)).join('、')
  return {
    kind: 'task-failed',
    title: '任务执行失败',
    body:
      failed.length === 2
        ? `${names} 执行失败。`
        : `${names} 等 ${failed.length} 个任务执行失败。`
  }
}

export function evaluateNotifications(
  state: NotifyState,
  snapshot: NotifySnapshot,
  prefs: NotifyPrefs,
  nowSeconds: number,
  labelOf: (type: string) => string
): NotifyMessage[] {
  const wasSeeded = state.seeded
  const stopped: NotifyVm[] = []
  const failed: NotifyTask[] = []

  const nextVm = new Map<string, string>()
  for (const vm of snapshot.vms) {
    const key = `${vm.type}/${vm.vmid}`
    nextVm.set(key, vm.status)
    if (!wasSeeded || vm.template) continue
    if (state.vmStatus.get(key) === 'running' && vm.status === 'stopped') stopped.push(vm)
  }

  const nextTask = new Map<string, string>()
  for (const task of snapshot.tasks) {
    nextTask.set(task.upid, task.status)
    if (!wasSeeded) {
      if (task.status === 'error') state.notifiedTasks.add(task.upid)
      continue
    }
    if (state.notifiedTasks.has(task.upid)) continue
    if (task.status !== 'error') continue
    const previous = state.taskStatus.get(task.upid)
    // 第一次见到就已经失败：只有发生时间足够新才提醒，避免历史任务刷屏
    if (previous === undefined && nowSeconds - task.startTime > STALE_TASK_SECONDS) {
      state.notifiedTasks.add(task.upid)
      continue
    }
    failed.push(task)
    state.notifiedTasks.add(task.upid)
  }

  state.vmStatus = nextVm
  state.taskStatus = nextTask
  state.seeded = true

  if (state.notifiedTasks.size > MAX_NOTIFIED_TASKS) {
    const alive = new Set(snapshot.tasks.map((task) => task.upid))
    for (const upid of state.notifiedTasks) {
      if (!alive.has(upid)) state.notifiedTasks.delete(upid)
    }
  }

  if (!wasSeeded || !prefs.enabled) return []
  const messages: NotifyMessage[] = []
  if (prefs.vmStopped && stopped.length > 0) messages.push(vmMessage(stopped))
  if (prefs.taskFailed && failed.length > 0) messages.push(taskMessage(failed, labelOf))
  return messages
}
