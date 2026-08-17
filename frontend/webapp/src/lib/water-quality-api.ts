import { ApiError, apiRequest, apiUpload, getAccessToken } from '@/lib/api'
import type { WaterQualityReportInput } from '@/lib/water-quality-schema'

export type WaterQualityParameter = {
  id: string
  code: string
  name: string
  category: string
  conformityGroup: string
  sortOrder: number
  units: string | null
  limitDisplay: string
  qualitativeAllowed: string[]
  includedInPriority: boolean
  limitOperator: string
}

export type WaterQualitySourceType = {
  id: string
  code: string
  name: string
  category: 'SOURCE_WELL' | 'POU_TAP' | 'OHR'
  aliases: string[]
  sortOrder: number
  isActive: boolean
}

export type WaterQualityReportSummary = {
  id: string
  reportSerialNo: string
  sampleType: string
  sourceLabel: string | null
  siteName: string | null
  sourceType: {
    id: string
    code: string
    name: string
    category: string
  }
  reportCategory: string
  formType: string
  status: string
  physicalConformity: string
  chemicalConformity: string
  traceConformity: string | null
  microbialConformity: string
  overallRemarks: string | null
  reportingDate: string
  samplingAt: string
  tehsil: { id: string; name: string }
  village: { id: string; name: string }
  settlement: { id: string; name: string } | null
  createdBy: { id: string; name: string; email: string } | null
  _count: { results: number }
}

export type WaterQualityReportDetail = WaterQualityReportSummary & {
  nwqlSampleCode: string | null
  customerCode: string | null
  customerName: string
  customerAddress: string | null
  customerPhone: string | null
  locationDetail: string
  workOrder: string | null
  sourceLabel: string | null
  documentTehsilName: string | null
  documentVillageName: string | null
  siteName: string | null
  gpsLatitude: string | null
  gpsLongitude: string | null
  samplingAt: string
  receivedAt: string | null
  receiptTempC: string | null
  receiptHumidityPct: string | null
  analysisFrom: string | null
  analysisTo: string | null
  totalPages: number | null
  termsAgreed: boolean
  rejectionReason: string | null
  results: Array<{
    id: string
    resultType: string
    numericValue: string | null
    qualitativeValue: string | null
    exceedsLimit: boolean
    isJudged: boolean
    limitDisplaySnap: string
    parameter: WaterQualityParameter
  }>
}

function emptyToUndefined<T extends Record<string, unknown>>(input: T) {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    output[key] = value === '' || value === null ? undefined : value
  }
  return output
}

export function listParameters(formType?: 'PRIORITY' | 'FULL') {
  const qs = formType ? `?formType=${formType}` : ''
  return apiRequest<WaterQualityParameter[]>(`/water-quality/parameters${qs}`)
}

export function listSourceTypes() {
  return apiRequest<WaterQualitySourceType[]>('/water-quality/source-types')
}

export function listReports(params?: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) query.set(key, value)
  }
  const qs = query.toString()
  return apiRequest<ReportListResponse>(
    `/water-quality/reports${qs ? `?${qs}` : ''}`,
  )
}

export type ReportListResponse = {
  items: WaterQualityReportSummary[]
  total: number
  page: number
  pageSize: number
}

export type RiskBand = 'CRITICAL' | 'HIGH' | 'WATCH' | 'STABLE' | 'NONE'

export type PlaceAnalyticsRow = {
  reports: number
  unsafe: number
  safe: number
  unsafeRate: number
  band: RiskBand
  unsafeMicrobial: number
}

export type ReportAnalytics = {
  totals: {
    pendingReview: number
    approved: number
    rejected: number
    unsafe: number
    safe: number
    unsafePhysical: number
    unsafeChemical: number
    unsafeTrace: number
    unsafeMicrobial: number
    unsafeRate: number
    tehsilsCovered: number
    villagesCovered: number
    tehsilsInMaster: number
    coverageRate: number
  }
  brief: {
    stance: 'CRITICAL' | 'HIGH' | 'WATCH' | 'STABLE' | 'INSUFFICIENT'
    headline: string
    actions: string[]
    coverageNote: string
  }
  hazards: Array<{ name: string; unsafe: number }>
  byTehsil: Array<
    PlaceAnalyticsRow & {
      tehsilId: string
      tehsilName: string
      unsafeChemical: number
      unsafePhysical: number
    }
  >
  byVillage: Array<
    PlaceAnalyticsRow & {
      villageId: string
      villageName: string
      tehsilId: string
      tehsilName: string
      unsafeChemical: number
      unsafePhysical: number
    }
  >
  bySource: Array<{
    name: string
    reports: number
    unsafe: number
    safe: number
    unsafeRate: number
    band: RiskBand
  }>
  byMonth: Array<{
    period: string
    approved: number
    unsafe: number
    safe: number
    cumulativeApproved: number
    cumulativeUnsafe: number
    cumulativeSafe: number
  }>
  alerts: Array<{
    tehsilId: string
    villageId: string
    tehsilName: string
    villageName: string
    unsafe: number
    unsafeMicrobial: number
    reports: number
    band: RiskBand
    message: string
  }>
  recentApproved: Array<{
    id: string
    reportSerialNo: string
    reportingDate: string
    tehsilName: string
    villageName: string
    unsafe: boolean
    microbialConformity: string
    physicalConformity: string
    chemicalConformity: string
  }>
}

export function fetchReportAnalytics(params?: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) query.set(key, value)
  }
  const qs = query.toString()
  return apiRequest<ReportAnalytics>(
    `/water-quality/reports/analytics${qs ? `?${qs}` : ''}`,
  )
}

export async function downloadApprovedReportsCsv(
  params?: Record<string, string | undefined>,
) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) query.set(key, value)
  }
  const qs = query.toString()
  const token = getAccessToken()
  const response = await fetch(
    `/api/water-quality/reports/export${qs ? `?${qs}` : ''}`,
    {
      headers: {
        Accept: 'text/csv',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  )
  if (!response.ok) {
    throw new ApiError('Unable to export approved reports', response.status)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download =
    params?.view === 'summary'
      ? 'wqms-accumulative-summary.csv'
      : 'wqms-approved-reports.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function getReport(id: string) {
  return apiRequest<WaterQualityReportDetail>(`/water-quality/reports/${id}`)
}

export function validateReport(input: WaterQualityReportInput) {
  return apiRequest<{
    results: Array<{
      parameterCode: string
      exceedsLimit: boolean
      message: string
    }>
    conformity: {
      physicalConformity: string
      chemicalConformity: string
      traceConformity: string | null
      microbialConformity: string
      overallRemarks: string
      exceededParameters: string[]
    }
  }>('/water-quality/reports/validate', {
    method: 'POST',
    body: emptyToUndefined(input),
  })
}

export function createReport(
  input: WaterQualityReportInput & { requireAllParameters?: boolean },
) {
  return apiRequest<{
    report: WaterQualityReportDetail
    judgment: {
      overallRemarks: string
      exceededParameters: string[]
    }
  }>('/water-quality/reports', {
    method: 'POST',
    body: emptyToUndefined(input),
  })
}

export function updateReport(
  id: string,
  input: WaterQualityReportInput & { requireAllParameters?: boolean },
) {
  return apiRequest<{
    report: WaterQualityReportDetail
    judgment: {
      overallRemarks: string
      exceededParameters: string[]
    }
  }>(`/water-quality/reports/${id}`, {
    method: 'PATCH',
    body: emptyToUndefined(input),
  })
}

export function submitReport(id: string) {
  return apiRequest<WaterQualityReportDetail>(
    `/water-quality/reports/${id}/submit`,
    { method: 'POST', body: {} },
  )
}

export function approveReport(id: string) {
  return apiRequest<WaterQualityReportDetail>(
    `/water-quality/reports/${id}/approve`,
    { method: 'POST', body: {} },
  )
}

export function rejectReport(id: string, reason: string) {
  return apiRequest<WaterQualityReportDetail>(
    `/water-quality/reports/${id}/reject`,
    { method: 'POST', body: { reason } },
  )
}

export type ParsedLabDocument = {
  sourceFileName: string
  confidence: number
  warnings: string[]
  formType: 'PRIORITY' | 'FULL'
  sampleType: 'SOURCE_WELL' | 'POU_TAP' | 'OHR'
  reportCategory: 'PCRWR' | 'BASELINE'
  fields: {
    reportSerialNo: string | null
    nwqlSampleCode: string | null
    customerCode: string | null
    customerName: string | null
    customerAddress: string | null
    customerPhone: string | null
    locationDetail: string | null
    workOrder: string | null
    sourceLabel: string | null
    documentTehsilName: string | null
    documentVillageName: string | null
    siteName: string | null
    totalPages: number | null
    samplingAt: string | null
    receivedAt: string | null
    receiptTempC: number | null
    receiptHumidityPct: number | null
    analysisFrom: string | null
    analysisTo: string | null
    reportingDate: string | null
    remarksOverride: string | null
  }
  location: {
    tehsilId: string | null
    tehsilName: string | null
    villageId: string | null
    villageName: string | null
    settlementId: string | null
    settlementName: string | null
    siteName: string | null
    score: number
    linked: boolean
  }
  source: {
    sourceTypeId: string | null
    code: string | null
    name: string | null
    category: 'SOURCE_WELL' | 'POU_TAP' | 'OHR'
    sourceLabel: string | null
    matched: boolean
  }
  results: Array<{
    parameterCode: string
    parameterName: string
    rawValue: string
    resultType: string
    numericValue: number | null
    qualitativeValue: string | null
    uncertainty: string | null
  }>
}

export function parseLabDocument(file: File) {
  return apiUpload<ParsedLabDocument>('/water-quality/reports/parse', file)
}
