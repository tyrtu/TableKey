import { useState, useEffect, useCallback } from 'react'
import { LayoutGrid, Bell, LogOut, MessageCircle, Users, Wallet } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { usePendingRequests } from '../../hooks/useRequests'
import { useSessionTimeouts } from '../../hooks/useSessionTimeouts'
import { getPendingHelpRequests } from '../../lib/api'
import { useTableRealtime } from '../../hooks/useRealtime'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useFloorTables } from '../../hooks/useTables'
import { FloorView } from './FloorView'
import type { FloorFilter } from './FloorView'
import { RequestQueueView } from './RequestQueueView'
import { HelpQueueView } from './HelpQueueView'
import { BrandLogo } from '../../components/ui/BrandLogo'

type WaiterTab = 'floor' | 'requests' | 'help'

export default function WaiterLayout() {
  const { staff, signOut } = useAuthStore()
  const [tab, setTab] = useState<WaiterTab>('floor')
  const [activeFilter, setActiveFilter] = useState<FloorFilter>('all')
  const { requests } = usePendingRequests(staff?.venue_id ?? null)
  const [helpCount, setHelpCount] = useState(0)
  const { online } = useOnlineStatus()
  const { tables } = useFloorTables(staff?.venue_id ?? null)

  // Derived counts for summary cards
  const totalCount     = tables.length
  const activeCount    = tables.filter(t => ['active', 'awaiting_payment'].includes(t.status)).length
  const requestedCount = tables.filter(t => t.status === 'requested').length

  const summaryCardsData = [
    {
      id: 'all' as FloorFilter,
      label: 'Tables',
      value: totalCount,
      icon: <LayoutGrid size={14} />,
      valueColor: 'text-gray-900',
      iconBg: 'bg-gray-200',
      iconColor: 'text-gray-600',
      pulse: false,
    },
    {
      id: 'active' as FloorFilter,
      label: 'Active',
      value: activeCount,
      icon: <Users size={14} />,
      valueColor: 'text-blue-600',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-500',
      pulse: false,
    },
    {
      id: 'requested' as FloorFilter,
      label: 'Requests',
      value: requests.length,
      icon: <Bell size={14} />,
      valueColor: 'text-[#e05c27]',
      iconBg: 'bg-orange-100',
      iconColor: 'text-[#e05c27]',
      pulse: requests.length > 0,
    },
    {
      id: 'needs_payment' as FloorFilter,
      label: 'Needs pay',
      value: helpCount,
      icon: <Wallet size={14} />,
      valueColor: helpCount > 0 ? 'text-red-600' : 'text-gray-400',
      iconBg: helpCount > 0 ? 'bg-red-100' : 'bg-gray-100',
      iconColor: helpCount > 0 ? 'text-red-500' : 'text-gray-400',
      pulse: helpCount > 0,
    },
  ]

  // Run session timeouts every 2 min as pg_cron fallback
  useSessionTimeouts(!!staff)

  // Load help request count
  const loadHelpCount = useCallback(async () => {
    if (!staff?.venue_id) return
    const data = await getPendingHelpRequests(staff.venue_id)
    setHelpCount(data.length)
  }, [staff?.venue_id])

  useEffect(() => { loadHelpCount() }, [loadHelpCount])

  // Realtime help count updates
  useTableRealtime('help_requests', 'venue_id', staff?.venue_id ?? undefined, () => {
    loadHelpCount()
  })

  // Sound for table requests
  useEffect(() => {
    if (requests.length === 0) return
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch { /* AudioContext not available */ }
  }, [requests.length])

  // Two-tone chime for help — repeats every 30s while unresolved
  useEffect(() => {
    if (helpCount === 0) return

    const chime = () => {
      try {
        const ctx = new AudioContext()
        ;[660, 880].forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'sine'
          osc.frequency.value = freq
          const t = ctx.currentTime + i * 0.18
          gain.gain.setValueAtTime(0, t)
          gain.gain.linearRampToValueAtTime(0.12, t + 0.05)
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
          osc.start(t)
          osc.stop(t + 0.4)
        })
      } catch { /* AudioContext not available */ }
    }

    chime()
    const id = setInterval(chime, 30000)
    return () => clearInterval(id)
  }, [helpCount])

  return (
    <div className="flex flex-col min-h-screen bg-[#faf8f5]">
      {/* Sticky header + cards as one unit — cards hang out the bottom */}
      <div className="sticky top-0 z-30">
        <header className="bg-[#171614] text-white rounded-b-[1.25rem] shadow-[0_8px_32px_rgba(23,22,20,0.22)] pb-10">
          <div className="relative px-4 pt-5 pb-3 md:px-6 overflow-hidden">
            {/* Concentric circle decorations — 5 rings, more visible */}
            <div className="pointer-events-none absolute -top-20 -right-20">
              <div className="h-56 w-56 rounded-full border border-white/[0.10]" />
              <div className="absolute inset-[22px] rounded-full border border-white/[0.10]" />
              <div className="absolute inset-[44px] rounded-full border border-white/[0.10]" />
              <div className="absolute inset-[66px] rounded-full border border-white/[0.10]" />
              <div className="absolute inset-[88px] rounded-full border border-white/[0.10]" />
            </div>

            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-3 inline-flex rounded-2xl bg-white px-5 py-2.5 shadow-sm">
                  <BrandLogo className="h-9 w-28" />
                </div>
                <h1 className="font-semibold text-white text-lg leading-tight">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {staff?.name?.split(' ')[0] ?? 'there'}</h1>
                <p className="mt-0.5 text-xs text-white/55">
                  Waiter panel · {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-1 pt-2">
                <div
                  title={online ? 'Network online' : 'Network offline'}
                  className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs', online ? 'bg-white/10 text-emerald-300' : 'bg-red-400/15 text-red-300')}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-emerald-400' : 'bg-red-400')} />
                  <span>{online ? 'Online' : 'Offline'}</span>
                </div>
                <button
                  onClick={signOut}
                  className="rounded-full p-2 text-white/65 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>

            {/* Desktop tabs */}
            <div className="hidden md:flex border-t border-white/10 mt-4 -mx-4 px-4">
              <TabButton active={tab === 'floor'} onClick={() => setTab('floor')} icon={<LayoutGrid size={18} />} label="Floor" />
              <TabButton active={tab === 'requests'} onClick={() => setTab('requests')} icon={<Bell size={18} />} label="Requests" badge={requests.length} urgent={requests.length > 0} />
              <TabButton active={tab === 'help'} onClick={() => setTab('help')} icon={<MessageCircle size={18} />} label="Help" badge={helpCount} urgent={helpCount > 0} />
            </div>
          </div>
        </header>

        {/* Summary cards — absolutely positioned, more below the header line */}
        <div className="absolute bottom-0 translate-y-[65%] left-0 right-0 px-4 md:px-6 grid grid-cols-4 gap-2">
          {summaryCardsData.map(card => (
            <button
              key={card.id}
              onClick={() => setActiveFilter(card.id)}
              className={cn(
                'relative flex flex-col items-center py-3 px-1 rounded-2xl border transition-all active:scale-95 shadow-[0_4px_14px_rgba(0,0,0,0.18)]',
                activeFilter === card.id
                  ? 'bg-[#2c2926] border-[#444] text-white'
                  : 'bg-white border-gray-100 text-gray-700'
              )}
            >
              {card.pulse && activeFilter !== card.id && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e05c27] opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[#e05c27]" />
                </span>
              )}
              <div className={cn(
                'mb-1.5 h-7 w-7 rounded-full flex items-center justify-center',
                activeFilter === card.id ? 'bg-white/15' : card.iconBg
              )}>
                <span className={activeFilter === card.id ? 'text-white/80' : card.iconColor}>
                  {card.icon}
                </span>
              </div>
              <p className={cn('text-lg font-bold leading-none', activeFilter === card.id ? 'text-white' : card.valueColor)}>
                {card.value}
              </p>
              <p className={cn('text-[9px] font-medium mt-0.5 leading-tight text-center', activeFilter === card.id ? 'text-white/55' : 'text-gray-400')}>
                {card.label}
              </p>
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 pt-14 pb-20 md:pt-4 md:pb-0">
        {tab === 'floor' && (
          <FloorView
            venueId={staff?.venue_id ?? null}
            staffId={staff?.id ?? null}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            pendingRequestTableIds={new Set(requests.map(r => r.table_id))}
          />
        )}
        {tab === 'requests' && (
          <RequestQueueView
            venueId={staff?.venue_id ?? null}
            staffId={staff?.id ?? null}
            requests={requests}
          />
        )}
        {tab === 'help' && (
          <HelpQueueView
            venueId={staff?.venue_id ?? null}
            staffId={staff?.id ?? null}
          />
        )}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
        aria-label="Waiter navigation"
      >
        <MobileTabButton
          active={tab === 'floor'}
          onClick={() => setTab('floor')}
          icon={<LayoutGrid size={20} />}
          label="Floor"
        />
        <MobileTabButton
          active={tab === 'requests'}
          onClick={() => setTab('requests')}
          icon={<Bell size={20} />}
          label="Requests"
          badge={requests.length}
          urgent={requests.length > 0}
        />
        <MobileTabButton
          active={tab === 'help'}
          onClick={() => setTab('help')}
          icon={<MessageCircle size={20} />}
          label="Help"
          badge={helpCount}
          urgent={helpCount > 0}
        />
      </nav>
    </div>
  )
}

function TabButton({
  active, onClick, icon, label, badge, urgent,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
  urgent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors relative',
        active
          ? 'border-brand-500 text-brand-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      )}
    >
      {icon}
      {label}
      {!!badge && badge > 0 && (
        <span className={cn(
          'absolute top-2 right-[calc(50%-24px)] h-4 min-w-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center',
          urgent ? 'bg-red-500' : 'bg-gray-400'
        )}>
          {badge}
        </span>
      )}
    </button>
  )
}

function MobileTabButton({
  active, onClick, icon, label, badge, urgent,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
  urgent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
        active ? 'text-brand-600' : 'text-gray-400'
      )}
    >
      <span className={cn(
        'flex h-8 w-12 items-center justify-center rounded-lg transition-colors',
        active ? 'bg-brand-500/10' : ''
      )}>
        {icon}
      </span>
      <span>{label}</span>
      {!!badge && badge > 0 && (
        <span className={cn(
          'absolute top-1.5 left-1/2 ml-3 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
          urgent ? 'bg-red-500' : 'bg-gray-400'
        )}>
          {badge}
        </span>
      )}
    </button>
  )
}
