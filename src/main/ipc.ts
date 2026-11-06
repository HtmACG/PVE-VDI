import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IPC } from '@shared/ipc'
import type {
  AccessAclInput,
  AccessGroupInput,
  AccessTokenInput,
  AccessUserInput,
  ApiResult,
  AppSettings,
  AptRepository,
  BackupJobInput,
  BootstrapData,
  CloneVmInput,
  CloudInitInput,
  ConsoleOpenRequest,
  CreateVmInput,
  ClusterJoinInput,
  DiskInitInput,
  FirewallAliasInput,
  FirewallOptionsInput,
  FirewallRuleInput,
  FirewallScope,
  HaGroupInput,
  HaResourceInput,
  IsoUploadInput,
  IsoUrlInput,
  LoginInput,
  MigrateInput,
  NodeDnsSettings,
  NodeAptAction,
  NodeCertificateUpload,
  NodeNetworkInput,
  PoolInput,
  PoolMemberInput,
  PreferencesPatch,
  RestoreBackupInput,
  SdnSubnetInput,
  SdnVnetInput,
  SdnZoneInput,
  SnapshotInput,
  StartBackupInput,
  StorageDefinitionInput,
  TaskListQuery,
  TemplateInput,
  VmAction,
  VmConfigPatchInput,
  VmDiskAddInput,
  VmDiskRemoveInput,
  VmDiskResizeInput,
  VmRef,
  VmSendKeyInput
} from '@shared/types'
import { toApiError } from './pve/client'
import { PveManager } from './pve/service'
import { SettingsStore } from './settings'
import type { ConsoleWindowManager } from './console-windows'
import { checkForUpdates } from './updates'

function wrap<T>(operation: () => Promise<T>): Promise<ApiResult<T>> {
  return operation()
    .then((data) => ({ ok: true as const, data }))
    .catch((error) => {
      console.error('IPC operation failed:', error)
      return { ok: false as const, error: toApiError(error) }
    })
}

function asObject<T>(value: unknown): T {
  if (!value || typeof value !== 'object') {
    throw new Error('请求参数无效。')
  }
  return value as T
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label}参数无效。`)
  }
  return value
}

function asConsoleRequest(raw: unknown): ConsoleOpenRequest {
  const input = asObject<ConsoleOpenRequest>(raw)
  if (typeof input.node !== 'string' || !input.node || (input.kind !== 'vm' && input.kind !== 'node')) {
    throw new Error('控制台参数无效。')
  }
  return input
}

export function registerIpc(options: {
  manager: PveManager
  store: SettingsStore
  consoleWindows: ConsoleWindowManager
  getWindow: () => BrowserWindow | null
  onSettingsChanged?: (settings: AppSettings) => void
}): void {
  const { manager, store, consoleWindows, getWindow, onSettingsChanged } = options

  ipcMain.handle(IPC.bootstrap, async (): Promise<ApiResult<BootstrapData>> => {
    return wrap(async () => {
      let autoLoginError
      if (!manager.session) {
        const saved = store.get()
        const password = store.getSavedPassword()
        if (saved.rememberPassword && password) {
          try {
            await manager.login({
              serverUrl: saved.serverUrl,
              username: saved.username,
              password,
              rememberPassword: saved.rememberPassword,
              allowSelfSigned: saved.allowSelfSigned
            })
          } catch (error) {
            autoLoginError = toApiError(error)
          }
        }
      }
      return {
        settings: store.get(),
        session: manager.session,
        backgrounds: store.getBackgrounds(),
        autoLoginError,
        appVersion: app.getVersion(),
        platform: process.platform,
        electronVersion: process.versions.electron
      }
    })
  })

  ipcMain.handle(IPC.login, async (_event, raw: unknown) => {
    return wrap(async () => {
      const input = asObject<LoginInput>(raw)
      if (
        typeof input.serverUrl !== 'string' ||
        typeof input.username !== 'string' ||
        typeof input.password !== 'string' ||
        typeof input.rememberPassword !== 'boolean' ||
        typeof input.allowSelfSigned !== 'boolean'
      ) {
        throw new Error('登录参数无效。')
      }
      const session = await manager.login(input)
      store.recordLogin(input, session)
      return { session, settings: store.get(), backgrounds: store.getBackgrounds() }
    })
  })

  ipcMain.handle(IPC.logout, async (_event, rawClearSaved: unknown) => {
    return wrap(async () => {
      consoleWindows.closeAll()
      manager.logout()
      if (rawClearSaved === true) store.forgetCredentials()
      return store.get()
    })
  })

  ipcMain.handle(IPC.updatePreferences, async (_event, rawPatch: unknown) => {
    return wrap(async () => {
      const patch = asObject<PreferencesPatch>(rawPatch)
      const settings = store.updatePreferences(patch)
      onSettingsChanged?.(settings)
      return settings
    })
  })

  ipcMain.handle(IPC.forgetCredentials, async () => {
    return wrap(async () => store.forgetCredentials())
  })

  ipcMain.handle(IPC.pickBackground, async (_event, rawKind: unknown) => {
    return wrap(async () => {
      if (rawKind !== 'login' && rawKind !== 'app') throw new Error('背景类型无效。')
      const win = getWindow()
      const options = {
        title: rawKind === 'login' ? '选择登录页背景' : '选择软件背景',
        properties: ['openFile'] as Array<'openFile'>,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return null
      const backgrounds = store.setBackground(rawKind, result.filePaths[0])
      return { settings: store.get(), backgrounds }
    })
  })

  ipcMain.handle(IPC.clearBackground, async (_event, rawKind: unknown) => {
    return wrap(async () => {
      if (rawKind !== 'login' && rawKind !== 'app') throw new Error('背景类型无效。')
      const backgrounds = store.clearBackground(rawKind)
      return { settings: store.get(), backgrounds }
    })
  })

  ipcMain.handle(IPC.dashboard, async () => {
    return wrap(async () => manager.getDashboard())
  })

  ipcMain.handle(IPC.liveMetrics, async () => {
    return wrap(async () => manager.getLiveMetrics())
  })

  ipcMain.handle(IPC.nodeSettings, async (_event, rawNode: unknown) => {
    return wrap(async () => manager.getNodeSettings(typeof rawNode === 'string' ? rawNode : ''))
  })

  ipcMain.handle(IPC.nodeHardware, async (_event, rawNode: unknown, rawRefresh: unknown) => {
    return wrap(async () =>
      manager.getNodeHardware(typeof rawNode === 'string' ? rawNode : '', rawRefresh === true)
    )
  })

  ipcMain.handle(IPC.isoImages, async (_event, rawNode: unknown) => {
    return wrap(async () => manager.getIsoImages(typeof rawNode === 'string' ? rawNode : ''))
  })

  ipcMain.handle(IPC.pickIsoFile, async () => {
    return wrap(async () => {
      const win = getWindow()
      const options = {
        title: '选择 ISO 镜像',
        properties: ['openFile'] as Array<'openFile'>,
        filters: [{ name: 'ISO 镜像', extensions: ['iso', 'img'] }]
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return null
      const filePath = result.filePaths[0]
      const stat = fs.statSync(filePath)
      return { path: filePath, name: path.basename(filePath), size: stat.size }
    })
  })

  ipcMain.handle(IPC.uploadIso, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.uploadIso(asObject<IsoUploadInput>(rawInput)))
  })

  ipcMain.handle(IPC.importIsoUrl, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.importIsoUrl(asObject<IsoUrlInput>(rawInput)))
  })

  ipcMain.handle(IPC.deleteIso, async (_event, rawNode: unknown, rawStorage: unknown, rawVolid: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawStorage !== 'string' || typeof rawVolid !== 'string') {
        throw new Error('ISO 参数无效。')
      }
      await manager.deleteIso(rawNode, rawStorage, rawVolid)
    })
  })

  ipcMain.handle(IPC.nodeNetworkSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveNodeNetwork(asObject<NodeNetworkInput>(rawInput)))
  })

  ipcMain.handle(IPC.nodeNetworkDelete, async (_event, rawNode: unknown, rawIface: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawIface !== 'string') {
        throw new Error('网络接口参数无效。')
      }
      await manager.deleteNodeNetwork(rawNode, rawIface)
    })
  })

  ipcMain.handle(IPC.nodeNetworkApply, async (_event, rawNode: unknown) => {
    return wrap(async () => manager.applyNodeNetwork(typeof rawNode === 'string' ? rawNode : ''))
  })

  ipcMain.handle(IPC.nodeNetworkRevert, async (_event, rawNode: unknown) => {
    return wrap(async () => {
      await manager.revertNodeNetwork(typeof rawNode === 'string' ? rawNode : '')
    })
  })

  ipcMain.handle(IPC.nodeDnsUpdate, async (_event, rawNode: unknown, rawSettings: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string') throw new Error('节点参数无效。')
      await manager.updateNodeDns(rawNode, asObject<NodeDnsSettings>(rawSettings))
    })
  })

  ipcMain.handle(IPC.nodeTimeUpdate, async (_event, rawNode: unknown, rawTimezone: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawTimezone !== 'string') throw new Error('时间参数无效。')
      await manager.updateNodeTime(rawNode, rawTimezone)
    })
  })

  ipcMain.handle(IPC.nodeOptionsUpdate, async (_event, rawNode: unknown, rawDescription: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawDescription !== 'string') throw new Error('节点配置参数无效。')
      await manager.updateNodeOptions(rawNode, rawDescription)
    })
  })

  ipcMain.handle(IPC.nodeLogs, async (_event, rawNode: unknown, rawKind: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || (rawKind !== 'syslog' && rawKind !== 'firewall')) {
        throw new Error('日志参数无效。')
      }
      return manager.getNodeLogs(rawNode, rawKind)
    })
  })

  ipcMain.handle(IPC.checkUpdates, async () => {
    return wrap(async () => checkForUpdates())
  })

  ipcMain.handle(IPC.openExternal, async (_event, rawUrl: unknown) => {
    return wrap(async () => {
      if (typeof rawUrl !== 'string') throw new Error('链接参数无效。')
      const url = new URL(rawUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'mailto:') {
        throw new Error('仅允许打开 HTTPS 或邮件链接。')
      }
      await shell.openExternal(url.toString())
    })
  })

  ipcMain.handle(IPC.vmDetail, async (_event, rawRef: unknown) => {
    return wrap(async () => manager.getVmDetail(asObject<VmRef>(rawRef)))
  })

  ipcMain.handle(IPC.vmAction, async (_event, rawRef: unknown) => {
    return wrap(async () => {
      const ref = asObject<VmRef & { action: VmAction }>(rawRef)
      return manager.vmAction(ref)
    })
  })

  ipcMain.handle(IPC.vmConfigUpdate, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.vmConfigUpdate(asObject<VmConfigPatchInput>(rawInput)))
  })

  ipcMain.handle(IPC.vmDiskAdd, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.vmDiskAdd(asObject<VmDiskAddInput>(rawInput)))
  })

  ipcMain.handle(IPC.vmDiskResize, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.vmDiskResize(asObject<VmDiskResizeInput>(rawInput)))
  })

  ipcMain.handle(IPC.vmDiskRemove, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.vmDiskRemove(asObject<VmDiskRemoveInput>(rawInput)))
  })

  ipcMain.handle(IPC.createOptions, async (_event, rawNode: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || !rawNode) throw new Error('请选择节点。')
      return manager.getCreateOptions(rawNode)
    })
  })

  ipcMain.handle(IPC.createVm, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.createVm(asObject<CreateVmInput>(rawInput)))
  })

  ipcMain.handle(IPC.cloneVm, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.cloneVm(asObject<CloneVmInput>(rawInput)))
  })

  ipcMain.handle(IPC.taskLog, async (_event, rawNode: unknown, rawUpid: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawUpid !== 'string') {
        throw new Error('任务参数无效。')
      }
      return manager.taskLog(rawNode, rawUpid)
    })
  })

  ipcMain.handle(IPC.taskStatus, async (_event, rawNode: unknown, rawUpid: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawUpid !== 'string') {
        throw new Error('任务参数无效。')
      }
      return manager.taskStatus(rawNode, rawUpid)
    })
  })

  ipcMain.handle(IPC.taskList, async (_event, rawQuery: unknown) => {
    return wrap(async () => manager.taskList(rawQuery === undefined ? undefined : asObject<TaskListQuery>(rawQuery)))
  })

  ipcMain.handle(IPC.taskStop, async (_event, rawNode: unknown, rawUpid: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawUpid !== 'string') {
        throw new Error('任务参数无效。')
      }
      return manager.taskStop(rawNode, rawUpid)
    })
  })

  ipcMain.handle(IPC.taskDelete, async (_event, rawNode: unknown, rawUpid: unknown) => {
    return wrap(async () => {
      if (typeof rawNode !== 'string' || typeof rawUpid !== 'string') {
        throw new Error('任务参数无效。')
      }
      return manager.taskDelete(rawNode, rawUpid)
    })
  })

  ipcMain.handle(IPC.subscriptionInfo, async (_event, rawNode: unknown) => {
    return wrap(async () => manager.subscriptionInfo(asString(rawNode, '节点')))
  })

  ipcMain.handle(IPC.subscriptionUpdate, async (_event, rawNode: unknown, rawKey: unknown) => {
    return wrap(async () => manager.subscriptionUpdate(asString(rawNode, '节点'), asString(rawKey, '订阅密钥')))
  })

  ipcMain.handle(IPC.subscriptionDelete, async (_event, rawNode: unknown) => {
    return wrap(async () => manager.subscriptionDelete(asString(rawNode, '节点')))
  })

  ipcMain.handle(IPC.nodeApt, async (_event, rawNode: unknown) => {
    return wrap(async () => manager.nodeApt(asString(rawNode, '节点')))
  })

  ipcMain.handle(IPC.nodeAptRefresh, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.nodeAptRefresh(asObject<NodeAptAction>(rawInput)))
  })

  ipcMain.handle(IPC.nodeAptRepoSave, async (_event, rawNode: unknown, rawRepos: unknown) => {
    return wrap(async () => {
      if (!Array.isArray(rawRepos)) throw new Error('仓库配置格式无效。')
      return manager.nodeAptRepoSave(asString(rawNode, '节点'), rawRepos as AptRepository[])
    })
  })

  ipcMain.handle(IPC.nodeCertificate, async (_event, rawNode: unknown) => {
    return wrap(async () => manager.nodeCertificate(asString(rawNode, '节点')))
  })

  ipcMain.handle(IPC.nodeCertificateUpload, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.nodeCertificateUpload(asObject<NodeCertificateUpload>(rawInput)))
  })

  ipcMain.handle(IPC.nodeCertificateReset, async (_event, rawNode: unknown) => {
    return wrap(async () => manager.nodeCertificateReset(asString(rawNode, '节点')))
  })

  ipcMain.handle(IPC.sdnOverview, async () => {
    return wrap(async () => manager.getSdnOverview())
  })

  ipcMain.handle(IPC.sdnZoneSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveSdnZone(asObject<SdnZoneInput>(rawInput)))
  })

  ipcMain.handle(IPC.sdnVnetSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveSdnVnet(asObject<SdnVnetInput>(rawInput)))
  })

  ipcMain.handle(IPC.sdnSubnetSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveSdnSubnet(asObject<SdnSubnetInput>(rawInput)))
  })

  ipcMain.handle(IPC.sdnApply, async (_event, rawRevert: unknown) => {
    return wrap(async () => manager.applySdn(rawRevert === true))
  })

  ipcMain.handle(IPC.clusterJoinInfo, async () => {
    return wrap(async () => manager.getClusterJoinInfo())
  })

  ipcMain.handle(IPC.clusterJoin, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.joinCluster(asObject<ClusterJoinInput>(rawInput)))
  })

  ipcMain.handle(IPC.clusterNodeRemove, async (_event, rawNode: unknown) => {
    return wrap(async () => manager.removeClusterNode(asString(rawNode, '节点')))
  })

  ipcMain.handle(IPC.diskInit, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.initDisk(asObject<DiskInitInput>(rawInput)))
  })

  ipcMain.handle(IPC.accessOverview, async () => {
    return wrap(async () => manager.getAccessOverview())
  })

  ipcMain.handle(IPC.accessUserSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveAccessUser(asObject<AccessUserInput>(rawInput)))
  })

  ipcMain.handle(IPC.accessUserDelete, async (_event, rawUserid: unknown) => {
    return wrap(async () => {
      if (typeof rawUserid !== 'string') throw new Error('用户参数无效。')
      await manager.deleteAccessUser(rawUserid)
    })
  })

  ipcMain.handle(IPC.accessGroupSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveAccessGroup(asObject<AccessGroupInput>(rawInput)))
  })

  ipcMain.handle(IPC.accessGroupDelete, async (_event, rawGroupid: unknown) => {
    return wrap(async () => {
      if (typeof rawGroupid !== 'string') throw new Error('用户组参数无效。')
      await manager.deleteAccessGroup(rawGroupid)
    })
  })

  ipcMain.handle(IPC.accessAclUpdate, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.updateAccessAcl(asObject<AccessAclInput>(rawInput)))
  })

  ipcMain.handle(IPC.accessTokenSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveAccessToken(asObject<AccessTokenInput>(rawInput)))
  })

  ipcMain.handle(IPC.accessTokenDelete, async (_event, rawUserid: unknown, rawTokenId: unknown) => {
    return wrap(async () => {
      if (typeof rawUserid !== 'string' || typeof rawTokenId !== 'string') {
        throw new Error('令牌参数无效。')
      }
      await manager.deleteAccessToken(rawUserid, rawTokenId)
    })
  })

  ipcMain.handle(IPC.storageOverview, async () => {
    return wrap(async () => manager.getStorageOverview())
  })

  ipcMain.handle(
    IPC.storageContents,
    async (_event, rawNode: unknown, rawStorage: unknown, rawContent: unknown) => {
      return wrap(async () => {
        if (typeof rawNode !== 'string' || typeof rawStorage !== 'string') {
          throw new Error('存储参数无效。')
        }
        return manager.getStorageContents(rawNode, rawStorage, typeof rawContent === 'string' && rawContent ? rawContent : undefined)
      })
    }
  )

  ipcMain.handle(IPC.storageDefinitionSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveStorageDefinition(asObject<StorageDefinitionInput>(rawInput)))
  })

  ipcMain.handle(
    IPC.storageContentDelete,
    async (_event, rawNode: unknown, rawStorage: unknown, rawVolid: unknown) => {
      return wrap(async () => {
        if (typeof rawNode !== 'string' || typeof rawStorage !== 'string' || typeof rawVolid !== 'string') {
          throw new Error('存储卷参数无效。')
        }
        return manager.deleteStorageContent(rawNode, rawStorage, rawVolid)
      })
    }
  )

  ipcMain.handle(IPC.poolSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.savePool(asObject<PoolInput>(rawInput)))
  })

  ipcMain.handle(IPC.poolMemberUpdate, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.updatePoolMembers(asObject<PoolMemberInput>(rawInput)))
  })

  ipcMain.handle(IPC.backupOverview, async () => {
    return wrap(async () => manager.getBackupOverview())
  })

  ipcMain.handle(IPC.backupStart, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.startBackup(asObject<StartBackupInput>(rawInput)))
  })

  ipcMain.handle(IPC.backupJobSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveBackupJob(asObject<BackupJobInput>(rawInput)))
  })

  ipcMain.handle(IPC.backupRestore, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.restoreBackup(asObject<RestoreBackupInput>(rawInput)))
  })

  ipcMain.handle(IPC.firewallOverview, async (_event, rawScope: unknown) => {
    return wrap(async () => manager.getFirewallOverview(asObject<FirewallScope>(rawScope)))
  })

  ipcMain.handle(IPC.firewallRuleSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveFirewallRule(asObject<FirewallRuleInput>(rawInput)))
  })

  ipcMain.handle(IPC.firewallOptionsSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveFirewallOptions(asObject<FirewallOptionsInput>(rawInput)))
  })

  ipcMain.handle(IPC.firewallAliasSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveFirewallAlias(asObject<FirewallAliasInput>(rawInput)))
  })

  ipcMain.handle(IPC.haOverview, async () => {
    return wrap(async () => manager.getHaOverview())
  })

  ipcMain.handle(IPC.haResourceSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveHaResource(asObject<HaResourceInput>(rawInput)))
  })

  ipcMain.handle(IPC.haGroupSave, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.saveHaGroup(asObject<HaGroupInput>(rawInput)))
  })

  ipcMain.handle(IPC.vmSnapshot, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.vmSnapshot(asObject<SnapshotInput>(rawInput)))
  })

  ipcMain.handle(IPC.vmMigrate, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.vmMigrate(asObject<MigrateInput>(rawInput)))
  })

  ipcMain.handle(IPC.vmTemplate, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.vmTemplate(asObject<TemplateInput>(rawInput)))
  })

  ipcMain.handle(IPC.vmCloudInit, async (_event, rawInput: unknown) => {
    return wrap(async () => manager.vmCloudInit(asObject<CloudInitInput>(rawInput)))
  })

  ipcMain.handle(IPC.vmSendKey, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      await manager.vmSendKey(asObject<VmSendKeyInput>(rawInput))
    })
  })

  ipcMain.handle(IPC.consoleWindowOpen, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      if (!manager.session) throw new Error('请先连接 PVE。')
      consoleWindows.open(asConsoleRequest(rawInput))
    })
  })

  ipcMain.handle(IPC.consoleWindowBootstrap, async (event) => {
    return wrap(async () => consoleWindows.bootstrap(event.sender.id))
  })

  ipcMain.handle(IPC.consoleOpen, async (event, rawInput: unknown) => {
    return wrap(async () => {
      const session = await manager.openConsole(asConsoleRequest(rawInput))
      consoleWindows.bindSession(event.sender.id, session.sessionId)
      return session
    })
  })

  ipcMain.handle(IPC.consoleClose, async (event, rawSessionId: unknown) => {
    return wrap(async () => {
      if (typeof rawSessionId !== 'string' || !rawSessionId) {
        throw new Error('控制台会话无效。')
      }
      manager.closeConsole(rawSessionId)
      consoleWindows.unbindSession(event.sender.id, rawSessionId)
    })
  })

  ipcMain.on(IPC.windowMinimize, (event) => {
    ;(BrowserWindow.fromWebContents(event.sender) ?? getWindow())?.minimize()
  })

  ipcMain.on(IPC.windowHide, (event) => {
    ;(BrowserWindow.fromWebContents(event.sender) ?? getWindow())?.hide()
  })

  ipcMain.on(IPC.windowToggleMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on(IPC.windowClose, (event) => {
    ;(BrowserWindow.fromWebContents(event.sender) ?? getWindow())?.close()
  })

  ipcMain.handle(IPC.windowGetState, (event) => {
    return { maximized: (BrowserWindow.fromWebContents(event.sender) ?? getWindow())?.isMaximized() ?? false }
  })
}
