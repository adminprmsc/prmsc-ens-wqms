export const SAMPLE_TYPE_LABELS = {
  SOURCE_WELL: 'Source well',
  POU_TAP: 'Point of use (tap)',
  OHR: 'Overhead reservoir',
} as const

export const REPORT_CATEGORY_LABELS = {
  PCRWR: 'PCRWR report',
  BASELINE: 'Baseline report',
} as const

export const FORM_TYPE_LABELS = {
  PRIORITY: 'Priority parameters',
  FULL: 'Full chemical suite',
} as const

export const REPORT_STATUS_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
} as const

export const CONFORMITY_LABELS = {
  SAFE: 'Safe',
  UNSAFE: 'Unsafe',
} as const

export const PARAMETER_CATEGORY_LABELS = {
  PHYSICAL_AESTHETIC: 'Physical / aesthetic',
  CHEMICAL: 'Chemical',
  TRACE_ELEMENT: 'Trace elements',
  MICROBIOLOGICAL: 'Microbiological',
} as const

export function formatReportDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function localDateTimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function isoToDatetimeLocal(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return localDateTimeValue(date)
}

export function newReportSerial() {
  const year = new Date().getFullYear()
  const token = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
  return `WQ-${year}-${token}`
}

export function parseParameterInput(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const token = trimmed.toLowerCase().replace(/[\s_-]+/g, '')
  if (
    ['bdl', 'ndl', 'nd', 'nil', 'notdetected', 'belowdetectionlimit'].includes(
      token,
    )
  ) {
    return {
      resultType: 'BDL' as const,
      numericValue: null as number | null,
      qualitativeValue: 'BDL',
    }
  }
  if (
    trimmed === '-ve' ||
    trimmed === '-Ve' ||
    ['ve', 'negative', 'absent'].includes(token)
  ) {
    return {
      resultType: 'NEGATIVE' as const,
      numericValue: 0 as number | null,
      qualitativeValue: '-ve',
    }
  }
  if (token === 'tntc' || token === 'toonumeroustocount') {
    return {
      resultType: 'TNTC' as const,
      numericValue: null as number | null,
      qualitativeValue: 'TNTC',
    }
  }
  const numeric = Number(trimmed.replace(/,/g, ''))
  if (Number.isFinite(numeric) && /^-?\d/.test(trimmed.replace(/,/g, ''))) {
    return {
      resultType: 'NUMERIC' as const,
      numericValue: numeric as number | null,
      qualitativeValue: null as string | null,
    }
  }
  return {
    resultType: 'QUALITATIVE' as const,
    numericValue: null as number | null,
    qualitativeValue: trimmed,
  }
}
