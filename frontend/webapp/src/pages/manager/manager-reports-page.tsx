import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
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
import { Textarea } from '@/components/ui/textarea'
import { ReportDetailPanel } from '@/components/water-quality/report-detail-panel'
import {
  ConformityBadge,
  ReportStatusBadge,
} from '@/components/water-quality/status-badge'
import { ApiError } from '@/lib/api'
import {
  approveReport,
  getReport,
  listReports,
  rejectReport,
  type WaterQualityReportDetail,
  type WaterQualityReportSummary,
} from '@/lib/water-quality-api'
import {
  REPORT_STATUS_LABELS,
  formatReportDate,
} from '@/lib/water-quality-labels'

const STATUS_FILTERS = [
  'PENDING_REVIEW',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ALL',
] as const

export function ManagerReportsPage() {
  const [status, setStatus] =
    useState<(typeof STATUS_FILTERS)[number]>('PENDING_REVIEW')
  const [rows, setRows] = useState<WaterQualityReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WaterQualityReportDetail | null>(
    null,
  )
  const [detailOpen, setDetailOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listReports({
        status: status === 'ALL' ? undefined : status,
      })
      setRows(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load reports')
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

  async function onApprove(id: string) {
    setBusyId(id)
    try {
      await approveReport(id)
      toast.success('Report approved')
      await load()
      if (selected?.id === id) setSelected(await getReport(id))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  async function onReject() {
    if (!rejectId) return
    if (reason.trim().length < 8) {
      toast.error('Provide at least 8 characters for the rejection reason')
      return
    }
    setBusyId(rejectId)
    try {
      await rejectReport(rejectId, reason.trim())
      toast.success('Report returned to PCRWR')
      setRejectOpen(false)
      setReason('')
      await load()
      if (selected?.id === rejectId) setSelected(await getReport(rejectId))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Reject failed')
    } finally {
      setBusyId(null)
    }
  }

  function canReview(statusValue: string) {
    return statusValue === 'PENDING_REVIEW' || statusValue === 'SUBMITTED'
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Reports</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review PCRWR submissions. Approval locks the report; rejection returns
          it with a reason so field staff can correct and resubmit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4" />
            Review queue
          </CardTitle>
          <CardDescription>
            Drafts stay with PCRWR users and are not shown here.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw />
              Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            value={status}
            onValueChange={(value) => {
              if (value) setStatus(value as (typeof STATUS_FILTERS)[number])
            }}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'ALL'
                    ? 'All visible reports'
                    : REPORT_STATUS_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load reports</AlertTitle>
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
                  <ClipboardCheck />
                </EmptyMedia>
                <EmptyTitle>Queue is clear</EmptyTitle>
                <EmptyDescription>
                  No reports match this filter.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Analyst</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Microbial</TableHead>
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
                      {row.tehsil.name} / {row.village.name}
                    </TableCell>
                    <TableCell>{row.createdBy?.name ?? '—'}</TableCell>
                    <TableCell>{formatReportDate(row.reportingDate)}</TableCell>
                    <TableCell>
                      <ConformityBadge value={row.microbialConformity} />
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
                          Review
                        </Button>
                        {canReview(row.status) ? (
                          <>
                            <Button
                              size="sm"
                              disabled={busyId === row.id}
                              onClick={() => void onApprove(row.id)}
                            >
                              {busyId === row.id ? <Spinner /> : null}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busyId === row.id}
                              onClick={() => {
                                setRejectId(row.id)
                                setRejectOpen(true)
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>Manager review</SheetTitle>
            <SheetDescription>
              Four-way conformity and stored parameter snapshots.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {selected ? <ReportDetailPanel report={selected} /> : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Return report</DialogTitle>
            <DialogDescription>
              PCRWR will see this reason and can resubmit after correction.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="rejection-reason">Reason</FieldLabel>
            <Textarea
              id="rejection-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe the data, sampling, or limit issue"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyId === rejectId}
              onClick={() => void onReject()}
            >
              {busyId === rejectId ? <Spinner /> : null}
              Reject report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
