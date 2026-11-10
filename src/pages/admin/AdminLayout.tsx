import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  UtensilsCrossed, LayoutGrid, Users, BarChart2,
  Settings, LogOut, Menu, X, ChevronRight, FileText, TrendingUp,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { useSessionTimeouts } from '../../hooks/useSessionTimeouts'
import { SetupChecklist } from './SetupChecklist'
import MenuManagement from './MenuManagement'
import TablesManagement from './TablesManagement'
import Analytics from './Analytics'
import StaffManagement from './StaffManagement'
import SettingsPage from './SettingsPage'
import PlanningPage from './PlanningPage'
import ReconciliationPage from './ReconciliationPage'
import { BrandLogo } from '../../components/ui/BrandLogo'

type AdminTab = 'menu' | 'tables' | 'staff' | 'analytics' | 'planning' | 'reconciliation' | 'settings'

const NAV: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'menu',           label: 'Menu',           icon: <UtensilsCrossed size={18} /> },
  { id: 'tables',         label: 'Tables',         icon: <LayoutGrid size={18} /> },
  { id: 'staff',          label: 'Staff',          icon: <Users size={18} /> },
  { id: 'analytics',      label: 'Analytics',      icon: <BarChart2 size={18} /> },
  { id: 'planning',       label: 'Planning',       icon: <TrendingUp size={18} /> },
  { id: 'reconciliation', label: 'Reconciliation', icon: <FileText size={18} /> },
  { id: 'settings',       label: 'Settings',       icon: <Settings size={18} /> },
]

export default function AdminLayout() {
  const { staff, signOut } = useAuthStore()
  const navigate = useNavigate()
  const { section } = useParams<{ section?: string }>()
  const tab = (section ?? 'menu') as AdminTab
  const setTab = (id: AdminTab) => navigate(`/admin/${id}`, { replace: true })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Run session timeouts every 2 min as pg_cron fallback
  useSessionTimeouts(!!staff)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ── Sidebar (desktop) / Drawer (mobile) ── */}
      <>
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-60 bg-gray-900 flex flex-col transition-transform duration-200',
            'lg:static lg:translate-x-0 lg:shrink-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          {/* Brand */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
            <div>
              <BrandLogo className="h-7 w-20" />
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500 mt-1">TableKey</p>
              <p className="text-xs text-gray-400 truncate max-w-[140px]">{staff?.name}</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-400 hover:text-white p-1 rounded"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav — scrollable if many items */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); setSidebarOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  tab === item.id
                    ? 'bg-brand-500 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )}
              >
                {item.icon}
                {item.label}
                {tab === item.id && <ChevronRight size={14} className="ml-auto" />}
              </button>
            ))}
          </nav>

          {/* Sign out — pinned to bottom */}
          <div className="px-3 pb-4 shrink-0">
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </aside>
      </>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <h1 className="font-bold text-gray-900">
            {NAV.find((n) => n.id === tab)?.label}
          </h1>
        </header>

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-5xl mx-auto w-full">
            {tab === 'menu' && (
              <>
                <SetupChecklist venueId={staff?.venue_id ?? ''} />
                <MenuManagement venueId={staff?.venue_id ?? ''} />
              </>
            )}
            {tab === 'tables'         && <TablesManagement venueId={staff?.venue_id ?? ''} />}
            {tab === 'staff'          && <StaffManagement venueId={staff?.venue_id ?? ''} />}
            {tab === 'analytics'      && <Analytics venueId={staff?.venue_id ?? ''} />}
            {tab === 'planning'       && <PlanningPage venueId={staff?.venue_id ?? ''} />}
            {tab === 'reconciliation' && <ReconciliationPage venueId={staff?.venue_id ?? ''} />}
            {tab === 'settings'       && <SettingsPage venueId={staff?.venue_id ?? ''} />}
          </div>
        </main>
      </div>
    </div>
  )
}
