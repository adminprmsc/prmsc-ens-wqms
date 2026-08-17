import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ClipboardList,
  Download,
  Droplets,
  MapPinned,
  ShieldCheck,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { MetricCard } from '@/components/app/metric-card'
import { PageHeader } from '@/components/app/page-header'
import { SectionCard } from '@/components/app/section-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Field, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LocationPicker } from '@/components/water-quality/location-picker'
import { ConformityBadge } from '@/components/water-quality/status-badge'
import { ApiError } from '@/lib/api'
import {
  listSettlements,
  listTehsils,
  listVillages,
  type LocationOption,
} from '@/lib/locations-api'
import {
  managerMonitoringPath,
  managerReportsPath,
  managerReviewPath,
} from '@/lib/routes'
import {
  downloadApprovedReportsCsv,
  fetchReportAnalytics,
  type ReportAnalytics,
  type RiskBand,
} from '@/lib/water-quality-api'
import { formatReportDate } from '@/lib/water-quality-labels'
import { cn } from '@/lib/utils'

const judgmentConfig = {
  potable: { label: 'Potable', color: 'var(--chart-2)' },
  unsafe: { label: 'Not potable', color: 'var(--chart-5)' },
} satisfies ChartConfig

const hazardConfig = {
  Physical: { label: 'Physical', color: 'var(--chart-1)' },
  Chemical: { label: 'Chemical', color: 'var(--chart-3)' },
  Trace: { label: 'Trace', color: 'var(--chart-4)' },
  Microbial: { label: 'Microbial', color: 'var(--chart-5)' },
} satisfies ChartConfig

const trendConfig = {
  cumulativeSafe: { label: 'Cumulative potable', color: 'var(--chart-2)' },
  cumulativeUnsafe: { label: 'Cumulative unsafe', color: 'var(--chart-5)' },
  approved: { label: 'Approved this month', color: 'var(--chart-1)' },
} satisfies ChartConfig

const tehsilConfig = {
  unsafePhysical: { label: 'Physical', color: 'var(--chart-1)' },
  unsafeChemical: { label: 'Chemical', color: 'var(--chart-3)' },
  unsafeMicrobial: { label: 'Microbial', color: 'var(--chart-5)' },
} satisfies ChartConfig

const BAND_CLASS: Record<RiskBand | 'INSUFFICIENT', string> = {
  CRITICAL: 'bg-destructive/10 text-destructive ring-destructive/20',
  HIGH: 'bg-amber-500/10 text-amber-800 ring-amber-500/20',
  WATCH: 'bg-sky-500/10 text-sky-800 ring-sky-500/20',
  STABLE: 'bg-emerald-500/10 text-emerald-800 ring-emerald-500/20',
  NONE: 'bg-muted text-muted-foreground ring-border',
  INSUFFICIENT: 'bg-muted text-muted-foreground ring-border',
}

const STANCE_LABEL: Record<ReportAnalytics['brief']['stance'], string> = {
  CRITICAL: 'Critical — not potable',
  HIGH: 'High risk',
  WATCH: 'Watch',
  STABLE: 'Potable',
  INSUFFICIENT: 'Insufficient evidence',
}

function RiskChip({ band }: { band: RiskBand | ReportAnalytics['brief']['stance'] }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1',
        BAND_CLASS[band],
      )}
    >
      {band === 'INSUFFICIENT' ? 'No evidence' : band.toLowerCase()}
    </span>
  )
}

function RateBar({ value, tone }: { value: number; tone: 'danger' | 'ok' }) {
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full',
            tone === 'danger' ? 'bg-destructive' : 'bg-emerald-600',
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
        {value}%
      </span>
    </div>
  )
}

function formatMonth(period: string) {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))
}

export function ManagerOperationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tehsilId = searchParams.get('tehsilId') ?? ''
  const villageId = searchParams.get('villageId') ?? ''
  const settlementId = searchParams.get('settlementId') ?? ''

  const [tehsils, setTehsils] = useState<LocationOption[]>([])
  const [villages, setVillages] = useState<LocationOption[]>([])
  const [settlements, setSettlements] = useState<LocationOption[]>([])
  const [data, setData] = useState<ReportAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'samples' | 'summary' | null>(null)

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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchReportAnalytics({
      tehsilId: tehsilId || undefined,
      villageId: villageId || undefined,
      settlementId: settlementId || undefined,
    })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Unable to load monitoring analytics',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tehsilId, villageId, settlementId])

  function patchParams(next: Record<string, string | undefined>) {
    const merged = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (!value) merged.delete(key)
      else merged.set(key, value)
    }
    setSearchParams(merged)
  }

  async function onExport(view: 'samples' | 'summary') {
    setExporting(view)
    try {
      await downloadApprovedReportsCsv({
        tehsilId: tehsilId || undefined,
        villageId: villageId || undefined,
        settlementId: settlementId || undefined,
        view,
      })
      toast.success(
        view === 'summary'
          ? 'Village accumulative summary downloaded'
          : 'Approved sample register downloaded',
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const totals = data?.totals
  const judgmentRows = useMemo(
    () => [
      { name: 'potable', value: totals?.safe ?? 0, fill: 'var(--color-potable)' },
      { name: 'unsafe', value: totals?.unsafe ?? 0, fill: 'var(--color-unsafe)' },
    ],
    [totals],
  )
  const hazardRows = useMemo(
    () =>
      (data?.hazards ?? []).map((row) => ({
        ...row,
        fill: `var(--color-${row.name})`,
      })),
    [data],
  )
  const monthRows = useMemo(
    () =>
      (data?.byMonth ?? []).map((row) => ({
        ...row,
        label: formatMonth(row.period),
      })),
    [data],
  )
  const tehsilChartRows = useMemo(
    () =>
      (data?.byTehsil ?? []).slice(0, 10).map((row) => ({
        name: row.tehsilName,
        unsafePhysical: row.unsafePhysical,
        unsafeChemical: row.unsafeChemical,
        unsafeMicrobial: row.unsafeMicrobial,
      })),
    [data],
  )

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Monitoring and evaluation"
        title="Decision desk"
        description="Approved PCRWR samples, scaled by tehsil and village. Use the brief, charts, and accumulative register to decide where water is potable and where to intervene."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={exporting !== null || !totals?.approved}
              onClick={() => void onExport('summary')}
            >
              <ClipboardList />
              Accumulative village CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={exporting !== null || !totals?.approved}
              onClick={() => void onExport('samples')}
            >
              <Download />
              Sample register CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
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
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Analytics unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <Skeleton className="h-36 w-full" />
      ) : data ? (
        <section
          className={cn(
            'rounded-xl p-5 ring-1',
            data.brief.stance === 'CRITICAL' &&
              'bg-destructive/5 ring-destructive/20',
            data.brief.stance === 'HIGH' && 'bg-amber-500/8 ring-amber-500/20',
            data.brief.stance === 'WATCH' && 'bg-sky-500/8 ring-sky-500/20',
            data.brief.stance === 'STABLE' &&
              'bg-emerald-500/8 ring-emerald-500/20',
            data.brief.stance === 'INSUFFICIENT' && 'bg-card ring-foreground/10',
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Decision brief
              </p>
              <h3 className="max-w-3xl font-heading text-xl font-semibold tracking-tight">
                {data.brief.headline}
              </h3>
              <p className="text-sm text-muted-foreground">
                {data.brief.coverageNote}
              </p>
            </div>
            <Badge variant="secondary" className="capitalize">
              {STANCE_LABEL[data.brief.stance]}
            </Badge>
          </div>
          <ol className="mt-4 grid gap-2 md:grid-cols-2">
            {data.brief.actions.map((action, index) => (
              <li key={action} className="flex gap-2 text-sm leading-relaxed">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-background text-[11px] font-semibold ring-1 ring-foreground/10">
                  {index + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Approved evidence"
          value={loading || !totals ? '—' : String(totals.approved)}
          description={`${totals?.villagesCovered ?? 0} villages · ${totals?.tehsilsCovered ?? 0} tehsils`}
          icon={ShieldCheck}
          tone="success"
          to={managerReportsPath({ status: 'APPROVED', tehsilId, villageId })}
        />
        <MetricCard
          title="Potable share"
          value={
            loading || !totals
              ? '—'
              : `${Math.max(0, 100 - totals.unsafeRate)}%`
          }
          description="Approved samples with no NSDWQ group failure."
          icon={Droplets}
          tone="success"
        />
        <MetricCard
          title="Unsafe share"
          value={loading || !totals ? '—' : `${totals.unsafeRate}%`}
          description={`${totals?.unsafe ?? 0} samples fail physical, chemical, trace, or microbial limits.`}
          icon={AlertTriangle}
          tone="warning"
        />
        <MetricCard
          title="Microbial failures"
          value={loading || !totals ? '—' : String(totals.unsafeMicrobial)}
          description="Coliform / E. coli. Treat these places as not potable."
          icon={AlertTriangle}
          tone="warning"
        />
        <MetricCard
          title="Network coverage"
          value={loading || !totals ? '—' : `${totals.coverageRate}%`}
          description={`${totals?.tehsilsCovered ?? 0} of ${totals?.tehsilsInMaster ?? 0} tehsils have locked samples.`}
          icon={MapPinned}
          tone="info"
        />
        <MetricCard
          title="Still in queue"
          value={loading || !totals ? '—' : String(totals.pendingReview)}
          description="Submitted reports not yet available for decisions."
          icon={ClipboardList}
          tone="info"
          to={managerReportsPath({ status: 'PENDING_REVIEW' })}
        />
      </div>

      {data?.alerts.length ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Intervene first</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1.5">
              {data.alerts.map((alert) => (
                <li key={`${alert.tehsilId}-${alert.villageId}`}>
                  <Link
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                    to={managerMonitoringPath({
                      tehsilId: alert.tehsilId,
                      villageId: alert.villageId,
                    })}
                  >
                    {alert.message}
                  </Link>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          icon={ShieldCheck}
          title="Potable vs not potable"
          description="Overall NSDWQ judgment on approved samples in this filter."
        >
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : !totals?.approved ? (
            <p className="text-sm text-muted-foreground">
              Approve reports to populate this demographic split.
            </p>
          ) : (
            <ChartContainer config={judgmentConfig} className="mx-auto aspect-square max-h-64">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie data={judgmentRows} dataKey="value" nameKey="name" innerRadius={58}>
                  {judgmentRows.map((row) => (
                    <Cell key={row.name} fill={row.fill} />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          )}
        </SectionCard>

        <SectionCard
          icon={AlertTriangle}
          title="Which limits fail"
          description="A sample can fail more than one group. Microbial failure is the highest operational priority."
        >
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ChartContainer config={hazardConfig} className="aspect-[4/3]">
              <BarChart data={hazardRows} layout="vertical" accessibilityLayer>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={80} tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="unsafe" radius={4}>
                  {hazardRows.map((row) => (
                    <Cell key={row.name} fill={row.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </SectionCard>

        <SectionCard
          icon={MapPinned}
          title="Accumulative trend"
          description="Running total of approved potable vs unsafe samples over reporting months."
        >
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : monthRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No monthly series yet.</p>
          ) : (
            <ChartContainer config={trendConfig} className="aspect-[4/3]">
              <AreaChart data={monthRows} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="cumulativeSafe"
                  stroke="var(--color-cumulativeSafe)"
                  fill="var(--color-cumulativeSafe)"
                  fillOpacity={0.25}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeUnsafe"
                  stroke="var(--color-cumulativeUnsafe)"
                  fill="var(--color-cumulativeUnsafe)"
                  fillOpacity={0.25}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard
        icon={MapPinned}
        title="Tehsil hazard profile"
        description="Count of approved samples failing each NSDWQ group. Use this to compare administrative units at the same scale."
      >
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : tehsilChartRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No approved tehsil evidence in this filter.
          </p>
        ) : (
          <ChartContainer config={tehsilConfig} className="aspect-[16/7]">
            <BarChart data={tehsilChartRows} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="unsafePhysical" fill="var(--color-unsafePhysical)" radius={3} />
              <Bar dataKey="unsafeChemical" fill="var(--color-unsafeChemical)" radius={3} />
              <Bar dataKey="unsafeMicrobial" fill="var(--color-unsafeMicrobial)" radius={3} />
            </BarChart>
          </ChartContainer>
        )}
      </SectionCard>

      <SectionCard
        icon={ClipboardList}
        title="Accumulative village register"
        description="Every village with approved evidence, ranked by risk. Export this table for board packs and field planning."
        actions={
          <Link
            to={managerReportsPath({ status: 'APPROVED', tehsilId, villageId })}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open sample list
          </Link>
        }
      >
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table className="enterprise-table">
            <TableHeader>
              <TableRow>
                <TableHead>Village</TableHead>
                <TableHead>Tehsil</TableHead>
                <TableHead>Band</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead>Unsafe share</TableHead>
                <TableHead className="text-right">Microbial</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.byVillage ?? []).map((row) => (
                <TableRow key={row.villageId}>
                  <TableCell className="font-medium">{row.villageName}</TableCell>
                  <TableCell>{row.tehsilName}</TableCell>
                  <TableCell>
                    <RiskChip band={row.band} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.reports}
                  </TableCell>
                  <TableCell>
                    <RateBar
                      value={row.unsafeRate}
                      tone={row.unsafeRate > 0 ? 'danger' : 'ok'}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.unsafeMicrobial}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={managerReportsPath({
                        status: 'APPROVED',
                        tehsilId: row.tehsilId,
                        villageId: row.villageId,
                      })}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                      })}
                    >
                      Samples
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard
          icon={Droplets}
          title="Source demographics"
          description="Where the laboratory collected approved samples, and how often those sources failed."
        >
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">n</TableHead>
                  <TableHead>Unsafe share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.bySource ?? []).map((row) => (
                  <TableRow key={row.name}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.reports}
                    </TableCell>
                    <TableCell>
                      <RateBar
                        value={row.unsafeRate}
                        tone={row.unsafeRate > 0 ? 'danger' : 'ok'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          icon={ShieldCheck}
          title="Latest locked reports"
          description="Newest approvals feeding this desk. Open a row for the full laboratory record."
        >
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Place</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Overall</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.recentApproved ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.reportSerialNo}
                    </TableCell>
                    <TableCell>
                      {row.tehsilName} / {row.villageName}
                    </TableCell>
                    <TableCell>{formatReportDate(row.reportingDate)}</TableCell>
                    <TableCell>
                      <ConformityBadge value={row.unsafe ? 'UNSAFE' : 'SAFE'} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        to={managerReviewPath(row.id)}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                        })}
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
