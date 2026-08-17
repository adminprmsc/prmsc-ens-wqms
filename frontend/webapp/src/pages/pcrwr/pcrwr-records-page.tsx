import { useCallback, useEffect, useState } from 'react'
import { FileCheck2, FileText, RefreshCw, Timer } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/app/page-header'
import { MetricCard } from '@/components/app/metric-card'
import { SectionCard } from '@/components/app/section-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { ReportDetailPanel } from '@/components/water-quality/report-detail-panel'
import { DownloadSourceFileButton } from '@/components/water-quality/download-source-file-button'
import {
  ConformityBadge,
  ReportStatusBadge,
} from '@/components/water-quality/status-badge'
import { ApiError } from '@/lib/api'
import {
  getReport,
  listReports,
  submitReport,
  type WaterQualityReportDetail,
  type WaterQualityReportSummary,
} from '@/lib/water-quality-api'
import {
  REPORT_STATUS_LABELS,
  SAMPLE_TYPE_LABELS,
  formatReportDate,
} from '@/lib/water-quality-labels'
import {
  isEditableReportStatus,
  pcrwrEditReportPath,
  pcrwrRecordsPath,
} from '@/lib/routes'

const STATUS_FILTERS = [
  'ALL',
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
] as const

export function PcrwrRecordsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>(
    STATUS_FILTERS.includes(statusParam as (typeof STATUS_FILTERS)[number])
      ? (statusParam as (typeof STATUS_FILTERS)[number])
      : 'ALL',
  )
  const [rows, setRows] = useState<WaterQualityReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WaterQualityReportDetail | null>(
    null,
  )
  const [detailOpen, setDetailOpen] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  useEffect(() => {
    const next = STATUS_FILTERS.includes(
      statusParam as (typeof STATUS_FILTERS)[number],
    )
      ? (statusParam as (typeof STATUS_FILTERS)[number])
      : 'ALL'
    setStatus(next)
  }, [statusParam])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listReports({
        status: status === 'ALL' ? undefined : status,
        page: '1',
        pageSize: '50',
      })
      setRows(data.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load records')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  async function openDetail(id: string) {
    try {
      const report = await getReport(id)
      setSelected(report)
      setDetailOpen(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Unable to open report')
    }
  }

  async function onSubmit(id: string) {
    setSubmittingId(id)
    try {
      await submitReport(id)
      toast.success('Report submitted for PRMSC review')
      await load()
      if (selected?.id === id) {
        setSelected(await getReport(id))
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Submit failed')
    } finally {
      setSubmittingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Laboratory register"
        title="My records"
        description="Drafts, submissions, and approved reports owned by or visible to this PCRWR account."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Drafts"
          value={loading ? '—' : String(rows.filter((row) => row.status === 'DRAFT').length)}
          description="Not yet sent for review. Open to edit."
          icon={FileText}
          tone="info"
          to={pcrwrRecordsPath('DRAFT')}
        />
        <MetricCard
          title="In review"
          value={
            loading
              ? '—'
              : String(rows.filter((row) => row.status === 'PENDING_REVIEW').length)
          }
          description="Waiting on PRMSC sign-off."
          icon={Timer}
          tone="warning"
        />
        <MetricCard
          title="Approved"
          value={
            loading ? '—' : String(rows.filter((row) => row.status === 'APPROVED').length)
          }
          description="Accepted against NSDWQ limits."
          icon={FileCheck2}
          tone="success"
        />
      </div>

      <SectionCard
        icon={FileText}
        title="Water quality reports"
        description="Submit drafts after terms are accepted. Rejected reports can be corrected and sent again."
        actions={
          <Select
            value={status}
            onValueChange={(value) => {
              if (!value) return
              const next = value as (typeof STATUS_FILTERS)[number]
              setStatus(next)
              setSearchParams(next === 'ALL' ? {} : { status: next })
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'ALL'
                    ? 'All statuses'
                    : REPORT_STATUS_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load records</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>No reports yet</EmptyTitle>
                <EmptyDescription>
                  Create a field-data report to see it in this list.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table className="enterprise-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Sample</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Overall</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.reportSerialNo}
                    </TableCell>
                    <TableCell>
                      <div>{row.tehsil.name} / {row.village.name}</div>
                      {row.siteName ? (
                        <div className="text-xs text-muted-foreground">
                          {row.siteName}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.sourceType?.name ??
                        SAMPLE_TYPE_LABELS[
                          row.sampleType as keyof typeof SAMPLE_TYPE_LABELS
                        ] ??
                        row.sampleType}
                    </TableCell>
                    <TableCell>{formatReportDate(row.reportingDate)}</TableCell>
                    <TableCell>
                      <ConformityBadge
                        value={
                          row.physicalConformity === 'UNSAFE' ||
                          row.chemicalConformity === 'UNSAFE' ||
                          row.traceConformity === 'UNSAFE' ||
                          row.microbialConformity === 'UNSAFE'
                            ? 'UNSAFE'
                            : 'SAFE'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <ReportStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void openDetail(row.id)}
                        >
                          View
                        </Button>
                        <DownloadSourceFileButton
                          reportId={row.id}
                          fileName={row.sourceFile?.fileName}
                        />
                        {isEditableReportStatus(row.status) ? (
                          <Button size="sm" variant="outline" render={<Link to={pcrwrEditReportPath(row.id)} />}>
                            Edit
                          </Button>
                        ) : null}
                        {(row.status === 'DRAFT' || row.status === 'REJECTED') && (
                          <Button
                            size="sm"
                            disabled={submittingId === row.id}
                            onClick={() => void onSubmit(row.id)}
                          >
                            {submittingId === row.id ? <Spinner /> : null}
                            Submit
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </SectionCard>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>Report detail</SheetTitle>
            <SheetDescription>
              Parameter-level judgment snapshot stored with the report.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {selected ? <ReportDetailPanel report={selected} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
