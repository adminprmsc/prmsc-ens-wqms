import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'

import { AuthProvider } from '@/auth/auth-context'
import { ProtectedRoute } from '@/auth/protected-route'
import { RoleHomeRedirect } from '@/auth/role-home-redirect'
import { PcrwrUserLayout } from '@/components/app/pcrwr-user-layout'
import { PrmscManagerLayout } from '@/components/app/prmsc-manager-layout'
import { SystemAdminLayout } from '@/components/app/system-admin-layout'
import { AdminAccessControlPage } from '@/pages/admin/admin-access-control-page'
import { AdminAuditPage } from '@/pages/admin/admin-audit-page'
import { AdminUsersPage } from '@/pages/admin/admin-users-page'
import { LoginPage } from '@/pages/login-page'
import { ManagerOperationsPage } from '@/pages/manager/manager-operations-page'
import { ManagerOverviewPage } from '@/pages/manager/manager-overview-page'
import { ManagerReportReviewPage } from '@/pages/manager/manager-report-review-page'
import { ManagerReportsPage } from '@/pages/manager/manager-reports-page'
import { PcrwrFieldDataPage } from '@/pages/pcrwr/pcrwr-field-data-page'
import { PcrwrOverviewPage } from '@/pages/pcrwr/pcrwr-overview-page'
import { PcrwrProfilePage } from '@/pages/pcrwr/pcrwr-profile-page'
import { PcrwrRecordsPage } from '@/pages/pcrwr/pcrwr-records-page'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute roles={['SYSTEM_ADMIN']} />}>
            <Route path="/admin" element={<SystemAdminLayout />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route
                path="access-control"
                element={<AdminAccessControlPage />}
              />
              <Route path="audit" element={<AdminAuditPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['SUPER_ADMIN']} />}>
            <Route path="/manager" element={<PrmscManagerLayout />}>
              <Route index element={<ManagerOverviewPage />} />
              <Route path="operations" element={<ManagerOperationsPage />} />
              <Route path="reports" element={<ManagerReportsPage />} />
              <Route
                path="reports/:reportId"
                element={<ManagerReportReviewPage />}
              />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['USER']} />}>
            <Route path="/pcrwr" element={<PcrwrUserLayout />}>
              <Route index element={<PcrwrOverviewPage />} />
              <Route path="field-data" element={<PcrwrFieldDataPage />} />
              <Route
                path="field-data/:reportId"
                element={<PcrwrFieldDataPage />}
              />
              <Route path="records" element={<PcrwrRecordsPage />} />
              <Route path="profile" element={<PcrwrProfilePage />} />
            </Route>
          </Route>

          <Route path="/" element={<RoleHomeRedirect />} />
          <Route path="*" element={<RoleHomeRedirect />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="light" position="top-right" closeButton />
    </AuthProvider>
  )
}
