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
import type { SshServers } from './ssh'
import type {
  SshOpenShellInput,
  SshShellEvent,
  SshTargetOverride,
  SshWindowOpenRequest
} from '@shared/types'
import {
  createDirectory,
  createFile,
  downloadFile,
  listDirectory,
  readFile,
  removeEntry,
  renameEntry,
  uploadFile,
  writeFile
} from './ssh/sftp'
import { checkForUpdates } from './updates'
import type { DashboardNotifier } from './notifications'
import type { AiApproveInput, AiChatInput } from '@shared/types'
import { AiService } from './ai/service'

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
  servers?: SshServers
  notifier?: DashboardNotifier
  getWindow: () => BrowserWindow | null
  onSettingsChanged?: (settings: AppSettings) => void
  /** 交给 SSH 聚合层：关窗时回收虚拟机控制台桥 */
  onVmConsoleCloser?: (closer: (sessionId: string) => void) => void
}): void {
  const { manager, store, consoleWindows, getWindow, onSettingsChanged } = options
  const notifier = options.notifier
  const ssh = options.servers
  const ai = new AiService(manager, store)

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
      notifier?.reset()
      return { session, settings: store.get(), backgrounds: store.getBackgrounds() }
    })
  })

  ipcMain.handle(IPC.logout, async (_event, rawClearSaved: unknown) => {
    return wrap(async () => {
      consoleWindows.closeAll()
      manager.logout()
      notifier?.reset()
      ai.resetAll()
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

  ipcMain.handle(IPC.testNotification, async () => {
    return wrap(async () => {
      notifier?.sendTest()
    })
  })

  ipcMain.handle(IPC.aiChat, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      if (!manager.session) throw new Error('请先连接 PVE 再使用 AI 助手。')
      return ai.chat(asObject<AiChatInput>(rawInput))
    })
  })

  ipcMain.handle(IPC.aiApprove, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      if (!manager.session) throw new Error('请先连接 PVE 再使用 AI 助手。')
      return ai.approve(asObject<AiApproveInput>(rawInput))
    })
  })

  ipcMain.handle(IPC.aiReset, async (_event, rawId: unknown) => {
    return wrap(async () => {
      ai.reset(asString(rawId, '会话'))
    })
  })

  ipcMain.handle(IPC.aiTest, async () => {
    return wrap(async () => ai.test())
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
    return wrap(async () => {
      const dashboard = await manager.getDashboard()
      notifier?.observe(dashboard)
      return dashboard
    })
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
    return wrap(async () => {
      const input = asObject<CloudInitInput>(rawInput)
      const result = await manager.vmCloudInit(input)
      // PVE 的 GET config 不会回传 cipassword，自己写过的密码得缓存下来供客户机 SSH 用
      if (input.password && input.ref?.vmid) {
        store.saveCloudInitPassword(input.ref.vmid, input.password)
      }
      return result
    })
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

  /* ---------------------------------------------------------------- *
   * SSH：终端会话 + 文件管理
   * ---------------------------------------------------------------- */

  // 虚拟机终端会话随着 SSH 窗口关闭一起收掉
  options.onVmConsoleCloser?.((sessionId) => {
    ssh?.vmSessions.close(sessionId)
  })

  const requireSsh = (): SshServers => {
    if (!ssh) throw new Error('SSH 模块未初始化。')
    return ssh
  }

  // 会话输出推给所有订阅过的渲染进程；渲染端按 sessionId 过滤。
  // 终端输出按 12ms 合并成批，避免 `cat 大文件` / 串口启动日志把 IPC 打爆，
  // 这是 xterm 窗口一刷屏就卡死的主要诱因之一。
  if (ssh) {
    const send = (sshEvent: SshShellEvent): void => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.sshShellEvent, sshEvent)
      }
    }
    const pending = new Map<string, string>()
    let flushTimer: NodeJS.Timeout | null = null
    const flush = (): void => {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      if (pending.size === 0) return
      const batches = [...pending]
      pending.clear()
      for (const [sessionId, data] of batches) send({ type: 'data', sessionId, data })
    }
    const broadcast = (sshEvent: SshShellEvent): void => {
      if (sshEvent.type === 'data') {
        const next = (pending.get(sshEvent.sessionId) ?? '') + sshEvent.data
        pending.set(sshEvent.sessionId, next)
        // 单会话积压超过 256 KB 立即发，避免长时间不刷新
        if (next.length >= 256 * 1024) {
          flush()
          return
        }
        if (!flushTimer) flushTimer = setTimeout(flush, 12)
        return
      }
      // 退出事件必须排在它前面已经缓冲的数据之后
      flush()
      send(sshEvent)
    }
    ssh.shell.onEvent(broadcast)
    ssh.vmSessions.onEvent(broadcast)
  }

  ipcMain.handle(IPC.sshWindowOpen, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const servers = requireSsh()
      if (!servers.windows) throw new Error('SSH 窗口管理器未初始化。')
      servers.windows.open(rawInput ? asObject<SshWindowOpenRequest>(rawInput) : {})
    })
  })

  ipcMain.handle(IPC.sshWindowBootstrap, async (event) => {
    return wrap(async () => {
      const servers = requireSsh()
      if (!servers.windows) throw new Error('SSH 窗口管理器未初始化。')
      return servers.windows.bootstrap(event.sender.id)
    })
  })

  ipcMain.handle(IPC.sshProbe, async (_event, rawInput: unknown) => {
    return wrap(async () => requireSsh().probe(rawInput ? asObject<SshTargetOverride>(rawInput) : undefined))
  })

  ipcMain.handle(IPC.sshShellOpen, async (event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<SshOpenShellInput>(rawInput)
      const servers = requireSsh()

      /**
       * 虚拟机终端：
       *   - QEMU 已取消串口方案，统一走客户机 SSH 账号密码；
       *   - LXC 仍走容器 pty（termproxy），不依赖容器内 sshd。
       * 这样所有 QEMU 客户机（Windows / Linux / 其他）都用同一套 SSH 凭据。
       */
      if (input.vm) {
        const vm = input.vm
        const cols = Number(input.cols) || 100
        const rows = Number(input.rows) || 30

        if (vm.type === 'lxc') {
          const endpoint = await servers.manager.prepareVmTerminal({
            kind: 'vm',
            node: vm.node,
            type: vm.type,
            vmid: vm.vmid,
            name: vm.name,
            mode: 'xterm'
          })
          const info = await servers.vmSessions.open({
            node: vm.node,
            vmid: vm.vmid,
            type: vm.type,
            name: vm.name,
            cols,
            rows,
            backend: 'termproxy',
            wsUrl: endpoint.wsUrl,
            ticket: endpoint.ticket,
            user: endpoint.user,
            tls: servers.manager.consoleTlsOptions()
          })
          const session = {
            sessionId: info.sessionId,
            host: info.host,
            username: info.username || vm.node,
            title: input.title || info.title,
            createdAt: Date.now(),
            cols: info.cols,
            rows: info.rows,
            transport: info.backend
          }
          servers.windows?.bindSession(event.sender.id, session.sessionId)
          return session
        }

        const guestHost = input.guest?.host?.trim() || vm.guestHost
        if (!guestHost) {
          throw new Error(
            'QEMU 串口控制台已取消。请在弹出的「客户机 SSH 凭据」里填写虚拟机 IP、账号和密码；' +
              '如果不知道 IP，可先在客户机安装 Guest Agent 或手动用 ip addr / ipconfig 查看。'
          )
        }
        let guestTarget: ReturnType<typeof servers.guestTarget>
        try {
          guestTarget = servers.guestTarget({
            host: guestHost,
            port: input.guest?.port ?? vm.guestPort,
            username: input.guest?.username ?? vm.guestUser,
            password:
              input.guest?.password ??
              vm.guestPassword ??
              store.getCloudInitPassword(vm.vmid) ??
              undefined,
            ostype: vm.ostype
          })
        } catch (error) {
          throw new Error(
            error instanceof Error
              ? `${error.message}（打开终端窗口后点右上角钥匙图标填写）`
              : String(error)
          )
        }

        const info = await servers.vmSessions.open({
          node: vm.node,
          vmid: vm.vmid,
          type: vm.type,
          name: vm.name,
          cols,
          rows,
          backend: 'guest-ssh',
          guestTarget
        })
        const session = {
          sessionId: info.sessionId,
          host: info.host,
          username: info.username || vm.node,
          title: input.title || info.title,
          createdAt: Date.now(),
          cols: info.cols,
          rows: info.rows,
          transport: info.backend
        }
        servers.windows?.bindSession(event.sender.id, session.sessionId)
        return session
      }

      try {
        const target = servers.target(input.override)
        const session = await servers.shell.open({
          target,
          cols: Number(input.cols) || 100,
          rows: Number(input.rows) || 30,
          title: typeof input.title === 'string' ? input.title : undefined
        })

        // 记到发起窗口名下，窗口关掉时统一回收 PTY
        servers.windows?.bindSession(event.sender.id, session.sessionId)
        return { ...session, transport: 'ssh' as const }
      } catch (error) {
        /**
         * 节点 SSH 密码/密钥不可用时，退回 PVE 自己的 termproxy。
         * 这条通道只用 API ticket，不受节点 sshd 的 PermitRootLogin 限制；
         * 代价是没有 SFTP 文件面板（渲染端按 transport 隐藏）。
         */
        const node = input.node?.trim()
        if (!node) throw error
        try {
          const term = await servers.manager.prepareNodeTerminal(node)
          const info = await servers.vmSessions.open({
            node,
            vmid: 0,
            type: 'qemu',
            cols: Number(input.cols) || 100,
            rows: Number(input.rows) || 30,
            backend: 'termproxy',
            wsUrl: term.wsUrl,
            ticket: term.ticket,
            user: term.user,
            tls: servers.manager.consoleTlsOptions(),
            title:
              typeof input.title === 'string' && input.title.trim()
                ? input.title
                : `节点 ${node}`
          })
          const session = {
            sessionId: info.sessionId,
            host: info.host,
            username: info.username || 'root',
            title: info.title,
            createdAt: Date.now(),
            cols: info.cols,
            rows: info.rows,
            transport: 'termproxy' as const
          }
          servers.windows?.bindSession(event.sender.id, session.sessionId)
          return session
        } catch (fallbackError) {
          // 回退也失败时保留原始 SSH 报错，并附上 PVE 通道的原因
          const base = error instanceof Error ? error.message : String(error)
          const extra =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          throw new Error(`${base}；PVE 节点通道回退也失败：${extra}`)
        }
      }
    })
  })

  ipcMain.handle(IPC.sshShellList, async () => {
    return wrap(async () => requireSsh().shell.list())
  })

  ipcMain.handle(IPC.sshShellWrite, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ sessionId: string; data: string }>(rawInput)
      const sessionId = asString(input.sessionId, '会话')
      const servers = requireSsh()
      if (servers.vmSessions.write(sessionId, String(input.data ?? ''))) return
      servers.shell.write(sessionId, String(input.data ?? ''))
    })
  })

  ipcMain.handle(IPC.sshShellResize, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ sessionId: string; cols: number; rows: number }>(rawInput)
      const sessionId = asString(input.sessionId, '会话')
      const servers = requireSsh()
      const cols = Number(input.cols) || 100
      const rows = Number(input.rows) || 30
      if (servers.vmSessions.resize(sessionId, cols, rows)) return
      servers.shell.resize(sessionId, cols, rows)
    })
  })

  ipcMain.handle(IPC.sshShellClose, async (_event, rawSessionId: unknown) => {
    return wrap(async () => {
      const sessionId = asString(rawSessionId, '会话')
      const servers = requireSsh()
      if (servers.vmSessions.has(sessionId)) {
        servers.vmSessions.close(sessionId)
        return
      }
      servers.shell.close(sessionId)
    })
  })

  /**
   * 文件面板的目标：带 guest 就连虚拟机自己的 sshd，否则退回节点。
   * 客户机凭据不完整时给出明确报错，而不是静默连到节点上让人以为看错了目录。
   */
  function fsTarget(
    servers: SshServers,
    input: { override?: SshTargetOverride; guest?: SshTargetOverride }
  ) {
    if (input.guest?.host) {
      return servers.guestTarget({
        host: input.guest.host,
        port: input.guest.port,
        username: input.guest.username,
        password: input.guest.password
      })
    }
    return servers.target(input.override)
  }

  ipcMain.handle(IPC.sshFsList, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ override?: SshTargetOverride; path?: string }>(rawInput ?? {})
      const servers = requireSsh()
      return listDirectory(servers.pool, fsTarget(servers, input), input.path)
    })
  })

  ipcMain.handle(IPC.sshFsRead, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ override?: SshTargetOverride; path: string }>(rawInput)
      const servers = requireSsh()
      return readFile(servers.pool, fsTarget(servers, input), asString(input.path, '路径'))
    })
  })

  ipcMain.handle(IPC.sshFsWrite, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ override?: SshTargetOverride; path: string; content: string }>(rawInput)
      const servers = requireSsh()
      return writeFile(
        servers.pool,
        fsTarget(servers, input),
        asString(input.path, '路径'),
        String(input.content ?? '')
      )
    })
  })

  ipcMain.handle(IPC.sshFsCreateFile, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ override?: SshTargetOverride; path: string }>(rawInput)
      const servers = requireSsh()
      return createFile(servers.pool, fsTarget(servers, input), asString(input.path, '路径'))
    })
  })

  ipcMain.handle(IPC.sshFsCreateDir, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ override?: SshTargetOverride; path: string }>(rawInput)
      const servers = requireSsh()
      return createDirectory(servers.pool, fsTarget(servers, input), asString(input.path, '路径'))
    })
  })

  ipcMain.handle(IPC.sshFsRemove, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ override?: SshTargetOverride; path: string; recursive?: boolean }>(rawInput)
      const servers = requireSsh()
      return removeEntry(
        servers.pool,
        fsTarget(servers, input),
        asString(input.path, '路径'),
        Boolean(input.recursive)
      )
    })
  })

  ipcMain.handle(IPC.sshFsRename, async (_event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ override?: SshTargetOverride; from: string; to: string }>(rawInput)
      const servers = requireSsh()
      return renameEntry(
        servers.pool,
        fsTarget(servers, input),
        asString(input.from, '原路径'),
        asString(input.to, '新路径')
      )
    })
  })

  ipcMain.handle(IPC.sshFsUpload, async (event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ override?: SshTargetOverride; remoteDir: string; localPath?: string }>(rawInput)
      const servers = requireSsh()
      const target = fsTarget(servers, input)
      let localPath = input.localPath
      if (!localPath) {
        const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow()
        const picked = win
          ? await dialog.showOpenDialog(win, { properties: ['openFile'] })
          : await dialog.showOpenDialog({ properties: ['openFile'] })
        if (picked.canceled || picked.filePaths.length === 0) return null
        localPath = picked.filePaths[0]
      }
      return uploadFile(servers.pool, target, asString(input.remoteDir, '目录'), localPath)
    })
  })

  ipcMain.handle(IPC.sshFsDownload, async (event, rawInput: unknown) => {
    return wrap(async () => {
      const input = asObject<{ override?: SshTargetOverride; path: string }>(rawInput)
      const servers = requireSsh()
      const target = fsTarget(servers, input)
      const remotePath = asString(input.path, '路径')
      const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow()
      const suggested = path.posix.basename(remotePath)
      const picked = win
        ? await dialog.showSaveDialog(win, { defaultPath: suggested })
        : await dialog.showSaveDialog({ defaultPath: suggested })
      if (picked.canceled || !picked.filePath) return null
      return downloadFile(servers.pool, target, remotePath, picked.filePath)
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
