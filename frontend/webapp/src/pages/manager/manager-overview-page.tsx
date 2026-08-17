import { useEffect, useState } from 'react'
import { BriefcaseBusiness, ClipboardCheck, UsersRound } from 'lucide-react'

import { useAuth } from '@/auth/auth-context'
import { PortalHomePage } from '@/pages/shared/portal-home-page'
import { listReports } from '@/lib/water-quality-api'
import { managerReportsPath } from '@/lib/routes'

export function ManagerOverviewPage() {
  const { user } = useAuth()
  const [queue, setQueue] = useState<number | null>(null)
  const [approved, setApproved] = useState<number | null>(null)
  const [rejected, setRejected] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listReports({ status: 'PENDING_REVIEW', pageSize: '1' }),
      listReports({ status: 'APPROVED', pageSize: '1' }),
      listReports({ status: 'REJECTED', pageSize: '1' }),
    ])
      .then(([queueRows, approvedRows, rejectedRows]) => {
        if (cancelled) return
        setQueue(queueRows.total)
        setApproved(approvedRows.total)
        setRejected(rejectedRows.total)
      })
      .catch(() => {
        if (!cancelled) {
          setQueue(0)
          setApproved(0)
          setRejected(0)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PortalHomePage
      eyebrow="PRMSC environmental review"
      title={`Welcome, ${user?.name ?? 'PRMSC Manager'}`}
      description="Review PCRWR submissions, lock potable judgments into monitoring, and extract accumulative evidence by tehsil and village."
      cards={[
        {
          title: 'Pending review',
          description: 'Reports waiting for environmental specialist sign-off.',
          icon: ClipboardCheck,
          to: managerReportsPath({ status: 'PENDING_REVIEW' }),
          value: queue === null ? '—' : String(queue),
          tone: 'warning',
        },
        {
          title: 'Approved evidence',
          description: 'Locked reports for tehsil and village decisions.',
          icon: BriefcaseBusiness,
          to: '/manager/operations',
          value: approved === null ? '—' : String(approved),
          tone: 'success',
        },
        {
          title: 'Returned to PCRWR',
          description: 'Rejected reports that can be corrected and resubmitted.',
          icon: UsersRound,
          to: managerReportsPath({ status: 'REJECTED' }),
          value: rejected === null ? '—' : String(rejected),
          tone: 'info',
        },
      ]}
      steps={[
        {
          label: 'Inspect submission',
          detail: 'Filter the queue by tehsil, village, settlement, or serial.',
        },
        {
          label: 'Open the full record',
          detail: 'Review location, custody dates, and NSDWQ parameter snapshots.',
        },
        {
          label: 'Approve into monitoring',
          detail: 'Lock the report so tehsil/village analytics and CSV extracts update.',
        },
      ]}
    />
  )
}
