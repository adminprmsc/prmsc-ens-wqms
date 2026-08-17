import { Badge } from '@/components/ui/badge'
import {
  CONFORMITY_LABELS,
  REPORT_STATUS_LABELS,
} from '@/lib/water-quality-labels'
import { cn } from '@/lib/utils'

export function ReportStatusBadge({ status }: { status: string }) {
  const label =
    REPORT_STATUS_LABELS[status as keyof typeof REPORT_STATUS_LABELS] ?? status
  return (
    <Badge
      variant="outline"
      className={cn(
        status === 'APPROVED' &&
          'border-emerald-200 bg-emerald-50 text-emerald-800',
        status === 'REJECTED' &&
          'border-destructive/30 bg-destructive/10 text-destructive',
        status === 'PENDING_REVIEW' &&
          'border-amber-200 bg-amber-50 text-amber-800',
        status === 'SUBMITTED' &&
          'border-sky-200 bg-sky-50 text-sky-800',
        status === 'DRAFT' && 'text-muted-foreground',
      )}
    >
      {label}
    </Badge>
  )
}

export function ConformityBadge({
  value,
}: {
  value: string | null | undefined
}) {
  if (!value) {
    return <span className="text-muted-foreground">—</span>
  }
  const unsafe = value === 'UNSAFE'
  return (
    <Badge
      variant="outline"
      className={
        unsafe
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }
    >
      {CONFORMITY_LABELS[value as keyof typeof CONFORMITY_LABELS] ?? value}
    </Badge>
  )
}
