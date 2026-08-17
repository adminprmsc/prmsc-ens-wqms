import { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw } from 'lucide-react'

import { listAuditLogs } from '@/lib/admin-api'
import { ApiError } from '@/lib/api'
import type { AuditAction, AuditLog } from '@/lib/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
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

const actionOptions: AuditAction[] = [
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'PASSWORD_RESET',
  'PASSWORD_CHANGED',
  'ROLE_CHANGED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'REPORT_CREATED',
  'REPORT_UPDATED',
  'REPORT_SUBMITTED',
  'REPORT_APPROVED',
  'REPORT_REJECTED',
]

export function AdminAuditPage() {
  const [items, setItems] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [action, setAction] = useState<AuditAction | 'ALL'>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const result = await listAuditLogs({
        action: action === 'ALL' ? undefined : action,
        limit: 100,
      })
      setItems(result.items)
      setTotal(result.total)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load audit history',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [action])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          Audit history
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Authentication and administration events across all user types.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load events</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Showing {items.length} of {total} matching records.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? <Spinner /> : <RefreshCw />}
              Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <Select
            value={action}
            onValueChange={(value) => {
              if (value) setAction(value as AuditAction | 'ALL')
            }}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              {actionOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.replaceAll('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardList />
                </EmptyMedia>
                <EmptyTitle>No audit events yet</EmptyTitle>
                <EmptyDescription>
                  Administration and sign-in activity will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {item.action.replaceAll('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.actor ? (
                          <>
                            <div className="font-medium">{item.actor.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.actor.email}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.target ? (
                          <>
                            <div className="font-medium">{item.target.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.target.email}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {item.metadata
                          ? JSON.stringify(item.metadata)
                          : item.ipAddress || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
