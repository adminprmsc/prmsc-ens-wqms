import { BriefcaseBusiness, ClipboardCheck, LayoutDashboard } from 'lucide-react'

import { PortalShell } from '@/components/app/portal-shell'

const navItems = [
  {
    path: '/manager',
    label: 'Overview',
    description: 'PRMSC Manager operations summary',
    icon: LayoutDashboard,
  },
  {
    path: '/manager/operations',
    label: 'Operations',
    description: 'Oversee PRMSC water-quality operations',
    icon: BriefcaseBusiness,
  },
  {
    path: '/manager/reports',
    label: 'Reports',
    description: 'Review assigned reports and team progress',
    icon: ClipboardCheck,
  },
]

export function PrmscManagerLayout() {
  return (
    <PortalShell
      brandTitle="WQMS Manager"
      brandSubtitle="PRMSC Manager"
      navSectionLabel="PRMSC Operations"
      orgLabel="PRMSC-HO"
      badgeIcon={BriefcaseBusiness}
      navItems={navItems}
    />
  )
}
