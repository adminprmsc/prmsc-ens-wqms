import { useEffect, useState } from 'react'
import { Server } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

type HealthResponse = {
  status: string
  database: string
  timestamp: string
}

type ApiInfo = {
  name: string
  version: string
  status: string
  orm?: string
}

export function SystemStatusPage() {
  const [apiInfo, setApiInfo] = useState<ApiInfo | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function checkBackend() {
    setLoading(true)
    setError(null)

    try {
      const [infoRes, healthRes] = await Promise.all([
        fetch('/api'),
        fetch('/api/health'),
      ])

      if (!infoRes.ok || !healthRes.ok) {
        throw new Error('Backend returned an error')
      }

      setApiInfo((await infoRes.json()) as ApiInfo)
      setHealth((await healthRes.json()) as HealthResponse)
    } catch {
      setApiInfo(null)
      setHealth(null)
      setError('Could not reach the API. Start the backend with Docker first.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void checkBackend()
  }, [])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          Backend connectivity
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Live check against the NestJS API and PostgreSQL. Business modules
          will plug into this same shell.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4" />
              Backend status
            </CardTitle>
            <CardDescription>
              Checks <code>/api</code> and <code>/api/health</code>
            </CardDescription>
          </div>
          <Button onClick={() => void checkBackend()} disabled={loading}>
            {loading ? 'Checking…' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={apiInfo ? 'default' : 'secondary'}>
                  API {apiInfo?.status ?? 'unknown'}
                </Badge>
                <Badge
                  variant={
                    health?.database === 'up' ? 'default' : 'destructive'
                  }
                >
                  DB {health?.database ?? 'unknown'}
                </Badge>
              </div>
              <Separator />
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Service</dt>
                  <dd className="font-medium">{apiInfo?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="font-medium">{apiInfo?.version ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ORM</dt>
                  <dd className="font-medium">{apiInfo?.orm ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Overall</dt>
                  <dd className="font-medium">{health?.status ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Checked at</dt>
                  <dd className="font-medium">
                    {health?.timestamp
                      ? new Date(health.timestamp).toLocaleString()
                      : '—'}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
