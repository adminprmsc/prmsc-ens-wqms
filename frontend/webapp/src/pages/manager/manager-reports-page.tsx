import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, RefreshCw, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ListPagination } from '@/components/app/list-pagination'
import { PageHeader } from '@/components/app/page-header'
import { SectionCard } from '@/components/app/section-card'
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { LocationPicker } from '@/components/water-quality/location-picker'
import {
  ConformityBadge,
  ReportStatusBadge,
} from '@/components/water-quality/status-badge'
import { ApiError } from '@/lib/api'
import {
  listSettlements,
  listTehsils,
  listVillages,
  type LocationOption,
} from '@/lib/locations-api'
import { managerReviewPath } from '@/lib/routes'
import {
  approveReport,
  listReports,
  rejectReport,
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
const PAGE_SIZE = 15

function canReview(statusValue: string) {
  return statusValue === 'PENDING_REVIEW' || statusValue === 'SUBMITTED'
}

export function ManagerReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status = STATUS_FILTERS.includes(
    statusParam as (typeof STATUS_FILTERS)[number],
  )
    ? (statusParam as (typeof STATUS_FILTERS)[number])
    : 'PENDING_REVIEW'
  const tehsilId = searchParams.get('tehsilId') ?? ''
  const villageId = searchParams.get('villageId') ?? ''
  const settlementId = searchParams.get('settlementId') ?? ''
  const serial = searchParams.get('serial') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const [serialInput, setSerialInput] = useState(serial)
  const [tehsils, setTehsils] = useState<LocationOption[]>([])
  const [villages, setVillages] = useState<LocationOption[]>([])
  const [settlements, setSettlements] = useState<LocationOption[]>([])
  const [rows, setRows] = useState<WaterQualityReportSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    setSerialInput(serial)
  }, [serial])

  useEffect(() => {
    void listTehsils().then(setTehsils).catch(() => setTehsils([]))
  }, [])

  useEffect(() => {
    if (!tehsilId) {
      setVillages([])
      return
    }
    void listVillages(tehsilId).then(setVillages).catch(() => setVillages([]))
  }, [tehsilId])

  useEffect(() => {
    if (!villageId) {
      setSettlements([])
      return
    }
    void listSettlements(villageId)
      .then(setSettlements)
      .catch(() => setSettlements([]))
  }, [villageId])

  const patchParams = useCallback(
    (next: Record<string, string | undefined>, resetPage = true) => {
      const merged = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(next)) {
        if (!value) merged.delete(key)
        else merged.set(key, value)
      }
      if (resetPage) merged.delete('page')
      setSearchParams(merged)
    },
    [searchParams, setSearchParams],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listReports({
        status: status === 'ALL' ? undefined : status,
        tehsilId: tehsilId || undefined,
        villageId: villageId || undefined,
        settlementId: settlementId || undefined,
        serial: serial || undefined,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      setRows(data.items)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load reports')
    } finally {
      setLoading(false)
    }
  }, [status, tehsilId, villageId, settlementId, serial, page])

  useEffect(() => {
    void load()
  }, [load])

  async function onApprove(id: string) {
    setBusyId(id)
    try {
      await approveReport(id)
      toast.success('Report approved and added to monitoring')
      await load()
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
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Reject failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="PRMSC review"
        title="Reports"
        description="Inspect PCRWR submissions by place and serial. Approval locks the record into monitoring; rejection returns it with a reason."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <SectionCard
        icon={ClipboardCheck}
        title="Review queue"
        description="Drafts stay with PCRWR. Filter the queue, then open a report for the full laboratory record."
      >
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field>
            <FieldLabel>Status</FieldLabel>
            <Select
              value={status}
              onValueChange={(value) => {
                if (value) patchParams({ status: value })
              }}
            >
              <SelectTrigger className="w-full">
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
          </Field>
          <Field>
            <FieldLabel>Tehsil</FieldLabel>
            <LocationPicker
              options={tehsils}
              value={tehsilId}
              emptyLabel="All tehsils"
              placeholder="All tehsils"
              onChange={(id) =>
                patchParams({
                  tehsilId: id || undefined,
                  villageId: undefined,
                  settlementId: undefined,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>Village</FieldLabel>
            <LocationPicker
              options={villages}
              value={villageId}
              emptyLabel="All villages"
              placeholder="All villages"
              disabled={!tehsilId}
              onChange={(id) =>
                patchParams({
                  villageId: id || undefined,
                  settlementId: undefined,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>Settlement</FieldLabel>
            <LocationPicker
              options={settlements}
              value={settlementId}
              emptyLabel="All settlements"
              placeholder="All settlements"
              disabled={!villageId}
              onChange={(id) =>
                patchParams({ settlementId: id || undefined })
              }
            />
          </Field>
          <Field>
            <FieldLabel>Serial / NWQL</FieldLabel>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                patchParams({ serial: serialInput.trim() || undefined })
              }}
            >
              <Input
                value={serialInput}
                onChange={(event) => setSerialInput(event.target.value)}
                placeholder="AR-04992"
              />
              <Button type="submit" variant="outline" size="sm">
                <Search />
              </Button>
            </form>
          </Field>
        </div>

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
              <EmptyTitle>No matching reports</EmptyTitle>
              <EmptyDescription>
                Adjust status, place, or serial to widen the queue.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table className="enterprise-table">
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
                      <div>
                        {row.tehsil.name} / {row.village.name}
                      </div>
                      {row.settlement?.name || row.siteName ? (
                        <div className="text-xs text-muted-foreground">
                          {row.settlement?.name ?? row.siteName}
                        </div>
                      ) : null}
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
                        <Link
                          to={managerReviewPath(row.id)}
                          className={buttonVariants({
                            variant: 'outline',
                            size: 'sm',
                          })}
                        >
                          Review
                        </Link>
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
            <ListPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={(next) =>
                patchParams({ page: next > 1 ? String(next) : undefined }, false)
              }
            />
          </>
        )}
      </SectionCard>

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
