import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/app/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ReportDetailPanel } from '@/components/water-quality/report-detail-panel'
import { ApiError } from '@/lib/api'
import { managerMonitoringPath, managerReportsPath } from '@/lib/routes'
import {
  approveReport,
  getReport,
  rejectReport,
  type WaterQualityReportDetail,
} from '@/lib/water-quality-api'

function canReview(statusValue: string) {
  return statusValue === 'PENDING_REVIEW' || statusValue === 'SUBMITTED'
}

export function ManagerReportReviewPage() {
  const { reportId } = useParams<{ reportId: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<WaterQualityReportDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!reportId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getReport(reportId)
      .then((data) => {
        if (!cancelled) setReport(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unable to open report')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reportId])

  async function onApprove() {
    if (!report) return
    setBusy('approve')
    try {
      const updated = await approveReport(report.id)
      setReport(updated)
      toast.success('Report approved. It now appears in monitoring.')
      navigate(managerMonitoringPath({ tehsilId: updated.tehsil.id }), {
        replace: true,
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Approve failed')
    } finally {
      setBusy(null)
    }
  }

  async function onReject() {
    if (!report) return
    if (reason.trim().length < 8) {
      toast.error('Provide at least 8 characters for the rejection reason')
      return
    }
    setBusy('reject')
    try {
      const updated = await rejectReport(report.id, reason.trim())
      setReport(updated)
      toast.success('Report returned to PCRWR')
      setRejectOpen(false)
      navigate(managerReportsPath({ status: 'REJECTED' }), { replace: true })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Reject failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Laboratory review"
        title={report ? `Review ${report.reportSerialNo}` : 'Review report'}
        description="Full identity, place hierarchy, custody dates, NSDWQ judgments, and parameter snapshots for this submission."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={managerReportsPath({ status: 'PENDING_REVIEW' })}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <ArrowLeft />
              Back to queue
            </Link>
            {report && canReview(report.status) ? (
              <>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void onApprove()}
                >
                  {busy === 'approve' ? <Spinner /> : null}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Report unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : report ? (
        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <ReportDetailPanel report={report} />
        </div>
      ) : null}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Return report</DialogTitle>
            <DialogDescription>
              PCRWR will see this reason and can resubmit after correction.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="review-rejection-reason">Reason</FieldLabel>
            <Textarea
              id="review-rejection-reason"
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
              disabled={busy === 'reject'}
              onClick={() => void onReject()}
            >
              {busy === 'reject' ? <Spinner /> : null}
              Reject report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
