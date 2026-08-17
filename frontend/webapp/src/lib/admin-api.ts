import { apiRequest } from '@/lib/api'
import type {
  AccessControlRole,
  AuditLog,
  LoginResponse,
  PublicUser,
  UserRole,
} from '@/lib/types'

export function login(email: string, password: string) {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  })
}

export function fetchMe() {
  return apiRequest<PublicUser>('/auth/me')
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ user: PublicUser }>('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  })
}

export function listUsers(params?: {
  role?: UserRole
  search?: string
  isActive?: boolean
}) {
  const query = new URLSearchParams()
  if (params?.role) query.set('role', params.role)
  if (params?.search) query.set('search', params.search)
  if (params?.isActive !== undefined) {
    query.set('isActive', String(params.isActive))
  }
  const qs = query.toString()
  return apiRequest<PublicUser[]>(`/admin/users${qs ? `?${qs}` : ''}`)
}

export function createUser(input: {
  name: string
  email: string
  role: UserRole
  organization?: string
  password?: string
  autoGeneratePassword?: boolean
}) {
  return apiRequest<{ user: PublicUser; initialPassword: string }>(
    '/admin/users',
    { method: 'POST', body: input },
  )
}

export function updateUser(
  id: string,
  input: { name?: string; organization?: string; role?: UserRole },
) {
  return apiRequest<PublicUser>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

export function setUserStatus(id: string, isActive: boolean) {
  return apiRequest<PublicUser>(`/admin/users/${id}/status`, {
    method: 'PATCH',
    body: { isActive },
  })
}

export function resetUserPassword(id: string, password?: string) {
  return apiRequest<{ user: PublicUser; temporaryPassword: string }>(
    `/admin/users/${id}/reset-password`,
    { method: 'POST', body: password ? { password } : {} },
  )
}

export function listAuditLogs(params?: {
  action?: string
  targetId?: string
  limit?: number
  offset?: number
}) {
  const query = new URLSearchParams()
  if (params?.action) query.set('action', params.action)
  if (params?.targetId) query.set('targetId', params.targetId)
  if (params?.limit !== undefined) query.set('limit', String(params.limit))
  if (params?.offset !== undefined) query.set('offset', String(params.offset))
  const qs = query.toString()
  return apiRequest<{ items: AuditLog[]; total: number }>(
    `/admin/audit-logs${qs ? `?${qs}` : ''}`,
  )
}

export function fetchAccessControl() {
  return apiRequest<{ roles: AccessControlRole[] }>('/admin/access-control')
}
