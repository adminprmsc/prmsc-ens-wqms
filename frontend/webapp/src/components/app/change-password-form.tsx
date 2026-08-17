import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/auth/auth-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { changePassword } from '@/lib/admin-api'
import { ApiError } from '@/lib/api'

const PASSWORD_HINT =
  'At least 8 characters, including a letter and a number.'

function meetsPolicy(password: string) {
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  )
}

function PasswordField({
  id,
  label,
  value,
  autoComplete,
  onChange,
  error,
}: {
  id: string
  label: string
  value: string
  autoComplete: string
  onChange: (value: string) => void
  error?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="h-8">
        <InputGroupInput
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={() => setVisible((open) => !open)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}

export function ChangePasswordForm({
  onSuccess,
  required = false,
}: {
  onSuccess?: () => void
  required?: boolean
}) {
  const { refresh } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldError(null)
    setFormError(null)

    if (!meetsPolicy(newPassword)) {
      setFieldError(PASSWORD_HINT)
      return
    }
    if (newPassword !== confirmPassword) {
      setFieldError('New password and confirmation do not match')
      return
    }
    if (currentPassword === newPassword) {
      setFieldError('New password must be different from the current password')
      return
    }

    setSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      await refresh()
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(
        required
          ? 'Password updated. You can continue working.'
          : 'Password updated',
      )
      onSuccess?.()
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Unable to update password right now',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
      {required ? (
        <Alert>
          <AlertTitle>Password change required</AlertTitle>
          <AlertDescription>
            This account is using a temporary password. Set a new one before
            continuing.
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPassword}
          autoComplete="current-password"
          onChange={setCurrentPassword}
        />
        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          autoComplete="new-password"
          onChange={setNewPassword}
          error={fieldError ?? undefined}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          autoComplete="new-password"
          onChange={setConfirmPassword}
        />
        <FieldDescription>{PASSWORD_HINT}</FieldDescription>
      </FieldGroup>

      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not update password</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={submitting}>
        {submitting ? <Spinner /> : null}
        {submitting ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  )
}
