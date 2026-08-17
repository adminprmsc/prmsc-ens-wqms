import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Copy,
  KeyRound,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  createUser,
  listUsers,
  resetUserPassword,
  setUserStatus,
  updateUser,
} from '@/lib/admin-api'
import { ApiError } from '@/lib/api'
import { copyTextToClipboard } from '@/lib/copy-to-clipboard'
import {
  USER_ROLE_LABELS,
  organizationForRole,
  type PublicUser,
  type UserRole,
} from '@/lib/types'
import { initials } from '@/lib/utils'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const roleOptions: UserRole[] = ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'USER']
const DEFAULT_PASSWORD = 'Root123!'

export function AdminUsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL')
  const [createOpen, setCreateOpen] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('USER')
  const [organization, setOrganization] = useState(organizationForRole('USER'))
  const [password, setPassword] = useState(DEFAULT_PASSWORD)
  const [autoGeneratePassword, setAutoGeneratePassword] = useState(false)
  const [creating, setCreating] = useState(false)

  const stats = useMemo(() => {
    const active = users.filter((user) => user.isActive).length
    return {
      total: users.length,
      active,
      inactive: users.length - active,
    }
  }, [users])

  function resetCreateForm() {
    setName('')
    setEmail('')
    setPassword(DEFAULT_PASSWORD)
    setAutoGeneratePassword(false)
    setRole('USER')
    setOrganization(organizationForRole('USER'))
  }

  function handleRoleChange(nextRole: UserRole) {
    setRole(nextRole)
    setOrganization(organizationForRole(nextRole))
  }

  function handleAutoGenerateChange(checked: boolean) {
    setAutoGeneratePassword(checked)
    setPassword(checked ? '' : DEFAULT_PASSWORD)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listUsers({
        search: search || undefined,
        role: roleFilter === 'ALL' ? undefined : roleFilter,
      })
      setUsers(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [search, roleFilter])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setNotice(null)
    setError(null)
    try {
      const result = await createUser({
        name,
        email,
        role,
        organization: organization || undefined,
        password: autoGeneratePassword ? undefined : password,
        autoGeneratePassword,
      })
      resetCreateForm()
      setCreateOpen(false)
      const message = `Created ${result.user.email}. Temporary password: ${result.initialPassword}`
      setNotice(message)
      toast.success('Account created', {
        description: result.user.email,
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(user: PublicUser) {
    setError(null)
    setNotice(null)
    try {
      await setUserStatus(user.id, !user.isActive)
      toast.success(
        user.isActive ? 'Account deactivated' : 'Account activated',
        { description: user.email },
      )
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status')
    }
  }

  async function onResetPassword(user: PublicUser) {
    setError(null)
    setNotice(null)
    try {
      const result = await resetUserPassword(user.id)
      setNotice(
        `Password reset for ${user.email}. Temporary password: ${result.temporaryPassword}`,
      )
      toast.success('Password reset', { description: user.email })
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to reset password',
      )
    }
  }

  async function onRoleChange(user: PublicUser, nextRole: UserRole) {
    if (nextRole === user.role) return
    setError(null)
    setNotice(null)
    try {
      await updateUser(user.id, { role: nextRole })
      toast.success('Role updated', { description: user.email })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update role')
    }
  }

  async function copyNotice() {
    if (!notice) return
    try {
      await copyTextToClipboard(notice)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            User management
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Provision Administrator, PRMSC Manager, and PCRWR User accounts.
            Control activation, credentials, and role assignment.
          </p>
        </div>
        <Button className="w-fit self-start" onClick={() => setCreateOpen(true)}>
          <Plus />
          Create user
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Directory</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {loading ? '—' : stats.total}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {loading ? '—' : stats.active}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Inactive</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {loading ? '—' : stats.inactive}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <Alert>
          <Shield />
          <AlertTitle>Credential issued</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{notice.split('Temporary password:')[0]}</span>
            {notice.includes('Temporary password:') ? (
              <Kbd>{notice.split('Temporary password:')[1]?.trim()}</Kbd>
            ) : null}
          </AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="icon-sm" onClick={() => void copyNotice()}>
              <Copy />
              <span className="sr-only">Copy</span>
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Search the directory or filter by assigned role.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? <Spinner /> : <RefreshCw />}
              Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <InputGroup className="sm:max-w-xs">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            <Select
              value={roleFilter}
              onValueChange={(value) => {
                if (value) setRoleFilter(value as UserRole | 'ALL')
              }}
            >
              <SelectTrigger className="w-full sm:max-w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All roles</SelectItem>
                {roleOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {USER_ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : users.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>No accounts match this view</EmptyTitle>
                <EmptyDescription>
                  Adjust the search or role filter, or create a new user.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12 text-right"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar size="sm">
                            <AvatarFallback>
                              {initials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {user.name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {user.email}
                            </div>
                            {user.organization ? (
                              <div className="text-xs text-muted-foreground">
                                {user.organization}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(value) => {
                            if (value) {
                              void onRoleChange(user, value as UserRole)
                            }
                          }}
                        >
                          <SelectTrigger className="min-w-[170px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {USER_ROLE_LABELS[option]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? 'secondary' : 'destructive'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                          >
                            <MoreHorizontal />
                            <span className="sr-only">Open actions</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => void toggleActive(user)}
                            >
                              {user.isActive ? <UserX /> : <UserCheck />}
                              {user.isActive ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => void onResetPassword(user)}
                            >
                              <KeyRound />
                              Reset password
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>
              Default password is Root123!. Optionally auto-generate a temporary
              password instead.
            </DialogDescription>
          </DialogHeader>
          <form
            id="create-user-form"
            className="grid gap-4"
            onSubmit={(e) => void onCreate(e)}
          >
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="name">Full name</FieldLabel>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="create-email">Email</FieldLabel>
                <Input
                  id="create-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>Role</FieldLabel>
                <Select
                  value={role}
                  onValueChange={(value) => {
                    if (value) handleRoleChange(value as UserRole)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {USER_ROLE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Organization</FieldLabel>
                <Select value={organization} disabled>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRMSC-HO">PRMSC-HO</SelectItem>
                    <SelectItem value="PCRWR">PCRWR</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  PRMSC roles map to PRMSC-HO. PCRWR User maps to PCRWR.
                </FieldDescription>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="create-password">Password</FieldLabel>
                <Input
                  id="create-password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  disabled={autoGeneratePassword}
                  placeholder={
                    autoGeneratePassword
                      ? 'Will be auto-generated'
                      : DEFAULT_PASSWORD
                  }
                  required={!autoGeneratePassword}
                />
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={autoGeneratePassword}
                    onCheckedChange={(checked) =>
                      handleAutoGenerateChange(Boolean(checked))
                    }
                  />
                  Auto-generate temporary password
                </label>
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="create-user-form" disabled={creating}>
              {creating ? <Spinner /> : <Plus />}
              {creating ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
