import { Notification } from 'electron'
import { TASK_TYPE_LABELS } from '@shared/ipc'
import type { AppSettings, DashboardData } from '@shared/types'
import {
  createNotifyState,
  evaluateNotifications,
  resetNotifyState,
  type NotifyState
} from '@shared/notify-rules'

/**
 * 把 dashboard 的状态变化转成 Windows 通知。
 *
 * 判定规则放在 `@shared/notify-rules` 里（纯函数、可单测）；
 * 这里只负责读设置、调 Electron 的 Notification，并在点击时把主窗口叫到前台。
 */
export class DashboardNotifier {
  private readonly state: NotifyState = createNotifyState()

  constructor(
    private readonly getSettings: () => AppSettings,
    private readonly onActivate: () => void,
    private readonly iconPath: () => string | undefined = () => undefined
  ) {}

  /** 退出登录 / 切换集群时重置基线，避免把旧集群的关机与失败算成新事件 */
  reset(): void {
    resetNotifyState(this.state)
  }

  observe(dashboard: DashboardData): void {
    const settings = this.getSettings()
    const messages = evaluateNotifications(
      this.state,
      dashboard,
      {
        enabled: settings.notificationsEnabled,
        vmStopped: settings.notifyVmShutdown,
        taskFailed: settings.notifyTaskFailure
      },
      Math.floor(Date.now() / 1000),
      (type) => TASK_TYPE_LABELS[type] ?? type
    )
    for (const message of messages) this.show(message.title, message.body)
  }

  /** 设置页的「发送测试通知」 */
  sendTest(): void {
    this.show('PVE VDI 通知测试', '桌面通知工作正常。虚拟机停机与任务失败会以同样的方式提醒。')
  }

  private show(title: string, body: string): void {
    if (!Notification.isSupported()) return
    try {
      const icon = this.iconPath()
      const notification = new Notification({
        title,
        body,
        silent: false,
        ...(icon ? { icon } : {})
      })
      notification.on('click', () => this.onActivate())
      notification.show()
    } catch (error) {
      console.error('Failed to show desktop notification', error)
    }
  }
}
