import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

type MetricCardProps = {
  title: string
  value: string
  description: string
  icon: LucideIcon
  to?: string
  tone?: 'default' | 'info' | 'warning' | 'success'
}

const TONE_CLASS: Record<NonNullable<MetricCardProps['tone']>, string> = {
  default: 'bg-primary/10 text-primary ring-primary/15',
  info: 'bg-sky-500/10 text-sky-800 ring-sky-500/15',
  warning: 'bg-amber-500/10 text-amber-800 ring-amber-500/20',
  success: 'bg-emerald-500/10 text-emerald-800 ring-emerald-500/20',
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  to,
  tone = 'default',
}: MetricCardProps) {
  const body = (
    <div className="flex h-full flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex size-9 items-center justify-center rounded-md ring-1',
            TONE_CLASS[tone],
          )}
        >
          <Icon className="size-4" />
        </div>
        <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
      </div>
      <div className="space-y-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )

  if (to) {
    return (
      <Link to={to} className="block h-full">
        {body}
      </Link>
    )
  }
  return body
}
