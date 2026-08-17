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
  const token = randomToken(8)
  return `WQ-${year}-${token}`
}

/** `crypto.randomUUID` is HTTPS-only; production currently serves plain HTTP. */
function randomToken(length: number) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '').slice(0, length).toUpperCase()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(Math.ceil(length / 2))
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length)
      .toUpperCase()
  }
  return Math.random()
    .toString(16)
    .slice(2, 2 + length)
    .toUpperCase()
    .padEnd(length, '0')
}

const COLORLESS_TOKENS = new Set(['colorless', 'colourless', 'clear'])
const UNOBJ_TOKENS = new Set(['unobj', 'unobjectionable'])

function qualitativeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Map a lab-report spelling onto a catalog Select option. */
export function matchQualitativeOption(
  raw: string,
  allowed: string[],
): string | null {
  const token = qualitativeToken(raw)
  if (!token || !allowed?.length) return null
  const exact = allowed.find((item) => qualitativeToken(item) === token)
  if (exact) return exact
  if (COLORLESS_TOKENS.has(token)) {
    return (
      allowed.find((item) => COLORLESS_TOKENS.has(qualitativeToken(item))) ??
      null
    )
  }
  if (UNOBJ_TOKENS.has(token) || token.startsWith('unobj')) {
    return (
      allowed.find((item) => {
        const allowedToken = qualitativeToken(item)
        return UNOBJ_TOKENS.has(allowedToken) || allowedToken.startsWith('unobj')
      }) ?? null
    )
  }
  return null
}

export function coerceResultValues(
  values: Record<string, string>,
  parameters: Array<{
    code: string
    limitOperator: string
    qualitativeAllowed: string[]
  }>,
): Record<string, string> {
  const next = { ...values }
  for (const parameter of parameters) {
    const raw = next[parameter.code]
    if (!raw?.trim()) continue
    if (parameter.limitOperator !== 'QUALITATIVE') continue
    next[parameter.code] =
      matchQualitativeOption(raw, parameter.qualitativeAllowed) ?? ''
  }
  return next
}

export function isEnteredResult(
  raw: string | undefined,
  parameter: { limitOperator: string; qualitativeAllowed: string[] },
) {
  if (!raw?.trim()) return false
  if (parameter.limitOperator === 'QUALITATIVE') {
    return Boolean(matchQualitativeOption(raw, parameter.qualitativeAllowed))
  }
  return parseParameterInput(raw) != null
}

export function parseParameterInput(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const token = trimmed.toLowerCase().replace(/[\s_-]+/g, '')
  if (
    trimmed === '-' ||
    trimmed === '—' ||
    trimmed === '–' ||
    ['na', 'n/a', 'none', 'ngvs', 'blank'].includes(token)
  ) {
    return null
  }
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
