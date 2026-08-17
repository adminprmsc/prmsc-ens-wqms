import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'

import { fetchAccessControl } from '@/lib/admin-api'
import { ApiError } from '@/lib/api'
import type { AccessControlRole } from '@/lib/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminAccessControlPage() {
  const [roles, setRoles] = useState<AccessControlRole[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchAccessControl()
        setRoles(data.roles)
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load access control',
        )
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          Access control
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          System Administrators assign roles. Changes from User management are
          recorded in audit history.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load roles</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {roles.map((role) => (
            <Card key={role.role}>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="size-4" />
                  {role.label}
                </CardTitle>
                <CardDescription>
                  <Badge variant="outline">{role.role}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="mb-4 text-sm text-muted-foreground">
                  {role.description}
                </p>
                <ItemGroup className="gap-2">
                  {role.permissions.map((permission) => (
                    <Item key={permission} variant="muted" size="xs">
                      <ItemMedia variant="icon">
                        <Shield />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle className="font-mono text-xs">
                          {permission}
                        </ItemTitle>
                        <ItemDescription className="sr-only">
                          {permission}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
