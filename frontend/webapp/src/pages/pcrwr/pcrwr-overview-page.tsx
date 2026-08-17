import { useEffect, useState } from 'react'
import { ClipboardCheck, Droplets, FileCheck2, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/auth/auth-context'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ReportStatusBadge } from '@/components/water-quality/status-badge'
import { PortalHomePage } from '@/pages/shared/portal-home-page'
import { listReports, type WaterQualityReportSummary } from '@/lib/water-quality-api'
import { formatReportDate } from '@/lib/water-quality-labels'
import {
  isEditableReportStatus,
  pcrwrEditReportPath,
  pcrwrRecordsPath,
} from '@/lib/routes'

export function PcrwrOverviewPage() {
  const { user } = useAuth()
  const [drafts, setDrafts] = useState<number | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const [approved, setApproved] = useState<number | null>(null)
  const [recent, setRecent] = useState<WaterQualityReportSummary[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listReports({ status: 'DRAFT' }),
      listReports({ status: 'PENDING_REVIEW' }),
      listReports({ status: 'APPROVED' }),
      listReports(),
    ])
      .then(([draftRows, pendingRows, approvedRows, allRows]) => {
        if (cancelled) return
        setDrafts(draftRows.length)
        setPending(pendingRows.length)
        setApproved(approvedRows.length)
        setRecent(allRows.slice(0, 6))
      })
      .catch(() => {
        if (!cancelled) {
          setDrafts(0)
          setPending(0)
          setApproved(0)
          setRecent([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PortalHomePage
      eyebrow="PCRWR field laboratory"
      title={`Welcome, ${user?.name ?? 'PCRWR User'}`}
      description="Capture NWQL field samples, keep chain-of-custody intact, and submit potable-water judgments for PRMSC environmental review."
      cards={[
        {
          title: 'Drafts in progress',
          description: 'Priority or full-suite reports not yet submitted.',
          icon: Droplets,
          to: pcrwrRecordsPath('DRAFT'),
          value: drafts === null ? '—' : String(drafts),
          tone: 'info',
        },
        {
          title: 'Awaiting PRMSC',
          description: 'Submitted records in manager review.',
          icon: FileText,
          to: pcrwrRecordsPath('PENDING_REVIEW'),
          value: pending === null ? '—' : String(pending),
          tone: 'warning',
        },
        {
          title: 'Approved reports',
          description: 'NSDWQ judgments accepted by PRMSC.',
          icon: FileCheck2,
          to: pcrwrRecordsPath('APPROVED'),
          value: approved === null ? '—' : String(approved),
          tone: 'success',
        },
      ]}
      steps={[
        {
          label: 'Import or enter',
          detail: 'Drop an NWQL Word/PDF report or complete the field-data form.',
        },
        {
          label: 'Validate limits',
          detail: 'Confirm tehsil → village → settlement and NSDWQ / WHO results.',
        },
        {
          label: 'Submit for review',
          detail: 'Accept chain-of-custody terms and send the draft to PRMSC.',
        },
      ]}
      extra={
        <section className="rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold">Recent laboratory records</h3>
              <p className="text-[13px] text-muted-foreground">
                Latest reports visible to this PCRWR account.
              </p>
            </div>
            <Link
              to="/pcrwr/records"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Open records
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted-foreground">
              <ClipboardCheck className="size-4" />
              No reports yet. Import an NWQL file on Field data to begin.
            </div>
          ) : (
            <Table className="enterprise-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.reportSerialNo}</TableCell>
                    <TableCell>
                      {row.tehsil.name} / {row.village.name}
                    </TableCell>
                    <TableCell>{formatReportDate(row.reportingDate)}</TableCell>
                    <TableCell>
                      <ReportStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditableReportStatus(row.status) ? (
                        <Link
                          to={pcrwrEditReportPath(row.id)}
                          className={buttonVariants({
                            variant: 'outline',
                            size: 'sm',
                          })}
                        >
                          Edit
                        </Link>
                      ) : (
                        <Link
                          to={pcrwrRecordsPath()}
                          className={buttonVariants({
                            variant: 'ghost',
                            size: 'sm',
                          })}
                        >
                          View
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      }
    />
  )
}
