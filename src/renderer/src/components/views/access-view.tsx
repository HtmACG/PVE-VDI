import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  UsersRound
} from 'lucide-react'
import type {
  AccessOverviewData,
  ApiError,
  DashboardData,
  PveAclEntry,
  PveGroup,
  PveRole,
  PveUser
} from '@shared/types'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/common'
import { cn } from '@renderer/lib/utils'
import { PveUnavailable } from './pve-unavailable'

type TabKey = 'users' | 'groups' | 'acl' | 'roles'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'users', label: '用户' },
  { key: 'groups', label: '用户组' },
  { key: 'acl', label: '权限' },
  { key: 'roles', label: '角色' }
]

interface UserFormState {
  userid: string
  password: string
  comment: string
  email: string
  groups: string[]
  enabled: boolean
  create: boolean
}

interface TokenFormState {
  userid: string
  tokenId: string
  comment: string
  privsep: boolean
}

interface AclFormState {
  path: string
  ugid: string
  roleid: string
  propagate: boolean
}

export function AccessView({ dashboard }: { dashboard: DashboardData }): React.JSX.Element {
  const [data, setData] = useState<AccessOverviewData | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<TabKey>('users')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const [userForm, setUserForm] = useState<UserFormState | null>(null)
  const [tokenForm, setTokenForm] = useState<TokenFormState | null>(null)
  const [aclForm, setAclForm] = useState<AclFormState | null>(null)
  const [groupForm, setGroupForm] = useState<{ groupid: string; comment: string } | null>(null)
  const [createdToken, setCreatedToken] = useState<{ fullTokenId: string; value: string } | null>(null)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.pvevdi.accessOverview()
    if (result.ok) {
      setData(result.data)
      setError(null)
    } else {
      setData(null)
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const users = data?.users ?? []
  const groups = data?.groups ?? []
  const acl = data?.acl ?? []
  const roles = data?.roles ?? []

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (user) =>
        user.userid.toLowerCase().includes(q) ||
        (user.comment ?? '').toLowerCase().includes(q) ||
        user.groups.join(',').toLowerCase().includes(q)
    )
  }, [query, users])

  const submitUser = async (): Promise<void> => {
    if (!userForm) return
    setFormError('')
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(@[A-Za-z0-9][A-Za-z0-9._-]*)?$/.test(userForm.userid.trim())) {
      setFormError('用户标识格式应形如 ops@pve。')
      return
    }
    setBusy('user')
    const result = await window.pvevdi.accessUserSave({
      userid: userForm.userid.trim(),
      password: userForm.password || undefined,
      comment: userForm.comment.trim() || undefined,
      email: userForm.email.trim() || undefined,
      groups: userForm.groups,
      enabled: userForm.enabled,
      create: userForm.create
    })
    setBusy(null)
    if (!result.ok) {
      setFormError(result.error.message)
      return
    }
    setUserForm(null)
    await load()
  }

  const submitToken = async (): Promise<void> => {
    if (!tokenForm) return
    setFormError('')
    if (!/^[a-z][a-z0-9.-]*$/.test(tokenForm.tokenId.trim())) {
      setFormError('令牌标识只能包含小写字母、数字、点与短横线。')
      return
    }
    setBusy('token')
    const result = await window.pvevdi.accessTokenSave({
      userid: tokenForm.userid,
      tokenId: tokenForm.tokenId.trim(),
      comment: tokenForm.comment.trim() || undefined,
      privsep: tokenForm.privsep,
      create: true
    })
    setBusy(null)
    if (!result.ok) {
      setFormError(result.error.message)
      return
    }
    setTokenForm(null)
    if (result.data) setCreatedToken({ fullTokenId: result.data.fullTokenId, value: result.data.value })
    await load()
  }

  const submitAcl = async (): Promise<void> => {
    if (!aclForm) return
    setFormError('')
    if (!aclForm.path.trim().startsWith('/')) {
      setFormError('路径必须以 / 开头。')
      return
    }
    if (!aclForm.ugid || !aclForm.roleid) {
      setFormError('请选择用户与角色。')
      return
    }
    setBusy('acl')
    const result = await window.pvevdi.accessAclUpdate({
      path: aclForm.path.trim(),
      ugid: aclForm.ugid,
      roleid: aclForm.roleid,
      propagate: aclForm.propagate
    })
    setBusy(null)
    if (!result.ok) {
      setFormError(result.error.message)
      return
    }
    setAclForm(null)
    await load()
  }

  const removeAcl = async (entry: PveAclEntry): Promise<void> => {
    setBusy(`acl:${entry.path}:${entry.ugid}`)
    const result = await window.pvevdi.accessAclUpdate({
      path: entry.path,
      ugid: entry.ugid,
      roleid: entry.roleid,
      propagate: entry.propagate,
      delete: true
    })
    setBusy(null)
    if (result.ok) await load()
  }

  const submitGroup = async (): Promise<void> => {
    if (!groupForm) return
    setFormError('')
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(groupForm.groupid.trim())) {
      setFormError('用户组标识格式无效。')
      return
    }
    setBusy('group')
    const result = await window.pvevdi.accessGroupSave({
      groupid: groupForm.groupid.trim(),
      comment: groupForm.comment.trim() || undefined,
      create: true
    })
    setBusy(null)
    if (!result.ok) {
      setFormError(result.error.message)
      return
    }
    setGroupForm(null)
    await load()
  }

  const removeUser = async (user: PveUser): Promise<void> => {
    setBusy(user.userid)
    const result = await window.pvevdi.accessUserDelete(user.userid)
    setBusy(null)
    if (result.ok) await load()
  }

  const removeGroup = async (group: PveGroup): Promise<void> => {
    setBusy(`group:${group.groupid}`)
    const result = await window.pvevdi.accessGroupDelete(group.groupid)
    setBusy(null)
    if (result.ok) await load()
  }

  const removeToken = async (user: PveUser, tokenId: string): Promise<void> => {
    setBusy(`${user.userid}!${tokenId}`)
    const result = await window.pvevdi.accessTokenDelete(user.userid, tokenId)
    setBusy(null)
    if (result.ok) await load()
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow={`${dashboard.cluster.name} 集群`} title="访问控制" description="用户、用户组、角色与 API 令牌。" />
        <PveUnavailable error={error} onRetry={() => void load()} />
      </div>
    )
  }

  const ugidOptions = [
    ...users.map((user) => ({ value: user.userid, label: user.userid })),
    ...groups.map((group) => ({ value: `@${group.groupid}`, label: `@${group.groupid}` }))
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${dashboard.cluster.name} 集群`}
        title="访问控制"
        description="管理 PVE 用户、用户组、API 令牌与路径级权限（ACL）。"
        actions={
          <Button variant="surface" loading={loading} onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        }
      />

      <div className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
        {[
          ['用户', users.length],
          ['用户组', groups.length],
          ['权限条目', acl.length],
          ['角色', roles.length]
        ].map(([label, value]) => (
          <div key={String(label)} className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0">
            <div className="text-[12px] text-muted-foreground">{label}</div>
            <div className="mt-1.5 font-mono text-[19px] text-foreground">{value}</div>
          </div>
        ))}
      </div>

      <div className="border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <div className="flex items-center border border-border">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  'flex h-8 items-center border-r border-border px-3 text-[12px] transition-colors last:border-r-0',
                  tab === item.key
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'users' && (
            <div className="relative w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索用户…"
                className="h-8 pl-8 text-[12px]"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {tab === 'users' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFormError('')
                  setUserForm({
                    userid: '',
                    password: '',
                    comment: '',
                    email: '',
                    groups: [],
                    enabled: true,
                    create: true
                  })
                }}
              >
                <UserPlus className="h-3 w-3" />
                新建用户
              </Button>
            )}
            {tab === 'groups' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFormError('')
                  setGroupForm({ groupid: '', comment: '' })
                }}
              >
                <Plus className="h-3 w-3" />
                新建用户组
              </Button>
            )}
            {tab === 'acl' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFormError('')
                  setAclForm({ path: '/', ugid: '', roleid: 'PVEAuditor', propagate: true })
                }}
              >
                <Plus className="h-3 w-3" />
                添加权限
              </Button>
            )}
          </div>
        </div>

        {tab === 'users' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left">
                <thead>
                  <tr className="border-b border-border bg-panel/30 text-[11px] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">用户</th>
                    <th className="px-3 py-2.5 font-medium">域</th>
                    <th className="px-3 py-2.5 font-medium">用户组</th>
                    <th className="px-3 py-2.5 font-medium">状态</th>
                    <th className="px-3 py-2.5 font-medium">令牌</th>
                    <th className="px-4 py-2.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.userid} className="border-b border-border/60 last:border-b-0 hover:bg-panel/40">
                      <td className="px-4 py-3">
                        <div className="font-mono text-[12px] text-foreground">{user.userid}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {user.comment || user.email || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{user.realmType}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {user.groups.length === 0 ? (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          ) : (
                            user.groups.map((group) => (
                              <Badge key={group} variant="outline">
                                {group}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={user.enabled ? 'success' : 'muted'}>{user.enabled ? '启用' : '停用'}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          {user.tokens.length === 0 ? (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          ) : (
                            user.tokens.map((token) => (
                              <span
                                key={token.tokenId}
                                className="group inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground"
                              >
                                <KeyRound className="h-2.5 w-2.5" />
                                {token.tokenId}
                                {token.privsep && <span className="text-warning">·权限分离</span>}
                                <button
                                  type="button"
                                  onClick={() => void removeToken(user, token.tokenId)}
                                  className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                  aria-label="删除令牌"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFormError('')
                              setTokenForm({ userid: user.userid, tokenId: '', comment: '', privsep: false })
                            }}
                          >
                            <KeyRound className="h-3 w-3" />
                            令牌
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFormError('')
                              setUserForm({
                                userid: user.userid,
                                password: '',
                                comment: user.comment ?? '',
                                email: user.email ?? '',
                                groups: user.groups,
                                enabled: user.enabled,
                                create: false
                              })
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            loading={busy === user.userid}
                            onClick={() => void removeUser(user)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredUsers.length === 0 && (
              <EmptyState title="没有用户" description="新建一个 PVE 用户后即可分配角色与权限。" />
            )}
          </>
        )}

        {tab === 'groups' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="border-b border-border bg-panel/30 text-[11px] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">用户组</th>
                  <th className="px-3 py-2.5 font-medium">成员</th>
                  <th className="px-3 py-2.5 font-medium">备注</th>
                  <th className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.groupid} className="border-b border-border/60 last:border-b-0 hover:bg-panel/40">
                    <td className="px-4 py-3 font-mono text-[12px] text-foreground">{group.groupid}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {group.users.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : (
                          group.users.map((user) => (
                            <Badge key={user} variant="outline">
                              {user}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-muted-foreground">{group.comment ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        loading={busy === `group:${group.groupid}`}
                        onClick={() => void removeGroup(group)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {groups.length === 0 && <EmptyState title="没有用户组" description="用户组便于批量复用同一套 ACL 权限。" />}
          </div>
        )}

        {tab === 'acl' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-border bg-panel/30 text-[11px] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">路径</th>
                  <th className="px-3 py-2.5 font-medium">对象</th>
                  <th className="px-3 py-2.5 font-medium">角色</th>
                  <th className="px-3 py-2.5 font-medium">传播</th>
                  <th className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {acl.map((entry) => (
                  <tr
                    key={`${entry.path}:${entry.ugid}:${entry.roleid}`}
                    className="border-b border-border/60 last:border-b-0 hover:bg-panel/40"
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-foreground">{entry.path}</td>
                    <td className="px-3 py-3">
                      <Badge variant={entry.type === 'group' ? 'info' : entry.type === 'token' ? 'warning' : 'outline'}>
                        {entry.ugid}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{entry.roleid}</td>
                    <td className="px-3 py-3 text-[11px] text-muted-foreground">{entry.propagate ? '是' : '否'}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        loading={busy === `acl:${entry.path}:${entry.ugid}`}
                        onClick={() => void removeAcl(entry)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {acl.length === 0 && (
              <EmptyState
                icon={<ShieldAlert className="h-5 w-5" />}
                title="没有权限条目"
                description="只有 root@pam 拥有全部权限时，ACL 列表通常为空。"
              />
            )}
          </div>
        )}

        {tab === 'roles' && (
          <div className="divide-y divide-border/60">
            {roles.map((role: PveRole) => (
              <div key={role.roleid} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-foreground">{role.roleid}</span>
                  {role.special && <Badge variant="warning">内置</Badge>}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{role.privs.length} 项权限</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {role.privs.map((priv) => (
                    <span key={priv} className="border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {priv}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {roles.length === 0 && (
              <EmptyState icon={<UsersRound className="h-5 w-5" />} title="没有角色" description="角色由 PVE 内置定义。" />
            )}
          </div>
        )}
      </div>

      {data && data.warnings.length > 0 && (
        <div className="border border-warning/40 bg-warning/5 px-4 py-2.5 text-[11px] text-muted-foreground">
          {data.warnings.join(' · ')}
        </div>
      )}

      <Dialog open={Boolean(userForm)} onOpenChange={(open) => !open && setUserForm(null)}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{userForm?.create ? '新建用户' : `编辑用户 · ${userForm?.userid}`}</DialogTitle>
            <DialogDescription>用户标识需带域后缀，例如 ops@pve 或 ops@pam。</DialogDescription>
          </DialogHeader>
          {userForm && (
            <DialogBody>
              <div className="space-y-1.5">
                <Label htmlFor="user-id">用户标识</Label>
                <Input
                  id="user-id"
                  value={userForm.userid}
                  disabled={!userForm.create}
                  onChange={(event) => setUserForm({ ...userForm, userid: event.target.value })}
                  className="font-mono"
                  placeholder="ops@pve"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-password">{userForm.create ? '密码' : '新密码（留空不修改）'}</Label>
                <Input
                  id="user-password"
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                  autoComplete="new-password"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="user-email">邮箱</Label>
                  <Input
                    id="user-email"
                    value={userForm.email}
                    onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user-comment">备注</Label>
                  <Input
                    id="user-comment"
                    value={userForm.comment}
                    onChange={(event) => setUserForm({ ...userForm, comment: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>所属用户组</Label>
                <div className="flex flex-wrap gap-1.5">
                  {groups.length === 0 && <span className="text-[11px] text-muted-foreground">尚未创建用户组</span>}
                  {groups.map((group) => {
                    const checked = userForm.groups.includes(group.groupid)
                    return (
                      <button
                        key={group.groupid}
                        type="button"
                        onClick={() =>
                          setUserForm({
                            ...userForm,
                            groups: checked
                              ? userForm.groups.filter((value) => value !== group.groupid)
                              : [...userForm.groups, group.groupid]
                          })
                        }
                        className={cn(
                          'border px-2 py-1 text-[11px] transition-colors',
                          checked
                            ? 'border-brand bg-brand/10 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        {group.groupid}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Switch
                  id="user-enabled"
                  checked={userForm.enabled}
                  onCheckedChange={(checked) => setUserForm({ ...userForm, enabled: checked })}
                />
                <Label htmlFor="user-enabled">启用该用户</Label>
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'user'} onClick={() => void submitUser()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(tokenForm)} onOpenChange={(open) => !open && setTokenForm(null)}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>创建 API 令牌</DialogTitle>
            <DialogDescription>{tokenForm ? `为用户 ${tokenForm.userid} 生成新的 API 令牌。` : ''}</DialogDescription>
          </DialogHeader>
          {tokenForm && (
            <DialogBody>
              <div className="space-y-1.5">
                <Label htmlFor="token-id">令牌标识</Label>
                <Input
                  id="token-id"
                  value={tokenForm.tokenId}
                  onChange={(event) => setTokenForm({ ...tokenForm, tokenId: event.target.value })}
                  className="font-mono"
                  placeholder="automation"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="token-comment">备注</Label>
                <Input
                  id="token-comment"
                  value={tokenForm.comment}
                  onChange={(event) => setTokenForm({ ...tokenForm, comment: event.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="token-privsep"
                  checked={tokenForm.privsep}
                  onCheckedChange={(checked) => setTokenForm({ ...tokenForm, privsep: checked })}
                />
                <Label htmlFor="token-privsep">权限分离（需单独授予 ACL）</Label>
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'token'} onClick={() => void submitToken()}>
              生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(createdToken)} onOpenChange={(open) => !open && setCreatedToken(null)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>令牌已创建</DialogTitle>
            <DialogDescription>密钥只显示这一次，关闭后无法再次查看。</DialogDescription>
          </DialogHeader>
          {createdToken && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label>令牌标识</Label>
                <div className="border border-border bg-panel/40 px-3 py-2 font-mono text-[11px] text-foreground">
                  {createdToken.fullTokenId}
                </div>
              </div>
              <div className="space-y-1">
                <Label>密钥（Secret）</Label>
                <div className="select-all break-all border border-brand/40 bg-brand/5 px-3 py-2 font-mono text-[11px] text-foreground">
                  {createdToken.value || '（PVE 未返回密钥）'}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedToken(null)}>我已保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(aclForm)} onOpenChange={(open) => !open && setAclForm(null)}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>添加权限</DialogTitle>
            <DialogDescription>为指定路径上的用户或用户组授予角色。</DialogDescription>
          </DialogHeader>
          {aclForm && (
            <DialogBody>
              <div className="space-y-1.5">
                <Label htmlFor="acl-path">路径</Label>
                <Input
                  id="acl-path"
                  value={aclForm.path}
                  onChange={(event) => setAclForm({ ...aclForm, path: event.target.value })}
                  className="font-mono"
                  placeholder="/vms/100"
                />
              </div>
              <div className="space-y-1.5">
                <Label>用户 / 用户组</Label>
                <Select value={aclForm.ugid} onValueChange={(value) => setAclForm({ ...aclForm, ugid: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择对象" />
                  </SelectTrigger>
                  <SelectContent>
                    {ugidOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>角色</Label>
                <Select value={aclForm.roleid} onValueChange={(value) => setAclForm({ ...aclForm, roleid: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.roleid} value={role.roleid}>
                        {role.roleid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="acl-propagate"
                  checked={aclForm.propagate}
                  onCheckedChange={(checked) => setAclForm({ ...aclForm, propagate: checked })}
                />
                <Label htmlFor="acl-propagate">向子路径传播</Label>
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAclForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'acl'} onClick={() => void submitAcl()}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(groupForm)} onOpenChange={(open) => !open && setGroupForm(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>新建用户组</DialogTitle>
            <DialogDescription>用户组可复用同一套 ACL 授权。</DialogDescription>
          </DialogHeader>
          {groupForm && (
            <DialogBody>
              <div className="space-y-1.5">
                <Label htmlFor="group-id">组标识</Label>
                <Input
                  id="group-id"
                  value={groupForm.groupid}
                  onChange={(event) => setGroupForm({ ...groupForm, groupid: event.target.value })}
                  className="font-mono"
                  placeholder="ops"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-comment">备注</Label>
                <Input
                  id="group-comment"
                  value={groupForm.comment}
                  onChange={(event) => setGroupForm({ ...groupForm, comment: event.target.value })}
                />
              </div>
              {formError && <div className="text-[11px] text-destructive">{formError}</div>}
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupForm(null)}>
              取消
            </Button>
            <Button loading={busy === 'group'} onClick={() => void submitGroup()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
