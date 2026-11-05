import { app } from 'electron'
import { gt, valid } from 'semver'
import type { UpdateCheckResult } from '@shared/types'
import { GITHUB_REPOSITORY } from '@shared/app-info'

interface GithubRelease {
  tag_name?: string
  name?: string
  body?: string
  html_url?: string
  published_at?: string
  draft?: boolean
  prerelease?: boolean
}

interface GithubTag {
  name?: string
}

const GITHUB_API = 'https://api.github.com'
const RELEASE_URL = `https://github.com/${GITHUB_REPOSITORY}/releases`

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': `PVE-VDI/${app.getVersion()}`
    },
    signal: AbortSignal.timeout(12_000)
  })
  if (response.status === 403) throw new Error('GitHub API 请求频率受限，请稍后再试。')
  if (!response.ok) throw new Error(`GitHub 返回 HTTP ${response.status}。`)
  return (await response.json()) as T
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function isNewer(latest: string, current: string): boolean {
  const normalizedLatest = valid(normalizeVersion(latest))
  const normalizedCurrent = valid(normalizeVersion(current))
  return normalizedLatest && normalizedCurrent ? gt(normalizedLatest, normalizedCurrent) : false
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  let latestVersion = currentVersion
  let releaseUrl = RELEASE_URL
  let publishedAt: string | undefined
  let notes: string | undefined
  let source: UpdateCheckResult['source'] = 'none'

  let releases: GithubRelease[] = []
  try {
    releases = await fetchJson<GithubRelease[]>(`/repos/${GITHUB_REPOSITORY}/releases?per_page=10`)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('HTTP 404')) throw error
  }

  const release = releases.find((entry) => !entry.draft && !entry.prerelease && entry.tag_name)
  if (release?.tag_name) {
    latestVersion = normalizeVersion(release.tag_name)
    releaseUrl = release.html_url || RELEASE_URL
    publishedAt = release.published_at
    notes = release.body?.trim() || undefined
    source = 'release'
  } else {
    const tags = await fetchJson<GithubTag[]>(`/repos/${GITHUB_REPOSITORY}/tags?per_page=30`)
    const versions = tags
      .map((tag) => tag.name)
      .filter((name): name is string => Boolean(name))
      .map((name) => normalizeVersion(name))
      .filter((name) => Boolean(valid(name)))
      .sort((left, right) => (gt(left, right) ? -1 : gt(right, left) ? 1 : 0))
    if (versions[0]) {
      latestVersion = versions[0]
      source = 'tag'
    }
  }

  return {
    currentVersion,
    latestVersion,
    hasUpdate: isNewer(latestVersion, currentVersion),
    releaseUrl,
    publishedAt,
    notes,
    source,
    checkedAt: Date.now()
  }
}
