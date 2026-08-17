import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/app/page-header'
import { MetricCard } from '@/components/app/metric-card'

type PortalHomePageProps = {
  eyebrow?: string
  title: string
  description: string
  cards: Array<{
    title: string
    description: string
    icon: LucideIcon
    to?: string
    value?: string
    tone?: 'default' | 'info' | 'warning' | 'success'
  }>
  steps?: Array<{ label: string; detail: string }>
  extra?: ReactNode
}

export function PortalHomePage({
  eyebrow = 'Workspace',
  title,
  description,
  cards,
  steps,
  extra,
}: PortalHomePageProps) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <MetricCard
            key={card.title}
            title={card.title}
            value={card.value ?? '—'}
            description={card.description}
            icon={card.icon}
            to={card.to}
            tone={card.tone}
          />
        ))}
      </section>

      {steps && steps.length > 0 ? (
        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Operating sequence
          </p>
          <ol className="mt-4 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.label} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <div className="text-sm font-semibold">{step.label}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {extra}
    </div>
  )
}

export function PortalHomeLink({
  to,
  children,
}: {
  to: string
  children: ReactNode
}) {
  return (
    <Link to={to} className="text-sm font-medium text-primary hover:underline">
      {children}
    </Link>
  )
}
