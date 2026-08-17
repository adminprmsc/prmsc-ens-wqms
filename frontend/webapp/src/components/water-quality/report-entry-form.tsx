import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Beaker,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileUp,
  FlaskConical,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

import { SectionCard } from '@/components/app/section-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ConformityBadge } from '@/components/water-quality/status-badge'
import { LocationPicker } from '@/components/water-quality/location-picker'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import {
  listSettlements,
  listTehsils,
  listVillages,
  type LocationOption,
} from '@/lib/locations-api'
import {
  createReport,
  getReport,
  listParameters,
  listSourceTypes,
  parseLabDocument,
  submitReport,
  updateReport,
  validateReport,
  type ParsedLabDocument,
  type WaterQualityParameter,
  type WaterQualityReportDetail,
  type WaterQualitySourceType,
} from '@/lib/water-quality-api'
import {
  FORM_TYPE_LABELS,
  PARAMETER_CATEGORY_LABELS,
  REPORT_CATEGORY_LABELS,
  isoToDatetimeLocal,
  localDateTimeValue,
  newReportSerial,
  parseParameterInput,
} from '@/lib/water-quality-labels'
import {
  waterQualityReportSchema,
  type WaterQualityReportInput,
} from '@/lib/water-quality-schema'
import {
  isEditableReportStatus,
  pcrwrRecordsPath,
} from '@/lib/routes'
import { locationLabel, pickBestLocation } from '@/lib/location-search'
import {
  isOtherSourceType,
  matchSourceTypeFromCatalog,
} from '@/lib/source-type-search'

const CATEGORY_ORDER = [
  'PHYSICAL_AESTHETIC',
  'CHEMICAL',
  'TRACE_ELEMENT',
  'MICROBIOLOGICAL',
] as const

const CATEGORY_ACCENT: Record<(typeof CATEGORY_ORDER)[number], string> = {
  PHYSICAL_AESTHETIC: 'border-l-sky-700',
  CHEMICAL: 'border-l-teal-700',
  TRACE_ELEMENT: 'border-l-indigo-700',
  MICROBIOLOGICAL: 'border-l-amber-700',
}

type JudgmentPreview = {
  physicalConformity: string
  chemicalConformity: string
  traceConformity: string | null
  microbialConformity: string
  overallRemarks: string
  exceededParameters: string[]
}

function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : Number.NaN
}

function toIso(value: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export function ReportEntryForm({ reportId }: { reportId?: string }) {
  const navigate = useNavigate()
  const [tehsils, setTehsils] = useState<LocationOption[]>([])
  const [villages, setVillages] = useState<LocationOption[]>([])
  const [settlements, setSettlements] = useState<LocationOption[]>([])
  const [parameters, setParameters] = useState<WaterQualityParameter[]>([])
  const [sourceTypes, setSourceTypes] = useState<WaterQualitySourceType[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  const [reportSerialNo, setReportSerialNo] = useState(newReportSerial)
  const [nwqlSampleCode, setNwqlSampleCode] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('PCRWR / PRMSC field sample')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [tehsilId, setTehsilId] = useState('')
  const [villageId, setVillageId] = useState('')
  const [settlementId, setSettlementId] = useState('')
  const [sourceTypeId, setSourceTypeId] = useState('')
  const [sampleType, setSampleType] =
    useState<WaterQualityReportInput['sampleType']>('SOURCE_WELL')
  const [sourceLabel, setSourceLabel] = useState('')
  const [documentTehsilName, setDocumentTehsilName] = useState('')
  const [documentVillageName, setDocumentVillageName] = useState('')
  const [siteName, setSiteName] = useState('')
  const [reportCategory, setReportCategory] =
    useState<WaterQualityReportInput['reportCategory']>('PCRWR')
  const [formType, setFormType] =
    useState<WaterQualityReportInput['formType']>('PRIORITY')
  const [workOrder, setWorkOrder] = useState('')
  const [locationDetail, setLocationDetail] = useState('')
  const [gpsLatitude, setGpsLatitude] = useState('')
  const [gpsLongitude, setGpsLongitude] = useState('')
  const [samplingAt, setSamplingAt] = useState(localDateTimeValue)
  const [receivedAt, setReceivedAt] = useState('')
  const [receiptTempC, setReceiptTempC] = useState('')
  const [receiptHumidityPct, setReceiptHumidityPct] = useState('')
  const [analysisFrom, setAnalysisFrom] = useState('')
  const [analysisTo, setAnalysisTo] = useState('')
  const [reportingDate, setReportingDate] = useState(localDateTimeValue)
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [remarksOverride, setRemarksOverride] = useState('')
  const [totalPages, setTotalPages] = useState('')
  const [resultValues, setResultValues] = useState<Record<string, string>>({})
  const pendingResults = useRef<Record<string, string> | null>(null)
  const pendingLocation = useRef<{
    tehsilId: string
    villageId: string | null
    settlementId: string | null
  } | null>(null)
  const applyingLocation = useRef(false)
  const pendingSourceLabel = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parseState, setParseState] = useState<
    'idle' | 'uploading' | 'done' | 'error'
  >('idle')
  const [parsedSummary, setParsedSummary] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<JudgmentPreview | null>(null)
  const [busy, setBusy] = useState<'validate' | 'draft' | 'submit' | null>(null)
  const [loadedStatus, setLoadedStatus] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const isEditing = Boolean(reportId)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingMeta(true)
      try {
        const [nextTehsils, nextParameters, nextSourceTypes] = await Promise.all([
          listTehsils(),
          listParameters(formType),
          listSourceTypes(),
        ])
        if (cancelled) return
        setTehsils(nextTehsils)
        setParameters(nextParameters)
        setSourceTypes(nextSourceTypes)
        setSourceTypeId((current) => {
          if (pendingSourceLabel.current) {
            const matched = matchSourceTypeFromCatalog(
              pendingSourceLabel.current,
              nextSourceTypes,
            )
            if (matched) {
              setSampleType(matched.category)
              if (matched.code !== 'OTHER') {
                pendingSourceLabel.current = null
              }
              return matched.id
            }
          }
          if (current) return current
          return (
            nextSourceTypes.find((item) => item.code === 'SOURCE_WELL')?.id ??
            nextSourceTypes[0]?.id ??
            ''
          )
        })
      } catch (error) {
        if (!cancelled) {
          setFormError(
            error instanceof ApiError
              ? error.message
              : 'Unable to load catalog and locations',
          )
        }
      } finally {
        if (!cancelled) setLoadingMeta(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [formType])

  useEffect(() => {
    if (!reportId) return
    if (loadingMeta) return
    let cancelled = false
    async function loadReport() {
      try {
        const report = await getReport(reportId!)
        if (cancelled) return
        if (!isEditableReportStatus(report.status)) {
          toast.error('Only draft or rejected reports can be edited')
          navigate(pcrwrRecordsPath(), { replace: true })
          return
        }
        await applyLoadedReport(report)
      } catch (error) {
        if (cancelled) return
        applyApiError(error)
        toast.error(
          error instanceof ApiError ? error.message : 'Unable to open this report',
        )
      }
    }
    void loadReport()
    return () => {
      cancelled = true
    }
  }, [reportId, loadingMeta, navigate])

  useEffect(() => {
    if (pendingResults.current && parameters.length > 0) {
      setResultValues(pendingResults.current)
      pendingResults.current = null
    }
  }, [parameters])

  useEffect(() => {
    if (!tehsilId) {
      if (applyingLocation.current || pendingLocation.current) return
      setVillages([])
      setVillageId('')
      setSettlements([])
      setSettlementId('')
      return
    }
    let cancelled = false
    listVillages(tehsilId)
      .then((rows) => {
        if (cancelled) return
        setVillages(rows)
        const pending = pendingLocation.current
        if (
          pending &&
          pending.tehsilId === tehsilId &&
          pending.villageId &&
          rows.some((row) => row.id === pending.villageId)
        ) {
          setVillageId(pending.villageId)
        }
      })
      .catch(() => {
        if (!cancelled) setVillages([])
      })
    return () => {
      cancelled = true
    }
  }, [tehsilId])

  useEffect(() => {
    if (!villageId) {
      if (applyingLocation.current || pendingLocation.current) return
      setSettlements([])
      setSettlementId('')
      return
    }
    let cancelled = false
    listSettlements(villageId)
      .then((rows) => {
        if (cancelled) return
        setSettlements(rows)
        const pending = pendingLocation.current
        if (pending && pending.villageId === villageId) {
          if (
            pending.settlementId &&
            rows.some((row) => row.id === pending.settlementId)
          ) {
            setSettlementId(pending.settlementId)
          } else if (!pending.settlementId && rows.length === 1) {
            setSettlementId(rows[0]?.id ?? '')
          }
        }
      })
      .catch(() => {
        if (!cancelled) setSettlements([])
      })
    return () => {
      cancelled = true
    }
  }, [villageId])

  const groupedParameters = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: PARAMETER_CATEGORY_LABELS[category],
      items: parameters.filter((parameter) => parameter.category === category),
    })).filter((group) => group.items.length > 0)
  }, [parameters])

  function buildPayload() {
    const results = parameters.flatMap((parameter) => {
      const parsed = parseParameterInput(resultValues[parameter.code] ?? '')
      if (!parsed) return []
      return [
        {
          parameterCode: parameter.code,
          resultType: parsed.resultType,
          numericValue: parsed.numericValue,
          qualitativeValue: parsed.qualitativeValue,
        },
      ]
    })

    return {
      reportSerialNo,
      nwqlSampleCode,
      customerCode,
      customerName,
      customerAddress,
      customerPhone,
      tehsilId,
      villageId,
      settlementId,
      sourceTypeId,
      sampleType,
      sourceLabel,
      documentTehsilName,
      documentVillageName,
      siteName,
      reportCategory,
      formType,
      workOrder,
      locationDetail,
      gpsLatitude: optionalNumber(gpsLatitude),
      gpsLongitude: optionalNumber(gpsLongitude),
      samplingAt: toIso(samplingAt),
      receivedAt: toIso(receivedAt),
      receiptTempC: optionalNumber(receiptTempC),
      receiptHumidityPct: optionalNumber(receiptHumidityPct),
      analysisFrom: toIso(analysisFrom),
      analysisTo: toIso(analysisTo),
      reportingDate: toIso(reportingDate),
      totalPages: optionalNumber(totalPages),
      termsAgreed,
      remarksOverride,
      results,
    }
  }

  function parseForm() {
    setFieldErrors({})
    setFormError(null)
    setServerErrors([])
    const parsed = waterQualityReportSchema.safeParse(buildPayload())
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setFieldErrors(next)
      setFormError(parsed.error.issues[0]?.message ?? 'Check the highlighted fields')
      return null
    }
    if (
      parsed.data.gpsLatitude !== null &&
      Number.isNaN(parsed.data.gpsLatitude)
    ) {
      setFieldErrors({ gpsLatitude: 'Latitude must be a number' })
      setFormError('Latitude must be a number')
      return null
    }
    if (
      parsed.data.gpsLongitude !== null &&
      Number.isNaN(parsed.data.gpsLongitude)
    ) {
      setFieldErrors({ gpsLongitude: 'Longitude must be a number' })
      setFormError('Longitude must be a number')
      return null
    }
    if (
      isOtherSourceType(sourceTypes, parsed.data.sourceTypeId) &&
      !parsed.data.sourceLabel?.trim()
    ) {
      setFieldErrors({ sourceLabel: 'Enter the source name from the report' })
      setFormError('Enter the source name from the report')
      return null
    }
    return parsed.data
  }

  async function onValidate() {
    const payload = parseForm()
    if (!payload) return
    setBusy('validate')
    try {
      const judged = await validateReport(payload)
      setPreview(judged.conformity)
      toast.success(judged.conformity.overallRemarks)
    } catch (error) {
      applyApiError(error)
    } finally {
      setBusy(null)
    }
  }

  async function persist(mode: 'draft' | 'submit') {
    const payload = parseForm()
    if (!payload) return
    if (mode === 'submit' && !payload.termsAgreed) {
      setFieldErrors({ termsAgreed: 'Terms must be accepted before submission' })
      setFormError('Accept the laboratory terms before submitting for review')
      return
    }
    setBusy(mode)
    try {
      const input = {
        ...payload,
        termsAgreed: mode === 'submit' ? true : payload.termsAgreed,
        requireAllParameters: payload.formType === 'PRIORITY',
      }
      const saved = reportId
        ? await updateReport(reportId, input)
        : await createReport(input)
      setPreview({
        physicalConformity: saved.report.physicalConformity,
        chemicalConformity: saved.report.chemicalConformity,
        traceConformity: saved.report.traceConformity,
        microbialConformity: saved.report.microbialConformity,
        overallRemarks: saved.judgment.overallRemarks,
        exceededParameters: saved.judgment.exceededParameters ?? [],
      })
      if (mode === 'submit') {
        await submitReport(saved.report.id)
        toast.success(`Report ${saved.report.reportSerialNo} submitted for review`)
        navigate(pcrwrRecordsPath('PENDING_REVIEW'))
        return
      }
      toast.success(
        isEditing
          ? `Changes to ${saved.report.reportSerialNo} saved`
          : `Draft ${saved.report.reportSerialNo} saved`,
      )
      if (isEditing) {
        navigate(pcrwrRecordsPath(saved.report.status))
        return
      }
      setReportSerialNo(newReportSerial())
      setResultValues({})
      setTermsAgreed(false)
    } catch (error) {
      applyApiError(error)
    } finally {
      setBusy(null)
    }
  }

  function applyApiError(error: unknown) {
    if (error instanceof ApiError) {
      setFormError(error.message)
      setServerErrors(error.errors)
      return
    }
    setFormError('Request failed')
  }

  async function applyParsed(parsed: ParsedLabDocument) {
    const fields = parsed.fields
    if (fields.reportSerialNo) setReportSerialNo(fields.reportSerialNo)
    if (fields.nwqlSampleCode) setNwqlSampleCode(fields.nwqlSampleCode)
    if (fields.customerCode) setCustomerCode(fields.customerCode)
    if (fields.customerName) setCustomerName(fields.customerName)
    if (fields.customerAddress) setCustomerAddress(fields.customerAddress)
    if (fields.customerPhone) setCustomerPhone(fields.customerPhone)
    if (fields.workOrder) setWorkOrder(fields.workOrder)
    if (fields.locationDetail) setLocationDetail(fields.locationDetail)
    if (fields.receiptTempC !== null && fields.receiptTempC !== undefined) {
      setReceiptTempC(String(fields.receiptTempC))
    }
    if (
      fields.receiptHumidityPct !== null &&
      fields.receiptHumidityPct !== undefined
    ) {
      setReceiptHumidityPct(String(fields.receiptHumidityPct))
    }
    if (fields.totalPages) setTotalPages(String(fields.totalPages))
    if (fields.samplingAt) setSamplingAt(isoToDatetimeLocal(fields.samplingAt))
    if (fields.receivedAt) setReceivedAt(isoToDatetimeLocal(fields.receivedAt))
    if (fields.analysisFrom) {
      setAnalysisFrom(isoToDatetimeLocal(fields.analysisFrom))
    }
    if (fields.analysisTo) setAnalysisTo(isoToDatetimeLocal(fields.analysisTo))
    if (fields.reportingDate) {
      setReportingDate(isoToDatetimeLocal(fields.reportingDate))
    }
    if (fields.remarksOverride) setRemarksOverride(fields.remarksOverride)
    if (fields.sourceLabel) setSourceLabel(fields.sourceLabel)
    if (fields.documentTehsilName) {
      setDocumentTehsilName(fields.documentTehsilName)
    }
    if (fields.documentVillageName) {
      setDocumentVillageName(fields.documentVillageName)
    }
    if (fields.siteName) setSiteName(fields.siteName)
    applyParsedSource(parsed)
    setReportCategory(parsed.reportCategory)
    setFormType(parsed.formType)
    await applyParsedLocation(parsed)
    const nextResults: Record<string, string> = {}
    for (const result of parsed.results) {
      nextResults[result.parameterCode] = result.rawValue
    }
    pendingResults.current = nextResults
    setResultValues(nextResults)
    const locationLabel = [
      parsed.location.tehsilName,
      parsed.location.villageName,
      parsed.location.settlementName,
    ]
      .filter(Boolean)
      .join(' / ')
    const sourceNote = parsed.source.name
      ? parsed.source.matched
        ? parsed.source.name
        : `${parsed.source.name} (review source)`
      : parsed.fields.sourceLabel
    const linkNote = parsed.location.linked ? 'linked' : 'review location'
    setParsedSummary(
      `${parsed.sourceFileName} · ${parsed.results.length} parameters · ${parsed.confidence}% confidence${locationLabel ? ` · ${locationLabel} (${linkNote})` : ''}${sourceNote ? ` · ${sourceNote}` : ''}`,
    )
    if (parsed.warnings.length > 0) {
      setServerErrors(parsed.warnings)
    }
  }

  function applyParsedSource(parsed: ParsedLabDocument) {
    const label =
      parsed.fields.sourceLabel || parsed.source.sourceLabel || null
    if (label) setSourceLabel(label)
    pendingSourceLabel.current = label

    const catalog = sourceTypes
    const matched = matchSourceTypeFromCatalog(label, catalog)
    if (matched) {
      setSourceTypeId(matched.id)
      setSampleType(matched.category)
      if (matched.code !== 'OTHER') {
        pendingSourceLabel.current = null
      }
      return
    }

    if (parsed.source.sourceTypeId && catalog.some((item) => item.id === parsed.source.sourceTypeId)) {
      setSourceTypeId(parsed.source.sourceTypeId)
      setSampleType(parsed.source.category ?? parsed.sampleType)
      return
    }

    setSampleType(parsed.source.category ?? parsed.sampleType)
  }

  async function applyLoadedReport(report: WaterQualityReportDetail) {
    setLoadedStatus(report.status)
    setRejectionReason(report.rejectionReason)
    setReportSerialNo(report.reportSerialNo)
    setNwqlSampleCode(report.nwqlSampleCode ?? '')
    setCustomerCode(report.customerCode ?? '')
    setCustomerName(report.customerName)
    setCustomerAddress(report.customerAddress ?? '')
    setCustomerPhone(report.customerPhone ?? '')
    setSourceTypeId(report.sourceType?.id ?? '')
    setSampleType(
      report.sampleType as WaterQualityReportInput['sampleType'],
    )
    setSourceLabel(report.sourceLabel ?? '')
    setDocumentTehsilName(report.documentTehsilName ?? '')
    setDocumentVillageName(report.documentVillageName ?? '')
    setSiteName(report.siteName ?? '')
    setReportCategory(
      report.reportCategory as WaterQualityReportInput['reportCategory'],
    )
    setFormType(report.formType as WaterQualityReportInput['formType'])
    setWorkOrder(report.workOrder ?? '')
    setLocationDetail(report.locationDetail)
    setGpsLatitude(report.gpsLatitude ?? '')
    setGpsLongitude(report.gpsLongitude ?? '')
    setSamplingAt(isoToDatetimeLocal(report.samplingAt))
    setReceivedAt(isoToDatetimeLocal(report.receivedAt))
    setReceiptTempC(report.receiptTempC ?? '')
    setReceiptHumidityPct(report.receiptHumidityPct ?? '')
    setAnalysisFrom(isoToDatetimeLocal(report.analysisFrom))
    setAnalysisTo(isoToDatetimeLocal(report.analysisTo))
    setReportingDate(isoToDatetimeLocal(report.reportingDate))
    setTermsAgreed(report.termsAgreed)
    setRemarksOverride(report.overallRemarks ?? '')
    setTotalPages(report.totalPages ? String(report.totalPages) : '')
    const nextResults: Record<string, string> = {}
    for (const result of report.results) {
      nextResults[result.parameter.code] =
        result.qualitativeValue?.trim() ||
        (result.numericValue != null && result.numericValue !== ''
          ? String(result.numericValue)
          : '')
    }
    pendingResults.current = nextResults
    setResultValues(nextResults)
    setParsedSummary(
      `Editing ${report.reportSerialNo} · ${report.status === 'REJECTED' ? 'rejected — correct and resubmit' : 'draft'}`,
    )
    setParseState('done')

    applyingLocation.current = true
    pendingLocation.current = {
      tehsilId: report.tehsil.id,
      villageId: report.village.id,
      settlementId: report.settlement?.id ?? null,
    }
    try {
      const villageRows = await listVillages(report.tehsil.id)
      const settlementRows = report.village.id
        ? await listSettlements(report.village.id)
        : []
      setVillages(villageRows)
      setSettlements(settlementRows)
      setTehsilId(report.tehsil.id)
      setVillageId(report.village.id)
      setSettlementId(report.settlement?.id ?? '')
    } finally {
      window.setTimeout(() => {
        applyingLocation.current = false
      }, 80)
    }
  }

  async function applyParsedLocation(parsed: ParsedLabDocument) {
    const tehsilHints = [
      parsed.location.tehsilName,
      parsed.fields.documentTehsilName,
    ]
    const villageHints = [
      parsed.location.villageName,
      parsed.fields.documentVillageName,
      parsed.fields.locationDetail,
      parsed.fields.siteName,
    ]
    const settlementHints = [
      parsed.location.settlementName,
      parsed.fields.siteName,
      parsed.fields.documentVillageName,
      parsed.location.villageName,
    ]

    const tehsilFromId = tehsils.find(
      (row) => row.id === parsed.location.tehsilId,
    )
    const tehsil =
      tehsilFromId ?? pickBestLocation(tehsils, tehsilHints, 55)
    if (!tehsil) return

    applyingLocation.current = true
    pendingLocation.current = {
      tehsilId: tehsil.id,
      villageId: parsed.location.villageId,
      settlementId: parsed.location.settlementId,
    }
    try {
      const villageRows = await listVillages(tehsil.id)
      const villageFromId = villageRows.find(
        (row) => row.id === parsed.location.villageId,
      )
      const village =
        villageFromId ?? pickBestLocation(villageRows, villageHints, 50)

      const settlementRows = village ? await listSettlements(village.id) : []
      const settlementFromId = settlementRows.find(
        (row) => row.id === parsed.location.settlementId,
      )
      const settlement =
        settlementFromId ??
        pickBestLocation(settlementRows, settlementHints, 50) ??
        (village
          ? pickBestLocation(settlementRows, [village.name], 70)
          : null) ??
        (settlementRows.length === 1 ? (settlementRows[0] ?? null) : null)

      pendingLocation.current = {
        tehsilId: tehsil.id,
        villageId: village?.id ?? null,
        settlementId: settlement?.id ?? null,
      }
      setVillages(villageRows)
      setSettlements(settlementRows)
      setTehsilId(tehsil.id)
      setVillageId(village?.id ?? '')
      setSettlementId(settlement?.id ?? '')
    } finally {
      window.setTimeout(() => {
        applyingLocation.current = false
      }, 80)
    }
  }

  async function onImportFile(file: File) {
    setParseState('uploading')
    setFormError(null)
    setServerErrors([])
    try {
      const parsed = await parseLabDocument(file)
      await applyParsed(parsed)
      setParseState('done')
      toast.success(
        `Imported ${parsed.results.length} results from ${file.name}. Review before saving.`,
      )
    } catch (error) {
      setParseState('error')
      applyApiError(error)
    }
  }

  function parameterHint(parameter: WaterQualityParameter) {
    if (parameter.limitOperator === 'QUALITATIVE') {
      return parameter.qualitativeAllowed[0] ?? parameter.limitDisplay
    }
    if (parameter.limitOperator === 'EQUALS_ZERO') {
      return '0, -ve, +ve or TNTC'
    }
    return `Number or BDL · limit ${parameter.limitDisplay}`
  }

  const filledCount = parameters.filter((parameter) =>
    Boolean(resultValues[parameter.code]?.trim()),
  ).length
  const locationReady = Boolean(tehsilId && villageId)

  return (
    <div className="space-y-5 pb-4">
      <div className="grid gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Form
          </p>
          <p className="mt-1 text-sm font-semibold">
            {FORM_TYPE_LABELS[formType]}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Location
          </p>
          <p className="mt-1 text-sm font-semibold">
            {locationReady
              ? [
                  locationLabel(tehsils, tehsilId),
                  locationLabel(villages, villageId),
                ]
                  .filter(Boolean)
                  .join(' → ')
              : 'Select tehsil → village'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Results entered
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {filledCount} / {parameters.length || '—'}
          </p>
        </div>
      </div>

      {isEditing && loadedStatus === 'REJECTED' && rejectionReason ? (
        <Alert variant="destructive">
          <AlertTitle>Returned by PRMSC</AlertTitle>
          <AlertDescription>{rejectionReason}</AlertDescription>
        </Alert>
      ) : null}

      <SectionCard
        step="01"
        icon={FileUp}
        title="Start here — import the laboratory report"
        description={
          isEditing
            ? 'Review or correct this unsubmitted report. Re-import a file only if the laboratory issued a revision.'
            : 'Upload the PCRWR Word or PDF file first. The form below is filled for you to check. Nothing is saved until you choose Save draft or Submit.'
        }
        className="border-primary/35 shadow-sm"
        headerClassName="border-primary/20 bg-primary/8"
        actions={
          <Badge className="bg-primary text-primary-foreground">
            Required first step
          </Badge>
        }
        contentClassName="space-y-4"
      >
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onImportFile(file)
              event.target.value = ''
            }}
          />
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload NWQL report"
            onClick={() => {
              if (parseState !== 'uploading') fileInputRef.current?.click()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                if (parseState !== 'uploading') fileInputRef.current?.click()
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault()
              dragDepth.current += 1
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault()
              dragDepth.current = Math.max(0, dragDepth.current - 1)
              if (dragDepth.current === 0) setIsDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              dragDepth.current = 0
              setIsDragging(false)
              const file = event.dataTransfer.files[0]
              if (file) void onImportFile(file)
            }}
            className={cn(
              'flex w-full cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-8 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
              parseState === 'uploading' && 'pointer-events-none cursor-wait',
              parseState === 'error'
                ? 'border-destructive/50 bg-destructive/5'
                : parseState === 'done'
                  ? 'border-emerald-400 bg-emerald-50/80'
                  : isDragging
                    ? 'border-primary bg-primary/12'
                    : 'border-primary/45 bg-primary/[0.04] hover:border-primary hover:bg-primary/10',
            )}
          >
            <span
              className={cn(
                'flex size-14 items-center justify-center rounded-full',
                parseState === 'done'
                  ? 'bg-emerald-600 text-white'
                  : parseState === 'error'
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-primary text-primary-foreground',
              )}
            >
              {parseState === 'uploading' ? (
                <Spinner className="size-6" />
              ) : parseState === 'done' ? (
                <CheckCircle2 className="size-7" />
              ) : (
                <FileUp className="size-7" />
              )}
            </span>
            <div className="space-y-1.5">
              <p className="text-base font-semibold tracking-tight">
                {parseState === 'uploading'
                  ? 'Reading the laboratory report…'
                  : parseState === 'done'
                    ? 'Report imported — review the form below'
                    : parseState === 'error'
                      ? 'Could not read that file. Try again.'
                      : isDragging
                        ? 'Drop the report to fill the form'
                        : 'Drop the NWQL .docx or PDF here'}
              </p>
              <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
                {parseState === 'done'
                  ? 'Check tehsil, village, source, dates, and results, then save a draft.'
                  : 'Use the PCRWR layout NWQL/LMS/TR-11. Serial, sample code, location, source, dates, and test results are filled automatically.'}
              </p>
            </div>
            {parseState !== 'uploading' ? (
              <Button
                type="button"
                size="lg"
                variant={parseState === 'done' ? 'outline' : 'default'}
                onClick={(event) => {
                  event.stopPropagation()
                  fileInputRef.current?.click()
                }}
              >
                <FileUp />
                {parseState === 'done' ? 'Replace file' : 'Choose report file'}
              </Button>
            ) : null}
          </div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              {
                step: '1',
                title: 'Identity & dates',
                body: 'Serial, NWQL sample code, sampling, receipt, and reporting dates.',
              },
              {
                step: '2',
                title: 'Place & source',
                body: 'Tehsil → village → settlement, plus the lab source (e.g. tap water).',
              },
              {
                step: '3',
                title: 'Test results',
                body: 'Parameter grid is filled for review. Save only after you check it.',
              },
            ].map((item) => (
              <li
                key={item.step}
                className="rounded-lg bg-muted/60 px-3 py-3 ring-1 ring-foreground/8"
              >
                <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">
                  Fills {item.step}
                </p>
                <p className="mt-1 text-sm font-semibold">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
        {parsedSummary ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <Badge variant="outline" className="border-emerald-300 bg-white">
              Imported
            </Badge>
            <span>{parsedSummary}</span>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        step="02"
        icon={Beaker}
        title="Sample classification"
        description="Priority forms capture NSDWQ screening parameters. Full suite adds chemical and trace-element results."
        contentClassName="space-y-5"
      >
          <Tabs
            value={formType}
            onValueChange={(value) => {
              if (value === 'PRIORITY' || value === 'FULL') {
                setFormType(value)
                setPreview(null)
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="PRIORITY">
                {FORM_TYPE_LABELS.PRIORITY}
              </TabsTrigger>
              <TabsTrigger value="FULL">{FORM_TYPE_LABELS.FULL}</TabsTrigger>
            </TabsList>
          </Tabs>

          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="reportSerialNo">Report serial</FieldLabel>
              <Input
                id="reportSerialNo"
                value={reportSerialNo}
                onChange={(event) => setReportSerialNo(event.target.value)}
              />
              <FieldError>{fieldErrors.reportSerialNo}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="nwqlSampleCode">NWQL sample code</FieldLabel>
              <Input
                id="nwqlSampleCode"
                value={nwqlSampleCode}
                onChange={(event) => setNwqlSampleCode(event.target.value)}
                placeholder="MCL-10409-23"
              />
              <FieldError>{fieldErrors.nwqlSampleCode}</FieldError>
            </Field>
            <Field>
              <FieldLabel>Source</FieldLabel>
              <Select
                value={sourceTypeId || null}
                items={sourceTypes.map((sourceType) => ({
                  value: sourceType.id,
                  label: sourceType.name,
                }))}
                onValueChange={(value) => {
                  if (!value) return
                  const selected = sourceTypes.find((item) => item.id === value)
                  setSourceTypeId(value)
                  if (selected) setSampleType(selected.category)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {sourceTypes.map((sourceType) => (
                    <SelectItem key={sourceType.id} value={sourceType.id}>
                      {sourceType.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isOtherSourceType(sourceTypes, sourceTypeId) ? (
                <div className="mt-2">
                  <FieldLabel htmlFor="sourceLabel">Source name</FieldLabel>
                  <Input
                    id="sourceLabel"
                    value={sourceLabel}
                    onChange={(event) => setSourceLabel(event.target.value)}
                    placeholder="Type the source as written on the report"
                  />
                  <FieldDescription>
                    Other is for labels not yet in the catalog. Keep the lab wording.
                  </FieldDescription>
                  <FieldError>{fieldErrors.sourceLabel}</FieldError>
                </div>
              ) : sourceLabel ? (
                <FieldDescription>Lab report: {sourceLabel}</FieldDescription>
              ) : null}
              <FieldError>{fieldErrors.sourceTypeId}</FieldError>
            </Field>
            <Field>
              <FieldLabel>Report category</FieldLabel>
              <Select
                value={reportCategory}
                onValueChange={(value) => {
                  if (value) {
                    setReportCategory(
                      value as WaterQualityReportInput['reportCategory'],
                    )
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_CATEGORY_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="workOrder">Work order</FieldLabel>
              <Input
                id="workOrder"
                value={workOrder}
                onChange={(event) => setWorkOrder(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="customerCode">Customer code</FieldLabel>
              <Input
                id="customerCode"
                value={customerCode}
                onChange={(event) => setCustomerCode(event.target.value)}
              />
            </Field>
          </FieldGroup>
      </SectionCard>

      <SectionCard
        step="03"
        icon={MapPin}
        title="Customer and location"
        description="The report names are matched to official tehsil → village → settlement. Search the lists if you need to correct a match."
        contentClassName="space-y-5"
      >
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="customerName">Customer / source name</FieldLabel>
              <Input
                id="customerName"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
              <FieldError>{fieldErrors.customerName}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="customerPhone">Phone</FieldLabel>
              <Input
                id="customerPhone"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
              />
              <FieldError>{fieldErrors.customerPhone}</FieldError>
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="customerAddress">Address</FieldLabel>
              <Input
                id="customerAddress"
                value={customerAddress}
                onChange={(event) => setCustomerAddress(event.target.value)}
              />
            </Field>
          </FieldGroup>

          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>Tehsil</FieldLabel>
              <LocationPicker
                options={tehsils}
                value={tehsilId}
                placeholder="Select tehsil"
                searchPlaceholder="Search tehsil name"
                onChange={(value) => {
                  if (applyingLocation.current) return
                  pendingLocation.current = null
                  setTehsilId(value)
                  setVillageId('')
                  setSettlementId('')
                }}
              />
              <FieldError>{fieldErrors.tehsilId}</FieldError>
            </Field>
            <Field>
              <FieldLabel>Village</FieldLabel>
              <LocationPicker
                options={villages}
                value={villageId}
                placeholder="Select village"
                searchPlaceholder="Search village name"
                disabled={!tehsilId}
                onChange={(value) => {
                  if (applyingLocation.current) return
                  pendingLocation.current = null
                  setVillageId(value)
                  setSettlementId('')
                }}
              />
              <FieldError>{fieldErrors.villageId}</FieldError>
            </Field>
            <Field>
              <FieldLabel>Settlement</FieldLabel>
              <LocationPicker
                options={settlements}
                value={settlementId}
                placeholder="Optional"
                searchPlaceholder="Search settlement"
                disabled={!villageId}
                onChange={(value) => {
                  if (applyingLocation.current) return
                  setSettlementId(value)
                }}
              />
            </Field>
            {tehsilId || documentTehsilName ? (
              <div className="md:col-span-3 rounded-lg bg-primary/6 px-3 py-2.5 text-sm ring-1 ring-primary/15">
                <p className="font-medium">
                  {[
                    locationLabel(tehsils, tehsilId),
                    locationLabel(villages, villageId),
                    locationLabel(settlements, settlementId),
                  ]
                    .filter(Boolean)
                    .join(' → ') || 'Select tehsil and village'}
                </p>
                {documentTehsilName || documentVillageName || siteName ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Report names:{' '}
                    {[documentTehsilName, documentVillageName, siteName]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <Field className="md:col-span-3">
              <FieldLabel htmlFor="locationDetail">Location detail</FieldLabel>
              <Input
                id="locationDetail"
                value={locationDetail}
                onChange={(event) => setLocationDetail(event.target.value)}
                placeholder="Well ID, street, landmark, or scheme name"
              />
              {siteName ? (
                <FieldDescription>Site on report: {siteName}</FieldDescription>
              ) : null}
              <FieldError>{fieldErrors.locationDetail}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="gpsLatitude">Latitude</FieldLabel>
              <Input
                id="gpsLatitude"
                inputMode="decimal"
                value={gpsLatitude}
                onChange={(event) => setGpsLatitude(event.target.value)}
                placeholder="31.5204"
              />
              <FieldError>{fieldErrors.gpsLatitude}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="gpsLongitude">Longitude</FieldLabel>
              <Input
                id="gpsLongitude"
                inputMode="decimal"
                value={gpsLongitude}
                onChange={(event) => setGpsLongitude(event.target.value)}
                placeholder="74.3587"
              />
              <FieldError>{fieldErrors.gpsLongitude}</FieldError>
            </Field>
          </FieldGroup>
      </SectionCard>

      <SectionCard
        step="04"
        icon={Clock3}
        title="Chain of custody"
        description="Reporting date cannot precede sampling. Receipt temperature and humidity are optional laboratory checks."
      >
          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="samplingAt">Sampling</FieldLabel>
              <Input
                id="samplingAt"
                type="datetime-local"
                value={samplingAt}
                onChange={(event) => setSamplingAt(event.target.value)}
              />
              <FieldError>{fieldErrors.samplingAt}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="receivedAt">Received at lab</FieldLabel>
              <Input
                id="receivedAt"
                type="datetime-local"
                value={receivedAt}
                onChange={(event) => setReceivedAt(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reportingDate">Reporting date</FieldLabel>
              <Input
                id="reportingDate"
                type="datetime-local"
                value={reportingDate}
                onChange={(event) => setReportingDate(event.target.value)}
              />
              <FieldError>{fieldErrors.reportingDate}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="receiptTempC">Receipt temperature (°C)</FieldLabel>
              <Input
                id="receiptTempC"
                inputMode="decimal"
                value={receiptTempC}
                onChange={(event) => setReceiptTempC(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="receiptHumidityPct">Receipt humidity (%)</FieldLabel>
              <Input
                id="receiptHumidityPct"
                inputMode="decimal"
                value={receiptHumidityPct}
                onChange={(event) => setReceiptHumidityPct(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="totalPages">Total pages</FieldLabel>
              <Input
                id="totalPages"
                inputMode="numeric"
                value={totalPages}
                onChange={(event) => setTotalPages(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="analysisFrom">Analysis from</FieldLabel>
              <Input
                id="analysisFrom"
                type="datetime-local"
                value={analysisFrom}
                onChange={(event) => setAnalysisFrom(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="analysisTo">Analysis to</FieldLabel>
              <Input
                id="analysisTo"
                type="datetime-local"
                value={analysisTo}
                onChange={(event) => setAnalysisTo(event.target.value)}
              />
            </Field>
          </FieldGroup>
      </SectionCard>

      <SectionCard
        step="05"
        icon={FlaskConical}
        title="Parameter results"
        description={
          formType === 'PRIORITY'
            ? 'All ten priority parameters are required before save or submit.'
            : 'Enter every measured parameter. Empty rows are omitted from the payload.'
        }
        contentClassName="space-y-4"
      >
          {loadingMeta ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading parameter catalog…
            </div>
          ) : (
            groupedParameters.map((group) => {
              const groupFilled = group.items.filter((item) =>
                Boolean(resultValues[item.code]?.trim()),
              ).length
              return (
              <div
                key={group.category}
                className={`param-group border-l-4 ${CATEGORY_ACCENT[group.category]}`}
              >
                <div className="param-group-head">
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {groupFilled} / {group.items.length} entered
                  </span>
                </div>
                <Table className="enterprise-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[28%]">Parameter</TableHead>
                      <TableHead className="w-[12%]">Unit</TableHead>
                      <TableHead className="w-[18%]">NSDWQ / WHO</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map((parameter) => (
                      <TableRow key={parameter.code}>
                        <TableCell>
                          <div className="font-medium">{parameter.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {parameter.code}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {parameter.units ?? '—'}
                        </TableCell>
                        <TableCell>{parameter.limitDisplay}</TableCell>
                        <TableCell>
                          {parameter.limitOperator === 'QUALITATIVE' ? (
                            <Select
                              value={resultValues[parameter.code] || undefined}
                              onValueChange={(value) =>
                                setResultValues((current) => ({
                                  ...current,
                                  [parameter.code]: value ?? '',
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select result" />
                              </SelectTrigger>
                              <SelectContent>
                                {parameter.qualitativeAllowed.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={resultValues[parameter.code] ?? ''}
                              onChange={(event) =>
                                setResultValues((current) => ({
                                  ...current,
                                  [parameter.code]: event.target.value,
                                }))
                              }
                              placeholder={parameterHint(parameter)}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              )
            })
          )}
          <FieldError>{fieldErrors.results}</FieldError>
      </SectionCard>

      <SectionCard
        step="06"
        icon={ShieldCheck}
        title="Judgment and submission"
        description="The server applies catalog limits. Overall remarks can be overridden only after review of the computed conformity."
        contentClassName="space-y-4"
      >
          {preview ? (
            <div className="grid gap-3 rounded-lg bg-muted/40 p-4 ring-1 ring-border sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Physical
                </div>
                <ConformityBadge value={preview.physicalConformity} />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Chemical
                </div>
                <ConformityBadge value={preview.chemicalConformity} />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Trace
                </div>
                <ConformityBadge value={preview.traceConformity} />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Microbial
                </div>
                <ConformityBadge value={preview.microbialConformity} />
              </div>
              <p className="text-sm font-medium sm:col-span-2 lg:col-span-4">
                {preview.overallRemarks}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <ClipboardCheck className="size-4" />
              Run Validate judgment to preview NSDWQ conformity before submit.
            </div>
          )}

          <Field>
            <FieldLabel htmlFor="remarksOverride">Remarks override</FieldLabel>
            <Textarea
              id="remarksOverride"
              value={remarksOverride}
              onChange={(event) => setRemarksOverride(event.target.value)}
              placeholder="Leave blank to use the engine remarks (Safe / Un-Safe For drinking)"
            />
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id="termsAgreed"
              checked={termsAgreed}
              onCheckedChange={(checked) => setTermsAgreed(checked === true)}
            />
            <FieldLabel htmlFor="termsAgreed" className="font-normal">
              I confirm sampling chain-of-custody, NSDWQ limits, and that these
              results are ready for PRMSC review.
            </FieldLabel>
          </Field>
          <FieldError>{fieldErrors.termsAgreed}</FieldError>
          <FieldDescription>
            Drafts can be saved without acceptance. Submission for manager
            review requires the confirmation above.
          </FieldDescription>

          {formError ? (
            <Alert variant="destructive">
              <AlertTitle>Validation failed</AlertTitle>
              <AlertDescription>
                <p>{formError}</p>
                {serverErrors.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {serverErrors.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
      </SectionCard>

      <div className="form-sticky-actions flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Drafts do not require terms. Submission sends the record to PRMSC
          review.
        </p>
        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy !== null}
              onClick={() =>
                navigate(pcrwrRecordsPath(loadedStatus ?? undefined))
              }
            >
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void onValidate()}
          >
            {busy === 'validate' ? <Spinner /> : null}
            Validate judgment
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void persist('draft')}
          >
            {busy === 'draft' ? <Spinner /> : null}
            {isEditing ? 'Save changes' : 'Save draft'}
          </Button>
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() => void persist('submit')}
          >
            {busy === 'submit' ? <Spinner /> : null}
            Submit for review
          </Button>
        </div>
      </div>
    </div>
  )
}
