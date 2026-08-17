import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'

import { useAuth } from '@/auth/auth-context'
import prmscLogo from '@/assets/prmsc-logo.png'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/api'
import { homePathForRole } from '@/lib/routes'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('system.admin@prmsc.gov.pk')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    return <Navigate to={homePathForRole(user.role)} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const signedIn = await login(email, password)
      navigate(homePathForRole(signedIn.role), { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to sign in right now',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-svh md:grid-cols-2">
      <aside className="login-brand-panel relative hidden flex-col justify-between p-10 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-sidebar-accent ring-1 ring-sidebar-border/70">
            <img src={prmscLogo} alt="PRMSC" className="h-7 w-auto" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">PRMSC-HO</p>
            <p className="text-[11px] text-sidebar-foreground/65">
              Punjab Rural Municipal Services Company
            </p>
          </div>
        </div>

        <div className="max-w-md space-y-5">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-sidebar-foreground/55 uppercase">
            Official platform
          </p>
          <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight">
            Water Quality Management System
          </h1>
          <p className="text-sm leading-relaxed text-sidebar-foreground/72">
            Role-based access for System Administrators, PRMSC Managers, and
            PCRWR field users. Sampling, reporting, and governance in one
            controlled workspace.
          </p>
          <ul className="space-y-2.5 text-sm text-sidebar-foreground/78">
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-sidebar-primary" />
              Authenticated sessions with auditable administration
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-sidebar-primary" />
              Segregated portals by organization and role
            </li>
          </ul>
        </div>

        <p className="text-[11px] text-sidebar-foreground/50">
          Authorized personnel only · Partnered with PCRWR
        </p>
      </aside>

      <div className="flex items-center justify-center bg-background p-6 md:p-10">
        <div className="w-full max-w-[400px] rounded-xl border border-border bg-card p-6 ring-1 ring-foreground/10">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted ring-1 ring-border">
              <img src={prmscLogo} alt="PRMSC" className="h-6 w-auto" />
            </div>
            <div>
              <p className="text-sm font-semibold">WQMS</p>
              <p className="text-xs text-muted-foreground">
                Water Quality Management System
              </p>
            </div>
          </div>

          <div className="mb-6 space-y-1.5">
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              Sign in
            </h2>
            <p className="text-sm text-muted-foreground">
              Use your official WQMS credentials to open your portal.
            </p>
          </div>

          <form className="space-y-5" onSubmit={(e) => void onSubmit(e)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <InputGroup className="h-8">
                  <InputGroupInput
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      onClick={() => setShowPassword((open) => !open)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Sign-in failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={submitting}
            >
              {submitting ? <Spinner /> : null}
              {submitting ? 'Signing in…' : 'Continue'}
            </Button>
          </form>

          <Separator className="my-6" />
          <FieldDescription>
            Need access? Ask a System Administrator to provision your account.
          </FieldDescription>
        </div>
      </div>
    </div>
  )
}
