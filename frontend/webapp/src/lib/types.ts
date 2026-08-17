export type UserRole = 'SYSTEM_ADMIN' | 'SUPER_ADMIN' | 'USER'

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  SYSTEM_ADMIN: 'Administrator',
  SUPER_ADMIN: 'PRMSC Manager',
  USER: 'PCRWR User',
}

export const ORGANIZATION = {
  PRMSC: 'PRMSC-HO',
  PCRWR: 'PCRWR',
} as const

export type OrganizationName =
  (typeof ORGANIZATION)[keyof typeof ORGANIZATION]

/** SYSTEM_ADMIN / SUPER_ADMIN → PRMSC-HO; USER → PCRWR */
export function organizationForRole(role: UserRole): OrganizationName {
  return role === 'USER' ? ORGANIZATION.PCRWR : ORGANIZATION.PRMSC
}

export type PublicUser = {
  id: string
  name: string
  email: string
  role: UserRole
  organization: string | null
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export type AuditAction =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'ROLE_CHANGED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'REPORT_CREATED'
  | 'REPORT_UPDATED'
  | 'REPORT_SUBMITTED'
  | 'REPORT_APPROVED'
  | 'REPORT_REJECTED'

export type AuditLog = {
  id: string
  action: AuditAction
  actorId: string | null
  targetId: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  actor?: {
    id: string
    name: string
    email: string
    role: string
  } | null
  target?: {
    id: string
    name: string
    email: string
    role: string
  } | null
}

export type AccessControlRole = {
  role: UserRole
  label: string
  description: string
  permissions: string[]
}

export type LoginResponse = {
  accessToken: string
  user: PublicUser
}
