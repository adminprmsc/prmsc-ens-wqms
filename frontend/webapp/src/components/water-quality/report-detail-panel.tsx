import { Link } from 'react-router-dom'

import { ConformityBadge, ReportStatusBadge } from '@/components/water-quality/status-badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { WaterQualityReportDetail } from '@/lib/water-quality-api'
import {
  FORM_TYPE_LABELS,
  REPORT_CATEGORY_LABELS,
  SAMPLE_TYPE_LABELS,
  formatReportDate,
} from '@/lib/water-quality-labels'
import { cn } from '@/lib/utils'
import {
  isEditableReportStatus,
  pcrwrEditReportPath,
} from '@/lib/routes'

function resultDisplay(result: WaterQualityReportDetail['results'][number]) {
  if (result.numericValue !== null && result.numericValue !== undefined) {
    return result.numericValue
  }
  return result.qualitativeValue ?? '—'
}

export function ReportDetailPanel({
  report,
}: {
  report: WaterQualityReportDetail
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ReportStatusBadge status={report.status} />
        <span className="text-sm text-muted-foreground">
          {report.reportSerialNo}
        </span>
        {isEditableReportStatus(report.status) ? (
          <Link
            to={pcrwrEditReportPath(report.id)}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Edit report
          </Link>
        ) : null}
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="font-medium">{report.customerName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="font-medium">
            {report.sourceType?.name ??
              SAMPLE_TYPE_LABELS[
                report.sampleType as keyof typeof SAMPLE_TYPE_LABELS
              ] ??
              report.sampleType}
            {report.sourceLabel && report.sourceLabel !== report.sourceType?.name
              ? ` (${report.sourceLabel})`
              : ''}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Location</dt>
          <dd className="font-medium">
            {[report.tehsil.name, report.village.name, report.settlement?.name]
              .filter(Boolean)
              .join(' / ')}
          </dd>
        </div>
        {report.documentTehsilName || report.documentVillageName ? (
          <div>
            <dt className="text-muted-foreground">Report place names</dt>
            <dd className="font-medium">
              {[report.documentTehsilName, report.documentVillageName]
                .filter(Boolean)
                .join(' / ')}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">Detail</dt>
          <dd className="font-medium">
            {report.siteName
              ? `${report.siteName}${report.locationDetail ? ` · ${report.locationDetail}` : ''}`
              : report.locationDetail}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Category</dt>
          <dd>
            {REPORT_CATEGORY_LABELS[
              report.reportCategory as keyof typeof REPORT_CATEGORY_LABELS
            ] ?? report.reportCategory}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Form</dt>
          <dd>
            {FORM_TYPE_LABELS[
              report.formType as keyof typeof FORM_TYPE_LABELS
            ] ?? report.formType}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sampled</dt>
          <dd>{formatReportDate(report.samplingAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Reported</dt>
          <dd>{formatReportDate(report.reportingDate)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">GPS</dt>
          <dd>
            {report.gpsLatitude && report.gpsLongitude
              ? `${report.gpsLatitude}, ${report.gpsLongitude}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Created by</dt>
          <dd>{report.createdBy?.name ?? '—'}</dd>
        </div>
      </dl>

      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Physical</span>
          <ConformityBadge value={report.physicalConformity} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Chemical</span>
          <ConformityBadge value={report.chemicalConformity} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Trace</span>
          <ConformityBadge value={report.traceConformity} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Microbial</span>
          <ConformityBadge value={report.microbialConformity} />
        </div>
        <p className="text-sm font-medium sm:col-span-2">
          {report.overallRemarks}
        </p>
        {report.rejectionReason ? (
          <p className="text-sm text-destructive sm:col-span-2">
            Rejection: {report.rejectionReason}
          </p>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Parameter</TableHead>
            <TableHead>Limit</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Judgment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.results.map((result) => (
            <TableRow
              key={result.id}
              className={cn(result.exceedsLimit && 'bg-destructive/5')}
            >
              <TableCell>
                <div className="font-medium">{result.parameter.name}</div>
                <div className="text-xs text-muted-foreground">
                  {result.parameter.code}
                </div>
              </TableCell>
              <TableCell>{result.limitDisplaySnap}</TableCell>
              <TableCell>
                {resultDisplay(result)}
                {result.parameter.units ? (
                  <span className="ml-1 text-muted-foreground">
                    {result.parameter.units}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                {result.exceedsLimit ? (
                  <span className="text-destructive">Exceeds</span>
                ) : result.isJudged ? (
                  <span className="text-emerald-700">Within limit</span>
                ) : (
                  <span className="text-muted-foreground">Recorded</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
