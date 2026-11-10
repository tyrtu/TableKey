import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { UtensilsCrossed } from 'lucide-react'
import { useAuthStore } from './stores/authStore'
import { FullPageSpinner } from './components/ui/Spinner'
import { ConnectionStatus } from './components/ConnectionStatus'

// Application pages
import LoginPage from './pages/auth/LoginPage'
import OwnerSignupPage from './pages/auth/OwnerSignupPage'
import PinLoginPage from './pages/auth/PinLoginPage'
import InvitePage from './pages/auth/InvitePage'
import DevicePairPage from './pages/auth/DevicePairPage'
import TablePage from './pages/customer/TablePage'
import WaiterLayout from './pages/waiter/WaiterLayout'
import KitchenDisplay from './pages/kitchen/KitchenDisplay'
import AdminLayout from './pages/admin/AdminLayout'

// ── Route Guards ────────────────────────────────────────────────

/**
 * Redirects unauthenticated users to /login.
 * Accepts either Supabase Auth (user) or PIN shared-device sessions (mode=pin + staff).
 * Once authenticated, further redirects by role.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { mode, user, staff, initialized } = useAuthStore()
  const location = useLocation()

  if (!initialized) return <FullPageSpinner label="Loading…" />

  const isAuthed = !!user || (mode === 'pin' && !!staff)
  if (!isAuthed) return <Navigate to="/login" state={{ from: location }} replace />

  // If we have a staff record but are on the wrong role route, redirect
  if (staff) {
    const path = location.pathname
    const role = staff.role
    const isAdminLike = role === 'admin' || role === 'owner' || role === 'manager'

    if (isAdminLike && (path.startsWith('/waiter') || path.startsWith('/kitchen'))) {
      return <Navigate to="/admin" replace />
    }
    if (role === 'waiter' && (path.startsWith('/admin') || path.startsWith('/kitchen'))) {
      return <Navigate to="/waiter" replace />
    }
    if (role === 'kitchen' && (path.startsWith('/admin') || path.startsWith('/waiter'))) {
      return <Navigate to="/kitchen" replace />
    }
  }

  return <>{children}</>
}

/**
 * Root redirect — sends authenticated staff to their role's home page.
 */
function RootRedirect() {
  const { mode, user, staff, initialized } = useAuthStore()

  if (!initialized) return <FullPageSpinner label="Loading…" />

  // PIN session (shared device) — redirect by role, no login required
  if (mode === 'pin' && staff) {
    if (staff.role === 'admin' || staff.role === 'owner' || staff.role === 'manager')
      return <Navigate to="/admin" replace />
    if (staff.role === 'kitchen') return <Navigate to="/kitchen" replace />
    return <Navigate to="/waiter" replace />
  }

  if (!user) return <Navigate to="/login" replace />

  // Redirect by role
  if (staff?.role === 'owner' || staff?.role === 'admin' || staff?.role === 'manager')
    return <Navigate to="/admin" replace />
  if (staff?.role === 'kitchen') return <Navigate to="/kitchen" replace />
  if (staff?.role === 'waiter') return <Navigate to="/waiter" replace />

  // Logged in but no staff record yet
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <p className="text-lg font-semibold text-gray-800 mb-2">Account not configured</p>
        <p className="text-sm text-gray-500">
          Your account exists but isn't linked to a venue. Ask your admin to check your staff record.
        </p>
      </div>
    </div>
  )
}

// ── App Shell ────────────────────────────────────────────────────

function AppRoutes() {
  const { initialize, initialized } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  if (!initialized) return <FullPageSpinner label="Starting up…" />

  return (
    <Routes>
      {/* ── Public: Customer table page ── */}
      {/* New canonical URL: /:venueSlug/t/:tableSlug */}
      <Route path="/:venueSlug/t/:tableSlug" element={<TablePage />} />
      {/* Legacy redirect for old /t/:token QR codes still in the wild */}
      <Route path="/t/:token" element={<LegacyTableRedirect />} />

      {/* ── Auth ── */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<OwnerSignupPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/pair" element={<DevicePairPage />} />
      <Route path="/pin-login" element={<PinLoginPage />} />

      {/* ── Staff routes (all require auth) ── */}
      <Route
        path="/waiter"
        element={
          <RequireAuth>
            <WaiterLayout />
          </RequireAuth>
        }
      />
      <Route
        path="/kitchen"
        element={
          <RequireAuth>
            <KitchenDisplay />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/:section"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      />

      {/* ── Root: role-based redirect ── */}
      <Route path="/" element={<RootRedirect />} />

      {/* ── 404 ── */}
      <Route
        path="*"
        element={
          <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
            <UtensilsCrossed size={56} className="text-brand-500" />
            <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
            <p className="text-sm text-gray-500">
              If you're a customer, scan the QR code at your table.
            </p>
          </div>
        }
      />
    </Routes>
  )
}

// Redirect old /t/:token URLs to the new /:venueSlug/t/:tableSlug format
function LegacyTableRedirect() {
  const { token } = useParams<{ token: string }>()
  const [dest, setDest] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    import('./lib/supabase').then(({ supabase: sb }) => {
      sb.from('restaurant_tables')
        .select('table_slug, venues!inner(slug)')
        .eq('qr_token', token)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const venues = data.venues as unknown as { slug: string }
            setDest(`/${venues.slug}/t/${data.table_slug}`)
          } else {
            setDest('/')
          }
        })
    })
  }, [token])

  if (!dest) return <FullPageSpinner label="Redirecting…" />
  return <Navigate to={dest} replace />
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
      <ConnectionStatus />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
            maxWidth: '380px',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
    </BrowserRouter>
  )
}
