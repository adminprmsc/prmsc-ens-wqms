import { useEffect, useState } from 'react'
import { BriefcaseBusiness, MapPinned, TestTubes } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { listTehsils } from '@/lib/locations-api'
import { listParameters, listReports } from '@/lib/water-quality-api'

export function ManagerOperationsPage() {
  const [tehsils, setTehsils] = useState<number | null>(null)
  const [villages, setVillages] = useState<number | null>(null)
  const [parameters, setParameters] = useState<number | null>(null)
  const [priority, setPriority] = useState<number | null>(null)
  const [unsafeMicrobial, setUnsafeMicrobial] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listTehsils(),
      listParameters('FULL'),
      listParameters('PRIORITY'),
      listReports({ microbialConformity: 'UNSAFE' }),
    ])
      .then(([tehsilRows, fullParams, priorityParams, unsafeRows]) => {
        if (cancelled) return
        setTehsils(tehsilRows.length)
        setVillages(
          tehsilRows.reduce((sum, row) => sum + (row._count?.villages ?? 0), 0),
        )
        setParameters(fullParams.length)
        setPriority(priorityParams.length)
        setUnsafeMicrobial(unsafeRows.length)
      })
      .catch(() => {
        if (!cancelled) {
          setTehsils(0)
          setVillages(0)
          setParameters(0)
          setPriority(0)
          setUnsafeMicrobial(0)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stats = [
    {
      label: 'Tehsils',
      value: tehsils,
      hint: 'Administrative coverage',
      icon: MapPinned,
    },
    {
      label: 'Villages',
      value: villages,
      hint: 'Normalized location master',
      icon: MapPinned,
    },
    {
      label: 'Catalog parameters',
      value: parameters,
      hint: `${priority ?? '—'} in priority form`,
      icon: TestTubes,
    },
    {
      label: 'Unsafe microbial',
      value: unsafeMicrobial,
      hint: 'Visible reports with coliform / E. coli failure',
      icon: BriefcaseBusiness,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Operations</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Reference-data health for the Punjab rural water-quality network:
          tehsil–village–settlement master, NSDWQ parameter catalog, and
          microbial risk in submitted reports.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardHeader>
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4" />
                </div>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className="text-2xl font-semibold tracking-tight">
                  {stat.value === null ? <Skeleton className="h-8 w-16" /> : stat.value}
                </div>
                <CardDescription>{stat.hint}</CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integrity model</CardTitle>
          <CardDescription>
            Version 2 stores one report per sample, with EAV results against a
            versioned parameter catalog rather than wide physical/chemical
            columns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Tehsil owns villages; villages own settlements. Reports restrict
            delete on location and user rows so historical samples cannot lose
            their geography or analyst.
          </p>
          <p>
            Priority forms require Color, Odour, Taste, EC, pH, Turbidity, TDS,
            Total coliforms, Fecal coliforms, and E. coli. Full suite adds
            chemical and trace-element measurements. GPS latitude and longitude
            are stored only as a complete pair.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
