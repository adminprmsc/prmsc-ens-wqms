import { Building2, IdCard, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react'

import { useAuth } from '@/auth/auth-context'
import { ChangePasswordForm } from '@/components/app/change-password-form'
import { PageHeader } from '@/components/app/page-header'
import { SectionCard } from '@/components/app/section-card'
import { Badge } from '@/components/ui/badge'
import { USER_ROLE_LABELS } from '@/lib/types'

export function PcrwrProfilePage() {
  const { user } = useAuth()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Signed-in PCRWR credentials used for field capture, draft ownership, and submission to PRMSC."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
        <SectionCard
          icon={IdCard}
          title="Identity"
          description="Directory details attached to this laboratory session."
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Name
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                <UserRound className="size-3.5 text-muted-foreground" />
                {user?.name ?? '—'}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Email
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                <Mail className="size-3.5 text-muted-foreground" />
                {user?.email ?? '—'}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Organization
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                <Building2 className="size-3.5 text-muted-foreground" />
                {user?.organization ?? 'PCRWR'}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Assigned role
              </dt>
              <dd className="mt-1">
                <Badge variant="secondary">
                  {user ? USER_ROLE_LABELS[user.role] : 'PCRWR User'}
                </Badge>
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard
          icon={ShieldCheck}
          title="Workspace access"
          description="What this role can do in WQMS."
        >
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between gap-3 border-b border-border/70 pb-3">
              <span className="text-muted-foreground">Field data entry</span>
              <span className="font-medium">Create and draft</span>
            </li>
            <li className="flex justify-between gap-3 border-b border-border/70 pb-3">
              <span className="text-muted-foreground">NWQL import</span>
              <span className="font-medium">.docx / PDF</span>
            </li>
            <li className="flex justify-between gap-3 border-b border-border/70 pb-3">
              <span className="text-muted-foreground">Submission</span>
              <span className="font-medium">To PRMSC review</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">Approval rights</span>
              <span className="font-medium">Manager only</span>
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        icon={KeyRound}
        title="Password"
        description="Change the password used to sign in to this PCRWR account."
      >
        <ChangePasswordForm required={user?.mustChangePassword === true} />
      </SectionCard>
    </div>
  )
}
