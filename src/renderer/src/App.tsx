import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type {
  ApiError,
  AppSettings,
  BootstrapData,
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
import { WindowButtons } from '@renderer/components/layout/window-buttons'
import { BrandLockup } from '@renderer/components/brand'
import { Titlebar } from '@renderer/components/layout/titlebar'
import { Sidebar, type ViewKey } from '@renderer/components/layout/sidebar'
import { OverviewView } from '@renderer/components/views/overview-view'
import { VmsView } from '@renderer/components/views/vms-view'
import { NodesView } from '@renderer/components/views/nodes-view'
import { NodeSettingsView } from '@renderer/components/views/node-settings-view'
import { ClusterView } from '@renderer/components/views/cluster-view'
import { TasksView } from '@renderer/components/views/tasks-view'
import { SettingsView } from '@renderer/components/views/settings-view'
import { CreateVmDialog } from '@renderer/components/vms/create-vm-dialog'
import { VmDetailSheet } from '@renderer/components/vms/vm-detail-sheet'
import { TaskLogDialog } from '@renderer/components/tasks/task-log-dialog'
import { type ActionTarget, actionDescription } from '@renderer/components/vms/vm-actions'
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
import { EmptyIllustration } from '@renderer/components/common'
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
          <EmptyIllustration className="mb-3 h-10 w-10" />
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
  onSettingsChange: (settings: AppSettings) => void
  onLogout: () => Promise<void>
  onSessionLost: (message: string) => Promise<void>
}

function ConnectedApp({
  bootstrap,
  session,
  settings,
  onSettingsChange,
  onLogout,
  onSessionLost
}: ConnectedAppProps): React.JSX.Element {
  const [view, setView] = useState<ViewKey>('overview')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedRef, setSelectedRef] = useState<VmRef | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRefreshToken, setDetailRefreshToken] = useState(0)
  const [busyKey, setBusyKey] = useState<string | null>(null)
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

  const executeAction = async (target: ActionTarget, action: VmAction): Promise<void> => {
    const key = `${target.type}/${target.vmid}`
    setBusyKey(key)
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
    } catch (err) {
      toast.error('无法执行虚拟机操作', { description: errorDetail(err) })
    } finally {
      setBusyKey(null)
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

  const openConsole = async (target: ActionTarget): Promise<void> => {
    if (target.status && target.status !== 'running') {
      toast.error('虚拟机未运行', { description: '请先启动虚拟机，再打开控制台。' })
      return
    }
    const request: ConsoleOpenRequest = {
      kind: 'vm',
      node: target.node,
      type: target.type,
      vmid: target.vmid,
      name: target.name
    }
    try {
      await unwrap(window.pvevdi.openConsoleWindow(request))
    } catch (err) {
      toast.error('无法打开控制台窗口', { description: errorDetail(err) })
    }
  }

  const openNodeShell = async (node: string): Promise<void> => {
    try {
      await unwrap(window.pvevdi.openConsoleWindow({ kind: 'node', node, name: `节点 ${node}` }))
    } catch (err) {
      toast.error('无法打开终端窗口', { description: errorDetail(err) })
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

  const renderView = (dashboard: DashboardData): React.JSX.Element => {
    switch (view) {
      case 'vms':
        return (
          <VmsView
            dashboard={dashboard}
            busyKey={busyKey}
            onCreateVm={() => setCreateOpen(true)}
            onRefresh={() => void refresh()}
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
              onBack={() => setNodeSettingsNode(null)}
            />
          )
        }
        return (
          <NodesView
            dashboard={dashboard}
            liveAt={live.data?.fetchedAt}
            liveError={live.error}
            onCreateVm={() => setCreateOpen(true)}
            onRefresh={() => void refresh()}
            onNavigate={setView}
            onOpenShell={openNodeShell}
            onOpenSettings={setNodeSettingsNode}
          />
        )
      case 'cluster':
        return (
          <ClusterView
            dashboard={dashboard}
            onRefresh={() => void refresh()}
            onOpenTask={setTaskLog}
          />
        )
      case 'tasks':
        return (
          <TasksView
            dashboard={dashboard}
            onRefresh={() => void refresh()}
            onOpenTask={setTaskLog}
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
            onUpdatePreferences={updatePreferences}
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
            onCreateVm={() => setCreateOpen(true)}
            onRefresh={() => void refresh()}
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
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Titlebar session={session} dashboard={viewData} refreshing={refreshing} onRefresh={() => void refresh()} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          active={view}
          dashboard={viewData}
          session={session}
          theme={settings.theme}
          onNavigate={setView}
          onCreateVm={() => setCreateOpen(true)}
          onToggleTheme={toggleTheme}
          onDisconnect={() => setDisconnectOpen(true)}
        />
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto [overflow-anchor:none]">
          <div className="mx-auto w-full max-w-[1600px] p-5 lg:p-6">
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
              确认{confirmAction ? VM_ACTION_LABELS[confirmAction.action] : ''}
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
  const [session, setSession] = useState<SessionProfile | null>(null)
  const [loginError, setLoginError] = useState<ApiError | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootNonce, setBootNonce] = useState(0)

  useEffect(() => {
    applyAppearance(settings)
  }, [settings])

  useEffect(() => {
    let cancelled = false
    setBooting(true)
    setBootError(null)
    unwrap(window.pvevdi.bootstrap())
      .then((result) => {
        if (cancelled) return
        setBootstrap(result)
        setSettings(result.settings)
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
    setSession(result.session)
    setLoginError(null)
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
        onSettingsChange={setSettings}
        onLogout={handleLogout}
        onSessionLost={handleSessionLost}
      />
    </TooltipProvider>
  )
}
