import { z } from 'zod'

export const sampleTypeSchema = z.enum(['SOURCE_WELL', 'POU_TAP', 'OHR'])
export const reportCategorySchema = z.enum(['PCRWR', 'BASELINE'])
export const formTypeSchema = z.enum(['PRIORITY', 'FULL'])

export const PRIORITY_PARAMETER_CODES = [
  'COLOR',
  'ODOUR',
  'TASTE',
  'EC',
  'PH',
  'TURBIDITY',
  'TDS',
  'TOTAL_COLIFORMS',
  'FECAL_COLIFORMS',
  'E_COLI',
] as const

export const resultInputSchema = z
  .object({
    parameterCode: z.string().min(1),
    resultType: z
      .enum(['NUMERIC', 'BDL', 'QUALITATIVE', 'NEGATIVE', 'POSITIVE', 'TNTC'])
      .optional(),
    numericValue: z.number().finite().optional().nullable(),
    qualitativeValue: z.string().optional().nullable(),
    uncertainty: z.string().optional().nullable(),
  })
  .refine(
    (value) =>
      value.numericValue !== null && value.numericValue !== undefined
        ? true
        : Boolean(value.qualitativeValue?.trim() || value.resultType),
    { message: 'Enter a numeric or qualitative result' },
  )

function asDate(value: string | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function calendarDaysBetween(later: Date, earlier: Date): number {
  const laterDay = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate())
  const earlierDay = Date.UTC(
    earlier.getFullYear(),
    earlier.getMonth(),
    earlier.getDate(),
  )
  return Math.round((laterDay - earlierDay) / 86_400_000)
}

export const waterQualityReportSchema = z
  .object({
    reportSerialNo: z.string().trim().min(3).max(100),
    nwqlSampleCode: z.string().trim().max(100).optional().or(z.literal('')),
    customerCode: z.string().trim().max(50).optional().or(z.literal('')),
    customerName: z.string().trim().min(2).max(200),
    customerAddress: z.string().trim().max(500).optional().or(z.literal('')),
    customerPhone: z
      .string()
      .trim()
      .max(40)
      .regex(/^[0-9+\s()-]*$/, 'Use digits and + ( ) - only')
      .optional()
      .or(z.literal('')),
    tehsilId: z.string().min(1, 'Select a tehsil'),
    villageId: z.string().min(1, 'Select a village'),
    settlementId: z.string().optional().or(z.literal('')),
    sourceTypeId: z.string().min(1, 'Select a source'),
    sampleType: sampleTypeSchema,
    sourceLabel: z.string().trim().max(100).optional().or(z.literal('')),
    documentTehsilName: z.string().trim().max(120).optional().or(z.literal('')),
    documentVillageName: z
      .string()
      .trim()
      .max(120)
      .optional()
      .or(z.literal('')),
    siteName: z.string().trim().max(200).optional().or(z.literal('')),
    reportCategory: reportCategorySchema,
    formType: formTypeSchema,
    workOrder: z.string().trim().max(100).optional().or(z.literal('')),
    locationDetail: z.string().trim().min(2).max(255),
    gpsLatitude: z.number().min(-90).max(90).optional().nullable(),
    gpsLongitude: z.number().min(-180).max(180).optional().nullable(),
    samplingAt: z.string().min(1, 'Sampling date is required'),
    receivedAt: z.string().optional().or(z.literal('')),
    receiptTempC: z.number().min(-5).max(50).optional().nullable(),
    receiptHumidityPct: z.number().min(0).max(100).optional().nullable(),
    analysisFrom: z.string().optional().or(z.literal('')),
    analysisTo: z.string().optional().or(z.literal('')),
    reportingDate: z.string().min(1, 'Reporting date is required'),
    totalPages: z.number().int().min(1).max(50).optional().nullable(),
    termsAgreed: z.boolean(),
    remarksOverride: z.string().max(2000).optional().or(z.literal('')),
    results: z.array(resultInputSchema).min(1, 'Enter at least one parameter result'),
  })
  .superRefine((value, ctx) => {
    const hasLat =
      value.gpsLatitude !== null && value.gpsLatitude !== undefined
    const hasLng =
      value.gpsLongitude !== null && value.gpsLongitude !== undefined
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: 'custom',
        path: ['gpsLatitude'],
        message: 'Latitude and longitude must be entered together',
      })
    }

    if (
      value.reportCategory === 'PCRWR' &&
      !value.nwqlSampleCode?.trim()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['nwqlSampleCode'],
        message: 'NWQL sample code is required for PCRWR reports',
      })
    }

    const samplingAt = asDate(value.samplingAt)
    const reportingDate = asDate(value.reportingDate)
    const receivedAt = asDate(value.receivedAt)
    const analysisFrom = asDate(value.analysisFrom)
    const analysisTo = asDate(value.analysisTo)

    if (samplingAt && reportingDate && calendarDaysBetween(samplingAt, reportingDate) > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['reportingDate'],
        message: 'Reporting date cannot be before sampling',
      })
    }
    if (
      samplingAt &&
      receivedAt &&
      calendarDaysBetween(samplingAt, receivedAt) > 14
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['receivedAt'],
        message: 'Received date cannot be more than 14 days before sampling',
      })
    }
    if (
      analysisFrom &&
      analysisTo &&
      calendarDaysBetween(analysisFrom, analysisTo) > 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['analysisTo'],
        message: 'Analysis end cannot be before analysis start',
      })
    }

    const codes = new Set(value.results.map((result) => result.parameterCode))
    const missingPriority = PRIORITY_PARAMETER_CODES.filter(
      (code) => !codes.has(code),
    )
    if (value.formType === 'PRIORITY' && missingPriority.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['results'],
        message: `Priority form requires ${missingPriority.join(', ')}`,
      })
    }
    if (value.formType === 'FULL' && value.results.length < 8) {
      ctx.addIssue({
        code: 'custom',
        path: ['results'],
        message: 'Full-suite reports need at least 8 parameter results',
      })
    }
  })

export type WaterQualityReportInput = z.infer<typeof waterQualityReportSchema>
