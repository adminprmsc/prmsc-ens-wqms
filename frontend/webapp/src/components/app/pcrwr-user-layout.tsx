import { Droplets, FileText, LayoutDashboard, UserRound } from 'lucide-react'

import { PortalShell } from '@/components/app/portal-shell'

const navItems = [
  {
    path: '/pcrwr',
    label: 'Overview',
    description: 'PCRWR user workspace summary',
    icon: LayoutDashboard,
  },
  {
    path: '/pcrwr/field-data',
    label: 'Field data',
    description: 'Submit and update water quality field entries',
    icon: Droplets,
  },
  {
    path: '/pcrwr/records',
    label: 'My records',
    description: 'View your assigned water quality records',
    icon: FileText,
  },
  {
    path: '/pcrwr/profile',
    label: 'Profile',
    description: 'Review your account details',
    icon: UserRound,
  },
]

export function PcrwrUserLayout() {
  return (
    <PortalShell
      brandTitle="WQMS PCRWR"
      brandSubtitle="PCRWR User"
      navSectionLabel="Field Work"
      orgLabel="PCRWR"
      badgeIcon={Droplets}
      navItems={navItems}
    />
  )
}
