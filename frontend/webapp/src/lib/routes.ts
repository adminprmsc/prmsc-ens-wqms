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

export function managerReportsPath(params?: {
  status?: string
  tehsilId?: string
  villageId?: string
  reportId?: string
}) {
  if (params?.reportId) return `/manager/reports/${params.reportId}`
  const query = new URLSearchParams()
  if (params?.status && params.status !== 'ALL') query.set('status', params.status)
  if (params?.tehsilId) query.set('tehsilId', params.tehsilId)
  if (params?.villageId) query.set('villageId', params.villageId)
  const qs = query.toString()
  return `/manager/reports${qs ? `?${qs}` : ''}`
}

export function managerReviewPath(reportId: string) {
  return `/manager/reports/${reportId}`
}

export function managerMonitoringPath(params?: {
  tehsilId?: string
  villageId?: string
}) {
  const query = new URLSearchParams()
  if (params?.tehsilId) query.set('tehsilId', params.tehsilId)
  if (params?.villageId) query.set('villageId', params.villageId)
  const qs = query.toString()
  return `/manager/operations${qs ? `?${qs}` : ''}`
}

export function isEditableReportStatus(status: string) {
  return status === 'DRAFT' || status === 'REJECTED'
}
