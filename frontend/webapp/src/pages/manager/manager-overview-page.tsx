import { useEffect, useState } from 'react'
import { BriefcaseBusiness, ClipboardCheck, UsersRound } from 'lucide-react'

import { useAuth } from '@/auth/auth-context'
import { PortalHomePage } from '@/pages/shared/portal-home-page'
import { listReports } from '@/lib/water-quality-api'

export function ManagerOverviewPage() {
  const { user } = useAuth()
  const [queue, setQueue] = useState<number | null>(null)
  const [approved, setApproved] = useState<number | null>(null)
  const [rejected, setRejected] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listReports({ status: 'PENDING_REVIEW' }),
      listReports({ status: 'APPROVED' }),
      listReports({ status: 'REJECTED' }),
    ])
      .then(([queueRows, approvedRows, rejectedRows]) => {
        if (cancelled) return
        setQueue(queueRows.length)
        setApproved(approvedRows.length)
        setRejected(rejectedRows.length)
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
      description="Review PCRWR water-quality submissions, approve potable judgments, and return incomplete field data."
      cards={[
        {
          title: 'Pending review',
          description: 'Reports waiting for environmental specialist sign-off.',
          icon: ClipboardCheck,
          to: '/manager/reports',
          value: queue === null ? '—' : String(queue),
          tone: 'warning',
        },
        {
          title: 'Approved',
          description: 'Locked reports accepted against NSDWQ limits.',
          icon: BriefcaseBusiness,
          to: '/manager/reports',
          value: approved === null ? '—' : String(approved),
          tone: 'success',
        },
        {
          title: 'Returned to PCRWR',
          description: 'Rejected reports that can be corrected and resubmitted.',
          icon: UsersRound,
          to: '/manager/reports',
          value: rejected === null ? '—' : String(rejected),
          tone: 'info',
        },
      ]}
      steps={[
        {
          label: 'Inspect submission',
          detail: 'Open the queue and verify location, custody dates, and results.',
        },
        {
          label: 'Judge conformity',
          detail: 'Confirm physical, chemical, and microbial NSDWQ outcomes.',
        },
        {
          label: 'Approve or return',
          detail: 'Lock the report or send it back to PCRWR with a reason.',
        },
      ]}
    />
  )
}
