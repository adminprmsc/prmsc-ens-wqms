import { ClipboardList, KeyRound, Shield, Users } from 'lucide-react'

import { PortalShell } from '@/components/app/portal-shell'

const navItems = [
  {
    path: '/admin/users',
    label: 'Users',
    description: 'Create accounts, activate or deactivate, reset credentials',
    icon: Users,
  },
  {
    path: '/admin/access-control',
    label: 'Access control',
    description: 'Role definitions and permission matrix',
    icon: Shield,
  },
  {
    path: '/admin/audit',
    label: 'Audit history',
    description: 'Review actions across all user types',
    icon: ClipboardList,
  },
]

export function SystemAdminLayout() {
  return (
    <PortalShell
      brandTitle="WQMS Admin"
      brandSubtitle="System Administrator"
      navSectionLabel="Administration"
      orgLabel="PRMSC-HO"
      badgeIcon={KeyRound}
      navItems={navItems}
    />
  )
}
