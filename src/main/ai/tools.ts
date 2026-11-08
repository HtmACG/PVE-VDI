import type { AiToolRisk } from '@shared/types'
import type { PveManager } from '../pve/service'
import type { ProviderTool } from './provider'

/**
 * Agent 能用的 PVE 工具。
 *
 * 边界刻意收得很窄：只读查询 + 电源操作 + 创建快照；
 * 不提供删除、磁盘、网络、防火墙、用户、Shell 等能力。
 * 真正的鉴权仍由 PVE 用户权限兜底，这里只是模型可触达面的白名单。
 */

export interface AgentTool {
  name: string
  title: string
  risk: AiToolRisk
  definition: ProviderTool
  summarize: (args: Record<string, unknown>) => string
  execute: (manager: PveManager, args: Record<string, unknown>) => Promise<unknown>
}

function argNumber(args: Record<string, unknown>, key: string): number {
  const value = Number(args[key])
  if (!Number.isInteger(value) || value <= 0) throw new Error(`参数 ${key} 必须是正整数。`)
  return value
}

function argString(args: Record<string, unknown>, key: string, max = 200): string {
  const value = typeof args[key] === 'string' ? args[key].trim() : ''
  if (!value) throw new Error(`参数 ${key} 不能为空。`)
  return value.slice(0, max)
}

async function resolveVm(manager: PveManager, vmid: number) {
  const dashboard = await manager.getDashboard()
  const vm = dashboard.vms.find((item) => item.vmid === vmid)
  if (!vm) throw new Error(`没有找到 VMID ${vmid} 的虚拟机/容器。`)
  return vm
}

const POWER_ACTIONS = ['start', 'shutdown', 'stop', 'reboot', 'suspend', 'resume'] as const
type PowerAction = (typeof POWER_ACTIONS)[number]

function powerRisk(action: string): AiToolRisk {
  return action === 'stop' || action === 'reset' ? 'danger' : 'write'
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_cluster_overview',
    title: '查询集群概览',
    risk: 'read',
    definition: {
      type: 'function',
      function: {
        name: 'get_cluster_overview',
        description:
          '读取 PVE 集群当前状态：集群名、节点在线状态、虚拟机/容器列表、存储、运行中任务。回答资源、运行状态问题时优先调用。',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    summarize: () => '读取集群节点、虚拟机、存储与任务概览',
    execute: async (manager) => {
      const dashboard = await manager.getDashboard()
      return {
        cluster: {
          name: dashboard.cluster.name,
          quorate: dashboard.cluster.quorate,
          nodeCount: dashboard.cluster.nodeCount
        },
        nodeCount: dashboard.nodes.length,
        nodes: dashboard.nodes.map((node) => ({
          node: node.node,
          status: node.status,
          cpu: node.cpu,
          maxcpu: node.maxcpu,
          mem: node.mem,
          maxmem: node.maxmem,
          uptime: node.uptime
        })),
        vms: dashboard.vms.slice(0, 120).map((vm) => ({
          vmid: vm.vmid,
          name: vm.name,
          type: vm.type,
          node: vm.node,
          status: vm.status,
          cpu: vm.cpu,
          mem: vm.mem,
          maxmem: vm.maxmem,
          uptime: vm.uptime,
          tags: vm.tags
        })),
        storages: dashboard.storages.map((storage) => ({
          storage: storage.storage,
          node: storage.node,
          type: storage.type,
          status: storage.status,
          used: storage.used,
          total: storage.total,
          avail: storage.avail
        })),
        tasks: {
          running: dashboard.tasks.filter((task) => task.status === 'running').length,
          recent: dashboard.tasks.slice(0, 10).map((task) => ({
            upid: task.upid,
            node: task.node,
            type: task.type,
            status: task.status,
            user: task.user,
            startTime: task.startTime
          }))
        }
      }
    }
  },
  {
    name: 'get_vm_detail',
    title: '查询虚拟机详情',
    risk: 'read',
    definition: {
      type: 'function',
      function: {
        name: 'get_vm_detail',
        description: '按 VMID 读取单台虚拟机/容器的运行状态、配置摘要、磁盘与快照。',
        parameters: {
          type: 'object',
          properties: {
            vmid: { type: 'integer', description: '虚拟机或容器的 VMID' }
          },
          required: ['vmid'],
          additionalProperties: false
        }
      }
    },
    summarize: (args) => `读取 VMID ${String(args.vmid ?? '?')} 的详情`,
    execute: async (manager, args) => {
      const vmid = argNumber(args, 'vmid')
      const vm = await resolveVm(manager, vmid)
      const detail = await manager.getVmDetail({ node: vm.node, type: vm.type, vmid })
      const config = detail.config as Record<string, unknown>
      return {
        vmid,
        name: detail.name,
        node: vm.node,
        type: vm.type,
        os: detail.os,
        runtime: detail.runtime,
        config: {
          ostype: config.ostype,
          cores: config.cores,
          sockets: config.sockets,
          memory: config.memory,
          balloon: config.balloon,
          onboot: config.onboot,
          agent: config.agent,
          ciuser: config.ciuser,
          serial0: config.serial0,
          vga: config.vga
        },
        disks: detail.disks.map((disk) => ({
          key: disk.key,
          size: disk.size,
          storage: disk.storage
        })),
        snapshots: detail.snapshots.map((snapshot) => ({
          name: snapshot.name,
          description: snapshot.description,
          snaptime: snapshot.snaptime
        }))
      }
    }
  },
  {
    name: 'list_tasks',
    title: '查询任务列表',
    risk: 'read',
    definition: {
      type: 'function',
      function: {
        name: 'list_tasks',
        description: '列出最近的 PVE 任务，可只看失败任务，用于排查操作结果。',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'integer', description: '返回条数，默认 15，最大 50' },
            errorsOnly: { type: 'boolean', description: '只看失败任务' }
          },
          additionalProperties: false
        }
      }
    },
    summarize: (args) => `读取最近 ${String(args.limit ?? 15)} 条任务`,
    execute: async (manager, args) => {
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 15))
      const tasks = await manager.taskList({ limit, errorsOnly: args.errorsOnly === true })
      return {
        tasks: tasks.tasks.map((task) => ({
          upid: task.upid,
          node: task.node,
          type: task.type,
          status: task.status,
          rawStatus: task.rawStatus,
          user: task.user,
          startTime: task.startTime,
          endTime: task.endTime,
          duration: task.duration
        }))
      }
    }
  },
  {
    name: 'get_task_log',
    title: '读取任务日志',
    risk: 'read',
    definition: {
      type: 'function',
      function: {
        name: 'get_task_log',
        description: '读取某个任务（UPID）的输出日志，最多返回 80 行，用于说明失败原因。',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: '任务所在节点名' },
            upid: { type: 'string', description: 'PVE 任务 UPID' }
          },
          required: ['node', 'upid'],
          additionalProperties: false
        }
      }
    },
    summarize: (args) => `读取任务日志 ${String(args.upid ?? '').slice(0, 60)}`,
    execute: async (manager, args) => {
      const node = argString(args, 'node', 80)
      const upid = argString(args, 'upid', 400)
      const lines = await manager.taskLog(node, upid)
      return { lines: lines.slice(-80) }
    }
  },
  {
    name: 'vm_power_action',
    title: '虚拟机电源操作',
    risk: 'write',
    definition: {
      type: 'function',
      function: {
        name: 'vm_power_action',
        description:
          '对虚拟机/容器执行电源操作。start=启动，shutdown=ACPI 关机，stop=强制停止，reboot=重启，suspend=挂起，resume=恢复。stop 会直接断电，必须向用户说明后果。',
        parameters: {
          type: 'object',
          properties: {
            vmid: { type: 'integer', description: '虚拟机或容器 VMID' },
            action: {
              type: 'string',
              enum: [...POWER_ACTIONS],
              description: '电源动作'
            }
          },
          required: ['vmid', 'action'],
          additionalProperties: false
        }
      }
    },
    summarize: (args) => `对 VMID ${String(args.vmid ?? '?')} 执行 ${String(args.action ?? '')}`,
    execute: async (manager, args) => {
      const vmid = argNumber(args, 'vmid')
      const action = String(args.action ?? '') as PowerAction
      if (!POWER_ACTIONS.includes(action)) throw new Error(`不支持的电源动作：${action}`)
      const vm = await resolveVm(manager, vmid)
      const result = await manager.vmAction({
        node: vm.node,
        type: vm.type,
        vmid,
        action
      })
      return {
        vmid,
        name: vm.name,
        action,
        upid: result.upid,
        message: result.message
      }
    }
  },
  {
    name: 'vm_snapshot_create',
    title: '创建虚拟机快照',
    risk: 'write',
    definition: {
      type: 'function',
      function: {
        name: 'vm_snapshot_create',
        description: '给虚拟机/容器创建快照，不包含内存状态。快照名称必须简短且唯一。',
        parameters: {
          type: 'object',
          properties: {
            vmid: { type: 'integer', description: '虚拟机或容器 VMID' },
            name: { type: 'string', description: '快照名称，1-40 个字符' },
            description: { type: 'string', description: '可选描述' }
          },
          required: ['vmid', 'name'],
          additionalProperties: false
        }
      }
    },
    summarize: (args) => `为 VMID ${String(args.vmid ?? '?')} 创建快照 ${String(args.name ?? '')}`,
    execute: async (manager, args) => {
      const vmid = argNumber(args, 'vmid')
      const name = argString(args, 'name', 40)
      const description = typeof args.description === 'string' ? args.description.slice(0, 200) : undefined
      const vm = await resolveVm(manager, vmid)
      const result = await manager.vmSnapshot({
        ref: { node: vm.node, type: vm.type, vmid },
        name,
        description
      })
      return { vmid, name, upid: result.upid, message: result.message }
    }
  }
]

export function toolByName(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name)
}

export function toolDefinitions(): ProviderTool[] {
  return AGENT_TOOLS.map((tool) => tool.definition)
}

export function riskForCall(name: string, args: Record<string, unknown>): AiToolRisk {
  if (name === 'vm_power_action') return powerRisk(String(args.action ?? ''))
  return toolByName(name)?.risk ?? 'danger'
}
