import type { OsFamily, VmOsInfo, VmType } from '@shared/types'

type Raw = Record<string, unknown>

function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return fallback
}

interface FamilyDefinition {
  family: Exclude<OsFamily, 'windows' | 'linux' | 'other'>
  label: string
  aliases: string[]
}

const LINUX_FAMILIES: FamilyDefinition[] = [
  { family: 'ubuntu', label: 'Ubuntu', aliases: ['ubuntu'] },
  { family: 'debian', label: 'Debian', aliases: ['debian'] },
  { family: 'arch', label: 'Arch Linux', aliases: ['archlinux', 'arch linux', 'arch'] },
  { family: 'alpine', label: 'Alpine Linux', aliases: ['alpinelinux', 'alpine linux', 'alpine'] },
  { family: 'fedora', label: 'Fedora', aliases: ['fedora'] },
  { family: 'rocky', label: 'Rocky Linux', aliases: ['rockylinux', 'rocky linux'] },
  { family: 'alma', label: 'AlmaLinux', aliases: ['almalinux', 'alma linux'] },
  { family: 'centos', label: 'CentOS', aliases: ['centos'] },
  { family: 'opensuse', label: 'openSUSE', aliases: ['opensuse', 'suse linux', 'suse'] },
  { family: 'redhat', label: 'Red Hat Enterprise Linux', aliases: ['red hat', 'redhat', 'rhel'] },
  { family: 'kali', label: 'Kali Linux', aliases: ['kalilinux', 'kali linux', 'kali'] },
  { family: 'nixos', label: 'NixOS', aliases: ['nixos'] },
  { family: 'gentoo', label: 'Gentoo', aliases: ['gentoo'] },
  { family: 'freebsd', label: 'FreeBSD', aliases: ['freebsd'] }
]

const WINDOWS_OSTYPES: Record<string, string> = {
  win11: 'Windows 11',
  win10: 'Windows 10',
  win8: 'Windows 8',
  win7: 'Windows 7',
  winxp: 'Windows XP',
  wxp: 'Windows XP',
  wvista: 'Windows Vista',
  w2k: 'Windows 2000',
  w2k3: 'Windows Server 2003',
  w2k8: 'Windows Server 2008',
  win2k: 'Windows 2000',
  win2k3: 'Windows Server 2003',
  win2k8: 'Windows Server 2008',
  win2k12: 'Windows Server 2012',
  win2k16: 'Windows Server 2016',
  win2k19: 'Windows Server 2019',
  win2k22: 'Windows Server 2022',
  win2k25: 'Windows Server 2025'
}

function matchFamily(value: string, source: VmOsInfo['source']): VmOsInfo | null {
  const normal = value.toLowerCase()
  if (!normal.trim()) return null

  if (/\bwindows\b|\bwin(?:dows)?[-\s]?(?:xp|7|8|10|11|server)\b|\bwin\d+\b/.test(normal)) {
    return { family: 'windows', name: 'Windows', source }
  }
  for (const definition of LINUX_FAMILIES) {
    for (const alias of definition.aliases) {
      if (alias === 'arch') {
        if (/(^|[^a-z])arch([^a-z]|$)/.test(normal)) {
          return { family: definition.family, name: definition.label, source }
        }
      } else if (new RegExp(`(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(normal)) {
        return { family: definition.family, name: definition.label, source }
      }
    }
  }
  if (/\blinux\b|\bgnu\/linux\b/.test(normal)) {
    return { family: 'linux', name: 'Linux', source }
  }
  return null
}

export function inferOsFromText(value: string): VmOsInfo | null {
  return matchFamily(value, 'name')
}

function osFromWindowsOstype(ostype: string): VmOsInfo | null {
  const label = WINDOWS_OSTYPES[ostype]
  if (!label) return null
  return {
    family: 'windows',
    name: label,
    source: 'ostype'
  }
}

function readAgentPayload(raw: unknown): Raw {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Raw) : {}
  const result = value.result
  return result && typeof result === 'object' && !Array.isArray(result) ? (result as Raw) : value
}

export function detectVmOs(type: VmType, config: Raw, fallbackName: string): VmOsInfo {
  const ostype = text(config.ostype).toLowerCase()
  const name = text(config.name, fallbackName)
  const description = text(config.description)
  const tags = Array.isArray(config.tags) ? config.tags.map((tag) => text(tag)).join(' ') : text(config.tags)
  const hintText = `${name} ${description} ${tags} ${ostype}`

  if (type === 'qemu') {
    const windows = osFromWindowsOstype(ostype)
    if (windows) return windows

    const inferred = inferOsFromText(hintText)
    if (inferred) return inferred

    if (ostype === 'l26' || ostype === 'l24') {
      return { family: 'linux', name: 'Linux', source: 'default' }
    }
    return { family: 'other', name: '未知系统', source: 'default' }
  }

  const fromOstype = inferOsFromText(ostype)
  if (fromOstype) return { ...fromOstype, source: 'ostype' }

  const inferred = inferOsFromText(hintText)
  if (inferred) return inferred

  return { family: 'linux', name: 'Linux', source: 'default' }
}

export function detectAgentOs(raw: unknown): VmOsInfo | null {
  const payload = readAgentPayload(raw)
  if (!Object.keys(payload).length) return null
  const id = text(payload.id)
  const pretty = text(payload['pretty-name'])
  const name = text(payload.name)
  const version = text(payload.version) || text(payload['version-id'])
  const combined = `${id} ${pretty} ${name}`.toLowerCase()

  let family: VmOsInfo | null = null
  if (combined.includes('windows') || combined.includes('microsoft')) {
    family = { family: 'windows', name: pretty || 'Windows', source: 'agent' }
  } else {
    const matched = matchFamily(combined, 'agent')
    if (matched) family = matched
  }
  if (!family) return null
  return {
    ...family,
    name: family.family === 'windows' ? family.name : family.name,
    version: version || undefined,
    source: 'agent'
  }
}

export function agentEnabledFromConfig(config: Raw): boolean {
  const value = config.agent
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    return value === '1' || value.startsWith('1,') || value === 'enabled'
  }
  return false
}

export function isGenericLinuxOs(os: VmOsInfo): boolean {
  return os.family === 'linux' || os.family === 'other'
}
