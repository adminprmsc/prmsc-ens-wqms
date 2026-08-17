import type { UserRole } from '@/lib/types'

export function homePathForRole(role: UserRole): string {
  switch (role) {
    case 'SYSTEM_ADMIN':
      return '/admin/users'
    case 'SUPER_ADMIN':
      return '/manager'
    case 'USER':
      return '/pcrwr'
    default:
      return '/login'
  }
}

export function pcrwrFieldDataPath() {
  return '/pcrwr/field-data'
}

export function pcrwrEditReportPath(reportId: string) {
  return `/pcrwr/field-data/${reportId}`
}

export function pcrwrRecordsPath(status?: string) {
  if (!status || status === 'ALL') return '/pcrwr/records'
  return `/pcrwr/records?status=${encodeURIComponent(status)}`
}

export function isEditableReportStatus(status: string) {
  return status === 'DRAFT' || status === 'REJECTED'
}
