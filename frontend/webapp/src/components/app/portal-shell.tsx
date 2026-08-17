import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { KeyRound, LogOut } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/auth/auth-context'
import prmscLogo from '@/assets/prmsc-logo.png'
import { ChangePasswordForm } from '@/components/app/change-password-form'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { USER_ROLE_LABELS } from '@/lib/types'
import { cn, initials } from '@/lib/utils'

export type PortalNavItem = {
  path: string
  label: string
  description: string
  icon: LucideIcon
}

type PortalShellProps = {
  brandTitle: string
  brandSubtitle: string
  navSectionLabel: string
  orgLabel: string
  badgeIcon: LucideIcon
  navItems: PortalNavItem[]
}

function isNavActive(pathname: string, path: string) {
  if (path === '/pcrwr' || path === '/manager' || path === '/admin') {
    return pathname === path
  }
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function PortalShell({
  brandTitle,
  brandSubtitle,
  navSectionLabel,
  orgLabel,
  navItems,
}: PortalShellProps) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const mustChangePassword = user?.mustChangePassword === true
  const active =
    navItems.find((item) => isNavActive(location.pathname, item.path)) ??
    navItems[0]

  useEffect(() => {
    if (mustChangePassword) setPasswordOpen(true)
  }, [mustChangePassword])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function handlePasswordOpenChange(open: boolean) {
    if (mustChangePassword && !open) return
    setPasswordOpen(open)
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2.5 px-1 py-1.5 group-data-[collapsible=icon]:justify-center">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent ring-1 ring-sidebar-border/60">
                <img src={prmscLogo} alt="PRMSC" className="h-5 w-auto" />
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="truncate text-sm font-semibold tracking-tight">
                  {brandTitle}
                </div>
                <div className="truncate text-[11px] text-sidebar-foreground/60">
                  {brandSubtitle}
                </div>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{navSectionLabel}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => {
                    const Icon = item.icon
                    const active = isNavActive(location.pathname, item.path)
                    return (
                      <SidebarMenuItem key={item.path}>
                        <NavLink
                          to={item.path}
                          end={item.path.split('/').length <= 2}
                          title={item.label}
                          data-active={active ? 'true' : undefined}
                          className={cn(
                            'flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-sm outline-hidden transition-colors',
                            'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                            'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                            'group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!',
                            '[&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
                            active &&
                              'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                          )}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2 px-1 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                  />
                }
              >
                <Avatar size="sm">
                  <AvatarFallback className="bg-sidebar-accent text-[10px] text-sidebar-foreground">
                    {initials(user?.name ?? 'U')}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-xs font-medium">
                    {user?.name}
                  </span>
                  <span className="block truncate text-[11px] text-sidebar-foreground/60">
                    {user ? USER_ROLE_LABELS[user.role] : brandSubtitle}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="truncate font-medium text-foreground">
                      {user?.name}
                    </div>
                    <div className="truncate text-xs font-normal">
                      {user?.email}
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
                  <KeyRound />
                  Change password
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-md">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList>
                <BreadcrumbItem className="hidden sm:block">
                  <span className="text-muted-foreground">{orgLabel}</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{active.label}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <span className="hidden rounded-md bg-muted px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:inline">
              {orgLabel} workspace
            </span>
          </header>

          <div className="mx-auto w-full max-w-[88rem] flex-1 p-4 md:p-6 lg:px-8 lg:py-7">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>

      <Dialog
        open={passwordOpen}
        onOpenChange={handlePasswordOpenChange}
        disablePointerDismissal={mustChangePassword}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!mustChangePassword}
        >
          <DialogHeader>
            <DialogTitle>
              {mustChangePassword ? 'Set a new password' : 'Change password'}
            </DialogTitle>
            <DialogDescription>
              {mustChangePassword
                ? 'A temporary password is still in use. Choose a new one to continue.'
                : 'Enter your current password, then choose a new one for this account.'}
            </DialogDescription>
          </DialogHeader>
          <ChangePasswordForm onSuccess={() => setPasswordOpen(false)} />
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
