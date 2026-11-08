import type { IconType } from 'react-icons'
import { FaWindows } from 'react-icons/fa6'
import {
  siAlmalinux,
  siAlpinelinux,
  siArchlinux,
  siCentos,
  siDebian,
  siFedora,
  siFreebsd,
  siGentoo,
  siKalilinux,
  siLinux,
  siNixos,
  siOpensuse,
  siRedhat,
  siRockylinux,
  siUbuntu
} from 'simple-icons'
import type { OsFamily, VmOsInfo } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import proxmoxLogo from '@renderer/assets/proxmox-logo.png'

const BRAND_ICONS: Partial<Record<OsFamily, { path: string; hex: string }>> = {
  ubuntu: siUbuntu,
  debian: siDebian,
  arch: siArchlinux,
  alpine: siAlpinelinux,
  fedora: siFedora,
  rocky: siRockylinux,
  alma: siAlmalinux,
  centos: siCentos,
  opensuse: siOpensuse,
  redhat: siRedhat,
  kali: siKalilinux,
  nixos: siNixos,
  gentoo: siGentoo,
  freebsd: siFreebsd,
  linux: siLinux
}

const WINDOWS_ICON: IconType = FaWindows

export function OsIcon({
  os,
  size = 'md',
  className
}: {
  os: VmOsInfo
  size?: 'sm' | 'md' | 'lg'
  className?: string
}): React.JSX.Element {
  const dimensions = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'
  const glyph = size === 'sm' ? 12 : size === 'lg' ? 20 : 16
  const label = `${os.name}${os.version ? ` ${os.version}` : ''}`
  const brand = BRAND_ICONS[os.family]
  const WindowIcon = WINDOWS_ICON

  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        dimensions,
        className
      )}
    >
      {os.family === 'windows' ? (
        <WindowIcon size={glyph} color="#4AA4F8" aria-hidden="true" />
      ) : brand ? (
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" aria-hidden="true">
          <path d={brand.path} fill={brand.hex === '000000' ? 'currentColor' : `#${brand.hex}`} />
        </svg>
      ) : (
        <img
          src={proxmoxLogo}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-[72%] w-[72%] object-contain"
        />
      )}
    </span>
  )
}
