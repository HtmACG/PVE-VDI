import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type {
  ApiError,
  AppSettings,
  BackgroundImages,
  BackgroundPickResult,
  BootstrapData,
  ConsoleMode,
  ConsoleOpenRequest,
  DashboardData,
  LoginResult,
  PreferencesPatch,
  SessionProfile,
  TaskSummary,
  VmAction,
  VmRef,
  VmSummary
} from '@shared/types'
import { VM_ACTION_LABELS } from '@shared/ipc'
import { BootScreen } from '@renderer/components/boot-screen'
import { LoginView } from '@renderer/components/views/login-view'
import { AiView } from '@renderer/components/views/ai-view'
import { WindowButtons } from '@renderer/components/layout/window-buttons'
import { BrandLockup } from '@renderer/components/brand'
import { Titlebar } from '@renderer/components/layout/titlebar'
import { Sidebar, type ViewKey } from '@renderer/components/layout/sidebar'
import { OverviewView } from '@renderer/components/views/overview-view'
import { VmsView } from '@renderer/components/views/vms-view'
import { NodesView } from '@renderer/components/views/nodes-view'
import { NodeSettingsView } from '@renderer/components/views/node-settings-view'
import { ClusterView } from '@renderer/components/views/cluster-view'
import { ImagesView } from '@renderer/components/views/images-view'
import { StorageView } from '@renderer/components/views/storage-view'
import { BackupView } from '@renderer/components/views/backup-view'
import { HaView } from '@renderer/components/views/ha-view'
import { SdnView } from '@renderer/components/views/sdn-view'
import { FirewallView } from '@renderer/components/views/firewall-view'
import { AccessView } from '@renderer/components/views/access-view'
import { TasksView } from '@renderer/components/views/tasks-view'
import { cn } from '@renderer/lib/utils'
import { SettingsView } from '@renderer/components/views/settings-view'
import { CreateVmDialog } from '@renderer/components/vms/create-vm-dialog'
import { VmDetailSheet } from '@renderer/components/vms/vm-detail-sheet'
import { TaskLogDialog } from '@renderer/components/tasks/task-log-dialog'
import { type ActionTarget, actionDescription, actionProgressLabel } from '@renderer/components/vms/vm-actions'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Skeleton } from '@renderer/components/ui/primitives'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { Toaster } from '@renderer/components/ui/sonner'
import { errorDetail, unwrap } from '@renderer/lib/api'
import { applyAppearance } from '@renderer/lib/appearance'
import { useDashboard } from '@renderer/hooks/use-dashboard'
import { useLiveMetrics } from '@renderer/hooks/use-live-metrics'
import { mergeLiveMetrics } from '@renderer/lib/live'
import { toast } from 'sonner'

const CONFIRM_ACTIONS = new Set<VmAction>(['shutdown', 'stop', 'reboot', 'reset', 'suspend'])

function ContentSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="space-y-2 pb-3">
        <Skeleton className="h-2.5 w-36" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[132px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Skeleton className="h-[420px] xl:col-span-8" />
        <Skeleton className="h-[420px] xl:col-span-4" />
      </div>
      <Skeleton className="h-[240px]" />
    </div>
  )
}

function BootFailure({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-border pl-4">
        <BrandLockup compact />
        <WindowButtons />
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-[420px] border border-destructive/35 bg-card p-5">
          <div className="flex items-center gap-2 text-[12px] font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            无法初始化桌面控制台
          </div>
          <p className="mt-2 break-words text-[11px] leading-5 text-muted-foreground">{message}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            <RefreshCw className="h-3 w-3" />
            重试
          </Button>
        </div>
      </div>
    </div>
  )
}

interface ConnectedAppProps {
  bootstrap: BootstrapData
  session: SessionProfile
  settings: AppSettings
  backgrounds: BackgroundImages
  onSettingsChange: (settings: AppSettings) => void
  onBackgroundChange: (result: BackgroundPickResult) => void
  onLogout: () => Promise<void>
  onSessionLost: (message: string) => Promise<void>
}

function ConnectedApp({
  bootstrap,
  session,
  settings,
  backgrounds,
  onSettingsChange,
  onBackgroundChange,
  onLogout,
  onSessionLost
}: ConnectedAppProps): React.JSX.Element {
  const [view, setView] = useState<ViewKey>('overview')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedRef, setSelectedRef] = useState<VmRef | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRefreshToken, setDetailRefreshToken] = useState(0)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  /** 正在执行的动作，用于把按钮文案切成「正在启动…」并在状态变化前保持转圈 */
  const [busyAction, setBusyAction] = useState<VmAction | null>(null)
  const [busySince, setBusySince] = useState(0)
  const [confirmAction, setConfirmAction] = useState<{ target: ActionTarget; action: VmAction } | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [taskLog, setTaskLog] = useState<TaskSummary | null>(null)
  const [nodeSettingsNode, setNodeSettingsNode] = useState<string | null>(null)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const initialScrollDone = useRef(false)

  const handleAuthError = useCallback(
    (message: string): void => {
      void onSessionLost(message)
    },
    [onSessionLost]
  )

  const { data, loading, refreshing, error, refresh } = useDashboard({
    enabled: true,
    intervalSeconds: settings.refreshInterval,
    onAuthError: handleAuthError
  })
  const live = useLiveMetrics({
    enabled: true,
    intervalMs: 2000,
    onAuthError: handleAuthError
  })
  const viewData = useMemo(() => mergeLiveMetrics(data, live.data), [data, live.data])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
    setNodeSettingsNode(null)
  }, [view])

  useEffect(() => {
    if (!data || initialScrollDone.current) return
    initialScrollDone.current = true
    const scrollToTop = (): void => {
      mainRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    }
    scrollToTop()
    const raf = window.requestAnimationFrame(scrollToTop)
    const timer = window.setTimeout(scrollToTop, 350)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [data])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return
      }
      if (document.querySelector('[data-console-root], [role="dialog"][data-state="open"]')) {
        return
      }
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        setCreateOpen(true)
      }
      if (event.key === 'r' || event.key === 'R') {
        if (event.metaKey || event.ctrlKey) return
        event.preventDefault()
        void refresh()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [refresh])

  const scheduleRefresh = (): void => {
    window.setTimeout(() => {
      void refresh()
      setDetailRefreshToken((value) => value + 1)
    }, 1200)
    window.setTimeout(() => {
      void refresh()
      setDetailRefreshToken((value) => value + 1)
    }, 4200)
  }

  const clearBusy = useCallback((): void => {
    setBusyKey(null)
    setBusyAction(null)
    setBusySince(0)
  }, [])

  /**
   * 等虚拟机状态真正变化后再收起转圈：
   * 只是「指令已下发」时任务往往还在队列里，按钮一直显示「正在启动 / 正在关闭」更符合预期。
   * 外部关机（ACPI）可能要等客户机响应，所以最长保留 5 分钟，避免卡死。
   */
  useEffect(() => {
    if (!busyKey || !busyAction) return
    const check = (): void => {
      const elapsed = Date.now() - busySince
      const vm = viewData?.vms.find((item) => `${item.type}/${item.vmid}` === busyKey)
      if (!vm) {
        clearBusy()
        return
      }
      const settled =
        busyAction === 'start' || busyAction === 'resume'
          ? vm.status === 'running'
          : busyAction === 'shutdown' || busyAction === 'stop'
            ? vm.status === 'stopped'
            : busyAction === 'suspend'
              ? vm.status === 'paused' || vm.status === 'suspended'
              : elapsed > 10_000
      if (settled || elapsed > 5 * 60_000) clearBusy()
    }
    check()
    const timer = window.setInterval(check, 1000)
    return () => window.clearInterval(timer)
  }, [busyKey, busyAction, busySince, viewData, clearBusy])

  const executeAction = async (target: ActionTarget, action: VmAction): Promise<void> => {
    const key = `${target.type}/${target.vmid}`
    setBusyKey(key)
    setBusyAction(action)
    setBusySince(Date.now())
    setActionBusy(true)
    try {
      const result = await unwrap(
        window.pvevdi.vmAction({
          node: target.node,
          type: target.type,
          vmid: target.vmid,
          action
        })
      )
      toast.success(`${VM_ACTION_LABELS[action]}指令已下发`, {
        description: `${target.name} · ${result.upid ? 'PVE 任务已创建' : '操作已接受'}`
      })
      setConfirmAction(null)
      scheduleRefresh()
      // 不在这里清 busyKey：等上面那个 effect 看到状态变化后再收
    } catch (err) {
      toast.error('无法执行虚拟机操作', { description: errorDetail(err) })
      clearBusy()
    } finally {
      setActionBusy(false)
    }
  }

  const requestAction = (target: ActionTarget, action: VmAction): void => {
    if (target.template) {
      toast.error('模板不能直接执行电源操作')
      return
    }
    if (CONFIRM_ACTIONS.has(action)) {
      setConfirmAction({ target, action })
    } else {
      void executeAction(target, action)
    }
  }

  const openVm = (vm: VmSummary): void => {
    setSelectedRef({ node: vm.node, type: vm.type, vmid: vm.vmid })
    setDetailOpen(true)
  }

  const openCreatedVm = (target: { node: string; vmid: number; type: 'qemu' }): void => {
    setView('vms')
    setSelectedRef({ node: target.node, type: target.type, vmid: target.vmid })
    setDetailOpen(true)
  }

  const openConsole = async (target: ActionTarget, mode: ConsoleMode): Promise<void> => {
    if (target.status && target.status !== 'running') {
      toast.error('虚拟机未运行', { description: '请先启动虚拟机，再打开控制台。' })
      return
    }
    const type = target.type ?? 'qemu'
    try {
      if (mode === 'xterm') {
        // 菜单已按探测结果置灰；这里再兜一层，防止旧缓存或快捷键绕过
        if (target.console && !target.console.xterm) {
          toast.error('终端控制台不可用', {
            description: target.console.xtermReason ?? '该虚拟机没有可用的串口或客户机 SSH。'
          })
          return
        }
        // 有客户机 SSH 时优先直连虚拟机内部（文件面板也跟着进去），
        // 否则走串口 / LXC pty，由主进程校验通道是否真的存在
        const guestHost = target.console?.guestHost ?? undefined
        await unwrap(
          window.pvevdi.openSshWindow({
            node: target.node,
            vm: {
              node: target.node,
              vmid: target.vmid,
              type,
              name: target.name,
              guestHost,
              guestUser: target.console?.guestUser ?? undefined,
              ostype: target.ostype
            },
            tabs: 1
          })
        )
        return
      }
      const request: ConsoleOpenRequest = {
        kind: 'vm',
        node: target.node,
        type,
        vmid: target.vmid,
        name: target.name,
        mode: 'novnc'
      }
      await unwrap(window.pvevdi.openConsoleWindow(request))
    } catch (err) {
      toast.error(mode === 'xterm' ? '无法打开终端控制台' : '无法打开 VNC 控制台', {
        description: errorDetail(err)
      })
    }
  }

  const openNodeShell = async (node: string): Promise<void> => {
    try {
      // 节点 Shell 走独立 SSH 窗口：多标签 + 文件面板
      await unwrap(window.pvevdi.openSshWindow({ node, tabs: 1 }))
    } catch (err) {
      toast.error('无法打开 SSH 窗口', { description: errorDetail(err) })
    }
  }

  const updatePreferences = async (patch: PreferencesPatch): Promise<void> => {
    try {
      const next = await unwrap(window.pvevdi.updatePreferences(patch))
      onSettingsChange(next)
      toast.success('偏好设置已保存')
    } catch (err) {
      toast.error('无法保存偏好设置', { description: errorDetail(err) })
      throw err
    }
  }

  const toggleTheme = (): void => {
    void updatePreferences({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
  }

  const toggleSidebar = async (): Promise<void> => {
    try {
      const next = await unwrap(
        window.pvevdi.updatePreferences({ sidebarCollapsed: !settings.sidebarCollapsed })
      )
      onSettingsChange(next)
    } catch (err) {
      toast.error('无法保存侧边栏状态', { description: errorDetail(err) })
    }
  }

  const forgetCredentials = async (): Promise<void> => {
    try {
      const next = await unwrap(window.pvevdi.forgetCredentials())
      onSettingsChange(next)
      toast.success('已清除保存的凭据')
    } catch (err) {
      toast.error('无法清除凭据', { description: errorDetail(err) })
      throw err
    }
  }

  const disconnect = async (): Promise<void> => {
    setDisconnecting(true)
    try {
      await onLogout()
    } finally {
      setDisconnecting(false)
      setDisconnectOpen(false)
    }
  }

  const openNodeSettings = (node: string): void => {
    mainRef.current?.scrollTo({ top: 0 })
    setNodeSettingsNode(node)
  }

  const closeNodeSettings = (): void => {
    mainRef.current?.scrollTo({ top: 0 })
    setNodeSettingsNode(null)
  }

  const renderView = (dashboard: DashboardData): React.JSX.Element => {
    switch (view) {
      case 'vms':
        return (
          <VmsView
            dashboard={dashboard}
            busyKey={busyKey}
            busyAction={busyAction}
            onCreateVm={() => setCreateOpen(true)}
            onOpenVm={openVm}
            onAction={requestAction}
            onConsole={openConsole}
          />
        )
      case 'nodes':
        if (nodeSettingsNode) {
          return (
            <NodeSettingsView
              node={nodeSettingsNode}
              clusterName={dashboard.cluster.name}
              networkView={settings.networkView}
              onBack={closeNodeSettings}
            />
          )
        }
        return (
          <NodesView
            dashboard={dashboard}
            liveAt={live.data?.fetchedAt}
            liveError={live.error}
            onCreateVm={() => setCreateOpen(true)}
            onNavigate={setView}
            onOpenShell={openNodeShell}
            onOpenSettings={openNodeSettings}
          />
        )
      case 'cluster':
        return (
          <ClusterView
            dashboard={dashboard}
            onOpenTask={setTaskLog}
          />
        )
      case 'images':
        return <ImagesView dashboard={dashboard} onRefresh={() => void refresh()} />
      case 'storage':
        return <StorageView dashboard={dashboard} onRefresh={() => void refresh()} />
      case 'backup':
        return <BackupView dashboard={dashboard} onRefresh={() => void refresh()} />
      case 'sdn':
        return <SdnView dashboard={dashboard} />
      case 'ha':
        return <HaView dashboard={dashboard} />
      case 'firewall':
        return <FirewallView dashboard={dashboard} />
      case 'access':
        return <AccessView dashboard={dashboard} />
      case 'tasks':
        return (
          <TasksView
            dashboard={dashboard}
            onRefresh={() => void refresh()}
            onOpenTask={setTaskLog}
          />
        )
      case 'ai':
        return (
          <AiView
            settings={settings}
            ownerKey={`${session.serverUrl}|${session.username}`}
            onOpenSettings={() => setView('settings')}
          />
        )
      case 'settings':
        return (
          <SettingsView
            settings={settings}
            session={session}
            dashboard={dashboard}
            theme={settings.theme}
            appVersion={bootstrap.appVersion}
            electronVersion={bootstrap.electronVersion}
            backgrounds={backgrounds}
            onUpdatePreferences={updatePreferences}
            onBackgroundChange={onBackgroundChange}
            onForgetCredentials={forgetCredentials}
            onDisconnect={() => setDisconnectOpen(true)}
          />
        )
      default:
        return (
          <OverviewView
            dashboard={dashboard}
            liveAt={live.data?.fetchedAt}
            liveError={live.error}
            busyKey={busyKey}
            busyAction={busyAction}
            onCreateVm={() => setCreateOpen(true)}
            onNavigate={setView}
            onOpenVm={openVm}
            onAction={requestAction}
            onConsole={openConsole}
            onOpenTask={setTaskLog}
          />
        )
    }
  }

  const detailBusy = Boolean(selectedRef && busyKey === `${selectedRef.type}/${selectedRef.vmid}`)
  const initialNode = viewData?.nodes.find((node) => node.status === 'online')?.node ?? viewData?.nodes[0]?.node ?? ''

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      {backgrounds.app && (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url("${backgrounds.app}")` }}
          />
          <div className="pointer-events-none absolute inset-0 bg-background/[0.65]" />
        </>
      )}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <Titlebar
          session={session}
          dashboard={viewData}
          appVersion={bootstrap.appVersion}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
        <div className="flex min-h-0 flex-1">
          <Sidebar
            active={view}
            dashboard={viewData}
            session={session}
            theme={settings.theme}
            collapsed={settings.sidebarCollapsed}
            onToggleCollapsed={() => void toggleSidebar()}
            onNavigate={setView}
            onToggleTheme={toggleTheme}
            onDisconnect={() => setDisconnectOpen(true)}
          />
          <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto [overflow-anchor:none]">
            <div
              className={cn(
                'mx-auto w-full max-w-[1600px]',
                view === 'ai' ? 'h-full' : 'p-5 lg:p-6'
              )}
            >
              {error && data && (
                <div className="mb-4 flex items-center gap-3 border border-warning/30 bg-warning/[0.05] px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    最近一次同步失败：{error}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                    <RefreshCw className="h-3 w-3" />
                    重试
                  </Button>
                </div>
              )}

              {loading && !viewData ? (
                <ContentSkeleton />
              ) : !viewData && error ? (
                <Card>
                  <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center border border-destructive/35 bg-destructive/[0.05] text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="text-[13px] font-medium text-foreground">无法读取集群状态</div>
                    <p className="mt-1 max-w-md text-[12px] leading-5 text-muted-foreground">{error}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => void refresh()}>
                      <RefreshCw className="h-3 w-3" />
                      重试
                    </Button>
                  </div>
                </Card>
              ) : viewData ? (
                renderView(viewData)
              ) : null}
            </div>
          </main>
        </div>
      </div>

      <CreateVmDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        dashboard={viewData}
        initialNode={initialNode}
        onCreated={openCreatedVm}
        onRefresh={() => void refresh()}
      />

      <VmDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        vmRef={selectedRef}
        refreshToken={detailRefreshToken}
        actionBusy={detailBusy}
        busyAction={detailBusy ? busyAction : null}
        storages={viewData?.storages ?? []}
        nodes={(viewData?.nodes ?? [])
          .filter((node) => node.status === 'online')
          .map((node) => node.node)}
        onRefresh={() => {
          setDetailRefreshToken((value) => value + 1)
          void refresh()
        }}
        onAction={requestAction}
        onConsole={openConsole}
        onViewTask={setTaskLog}
      />

      <TaskLogDialog
        task={taskLog}
        open={Boolean(taskLog)}
        onOpenChange={(open) => {
          if (!open) setTaskLog(null)
        }}
      />

      <AlertDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setConfirmAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction ? `确认${VM_ACTION_LABELS[confirmAction.action]}？` : '确认操作'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction
                ? actionDescription(confirmAction.action, confirmAction.target.name)
                : '此操作会改变虚拟机的运行状态。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="border-y border-border bg-panel/30 px-5 py-2.5">
            <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
              <span className={`h-1.5 w-1.5 ${confirmAction?.action === 'stop' || confirmAction?.action === 'reset' ? 'bg-destructive' : 'bg-warning'}`} />
              {confirmAction?.target.node} / {confirmAction?.target.type.toUpperCase()} {confirmAction?.target.vmid}
            </div>
            <div className="mt-1 text-[12px] font-medium text-foreground">{confirmAction?.target.name}</div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmAction?.action === 'stop' || confirmAction?.action === 'reset' ? 'destructive' : 'default'}
              loading={actionBusy}
              onClick={(event) => {
                event.preventDefault()
                if (confirmAction) void executeAction(confirmAction.target, confirmAction.action)
              }}
            >
              {actionBusy && busyAction
                ? actionProgressLabel(busyAction)
                : `确认${confirmAction ? VM_ACTION_LABELS[confirmAction.action] : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={disconnectOpen}
        onOpenChange={(open) => {
          if (!disconnecting) setDisconnectOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>断开当前 PVE 会话？</AlertDialogTitle>
            <AlertDialogDescription>
              本地保存的凭据不会被删除。下次启动时如果启用了“记住凭据”，仍可自动连接。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>取消</AlertDialogCancel>
            <AlertDialogAction loading={disconnecting} onClick={(event) => {
              event.preventDefault()
              void disconnect()
            }}>
              断开连接
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster theme={settings.theme} />
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true)
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [backgrounds, setBackgrounds] = useState<BackgroundImages>({})
  const [session, setSession] = useState<SessionProfile | null>(null)
  const [loginError, setLoginError] = useState<ApiError | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootNonce, setBootNonce] = useState(0)

  useEffect(() => {
    applyAppearance(settings)
  }, [settings])

  useEffect(() => {
    // 其它窗口（控制台等）修改偏好时同步主题与字体。
    return window.pvevdi.onSettingsChanged((next) => setSettings(next))
  }, [])

  useEffect(() => {
    let cancelled = false
    setBooting(true)
    setBootError(null)
    unwrap(window.pvevdi.bootstrap())
      .then((result) => {
        if (cancelled) return
        setBootstrap(result)
        setSettings(result.settings)
        setBackgrounds(result.backgrounds)
        setSession(result.session)
        setLoginError(result.autoLoginError ?? null)
      })
      .catch((err) => {
        if (!cancelled) setBootError(errorDetail(err))
      })
      .finally(() => {
        if (!cancelled) setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [bootNonce])

  const handleAuthenticated = (result: LoginResult): void => {
    setSettings(result.settings)
    setBackgrounds(result.backgrounds)
    setSession(result.session)
    setLoginError(null)
  }

  const handleBackgroundChange = (result: BackgroundPickResult): void => {
    setSettings(result.settings)
    setBackgrounds(result.backgrounds)
  }

  const handleSessionLost = useCallback(async (message: string): Promise<void> => {
    try {
      const result = await window.pvevdi.logout(false)
      if (result.ok) setSettings(result.data)
    } finally {
      setSession(null)
      setLoginError({ code: 'AUTH_REQUIRED', message })
    }
  }, [])

  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      const result = await window.pvevdi.logout(false)
      if (result.ok) setSettings(result.data)
    } finally {
      setSession(null)
      setLoginError(null)
    }
  }, [])

  if (booting) return <BootScreen />
  if (bootError) return <BootFailure message={bootError} onRetry={() => setBootNonce((value) => value + 1)} />
  if (!settings) return <BootFailure message="应用设置尚未初始化。" onRetry={() => setBootNonce((value) => value + 1)} />

  if (!session || !bootstrap) {
    return (
      <TooltipProvider delayDuration={250}>
        <LoginView
          settings={settings}
          appVersion={bootstrap?.appVersion}
          initialError={loginError ?? undefined}
          loginBackground={backgrounds.login}
          onAuthenticated={handleAuthenticated}
        />
        <Toaster theme={settings.theme} />
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={250}>
      <ConnectedApp
        key={`${session.serverUrl}/${session.connectedAt}`}
        bootstrap={bootstrap}
        session={session}
        settings={settings}
        backgrounds={backgrounds}
        onSettingsChange={setSettings}
        onBackgroundChange={handleBackgroundChange}
        onLogout={handleLogout}
        onSessionLost={handleSessionLost}
      />
    </TooltipProvider>
  )
}
