import { Navigate } from 'react-router-dom'

import { useAuth } from '@/auth/auth-context'
import { homePathForRole } from '@/lib/routes'

/** Sends an authenticated user to their role portal home. */
export function RoleHomeRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading session…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={homePathForRole(user.role)} replace />
}
