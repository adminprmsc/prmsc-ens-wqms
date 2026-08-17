import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Activity, Droplets, LogOut } from 'lucide-react'

import { useAuth } from '@/auth/auth-context'
import prmscLogo from '@/assets/prmsc-logo.png'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { USER_ROLE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'

const navItems = [
  {
    path: '/',
    label: 'System status',
    description: 'API and database connectivity',
    icon: Activity,
  },
]

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const active =
    navItems.find((item) => item.path === location.pathname) ?? navItems[0]

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh w-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="border-b border-sidebar-border/60 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent ring-1 ring-sidebar-border/50">
              <img src={prmscLogo} alt="PRMSC" className="h-7 w-auto" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">
                WQMS
              </div>
              <div className="truncate text-[11px] text-sidebar-foreground/65">
                Water Quality Management
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-4 px-3 py-4">
          <div>
            <p className="mb-2 px-2 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
              Overview
            </p>
            <ul className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                        )
                      }
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        </nav>

        <div className="space-y-3 border-t border-sidebar-border/60 px-4 py-3">
          {user ? (
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/60">
                {USER_ROLE_LABELS[user.role]}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-sidebar-foreground/60">
              <Droplets className="size-3.5" />
              <span>PRMSC-HO</span>
            </div>
          )}
          {user ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={handleLogout}
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          ) : null}
        </div>
      </aside>

      <div className="app-shell-bg flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border/80 bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {active.label}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {active.description}
            </p>
          </div>
          <Separator orientation="vertical" className="h-5" />
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Environment &amp; Social
          </span>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
