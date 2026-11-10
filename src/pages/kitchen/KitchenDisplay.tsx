import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LogOut, Wifi, WifiOff, Volume2, VolumeX,
  Clock, AlertTriangle, User, CheckSquare, Square, Bell, X, Check,
  Zap, FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useVenueOrders } from '../../hooks/useOrders'
import { updateOrderStatus, cancelOrder, getStations, getMyStations, updateLineStatus } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { useTableRealtime } from '../../hooks/useRealtime'
import { formatTime, cn } from '../../lib/utils'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Spinner } from '../../components/ui/Spinner'
import { supabase } from '../../lib/supabase'
import type { Order, OrderItem, OrderStatus, KitchenStation } from '../../types/database'
import { BrandLogo } from '../../components/ui/BrandLogo'

// ── Column definitions ────────────────────────────────────────

const BASE_COLUMNS: {
  id: OrderStatus
  label: string
  accent: string
  dot: string
  btnClass: string
  btnLabel: string
}[] = [
  {
    id: 'new',
    label: 'New',
    accent: 'bg-amber-400',
    dot: 'bg-amber-400',
    btnClass: 'bg-blue-600 hover:bg-blue-500 text-white',
    btnLabel: 'Start Preparing',           // #6: unchanged for new→preparing
  },
  {
    id: 'preparing',
    label: 'Preparing',
    accent: 'bg-blue-500',
    dot: 'bg-blue-400 animate-pulse',
    btnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    btnLabel: 'Mark Ready',
  },
  {
    id: 'ready',
    label: 'Ready',
    accent: 'bg-emerald-500',
    dot: 'bg-emerald-400',
    btnClass: 'bg-gray-600 hover:bg-gray-500 text-white',
    btnLabel: 'Plated / On Pass',          // #6: renamed from "Mark Served"
  },
]

interface TableMap { [tableId: string]: string }

// #10: ghost record for cancelled orders
interface CancelledGhost {
  order: Order
  expiresAt: number   // ms timestamp when the ghost should be removed
}

export default function KitchenDisplay() {
  const { staff, signOut } = useAuthStore()
  const { orders, loading } = useVenueOrders(staff?.venue_id ?? null)
  const [tableNumbers, setTableNumbers] = useState<TableMap>({})
  const [soundOn, setSoundOn] = useState(true)
  const [connected, setConnected] = useState(true)
  const [confirmCancel, setConfirmCancel] = useState<Order | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [progressing, setProgressing] = useState<Record<string, boolean>>({})
  const prevNewCount = useRef(0)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Station filtering
  const [stations, setStations] = useState<KitchenStation[]>([])
  const [myStationIds, setMyStationIds] = useState<string[]>([])
  const [activeStationId, setActiveStationId] = useState<string | 'all'>('all')

  // #1: allergy acknowledgement
  const [allergyPending, setAllergyPending] = useState<Order | null>(null)

  // #7: keyboard-focused order index (within the focused column)
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null)

  // #10: cancelled ghost cards
  const [cancelledGhosts, setCancelledGhosts] = useState<CancelledGhost[]>([])

  // ── Boot ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!staff?.venue_id) return
    supabase
      .from('restaurant_tables')
      .select('id, table_number')
      .eq('venue_id', staff.venue_id)
      .then(({ data }) => {
        if (data) {
          const map: TableMap = {}
          for (const t of data) map[t.id] = t.table_number
          setTableNumbers(map)
        }
      })
    getStations(staff.venue_id).then(setStations)
    if (staff.id) {
      getMyStations(staff.id).then(ids => {
        setMyStationIds(ids)
        if (staff.role === 'kitchen' && ids.length > 0) setActiveStationId(ids[0])
      })
    }
  }, [staff?.venue_id, staff?.id, staff?.role])

  // ── New order chime ───────────────────────────────────────────
  useEffect(() => {
    const current = orders.filter(o => o.status === 'new').length
    if (current > prevNewCount.current && soundOn) playChime()
    prevNewCount.current = current
  }, [orders, soundOn])

  // #10: when an order is cancelled (appears in prev but not current),
  // add it as a ghost for 10 seconds
  const prevOrderIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const currentIds = new Set(orders.map(o => o.id))
    for (const id of prevOrderIdsRef.current) {
      if (!currentIds.has(id)) {
        const ghost = orders.find(o => o.id === id)
          ?? cancelledGhosts.find(g => g.order.id === id)?.order
        if (ghost) {
          setCancelledGhosts(prev => [
            ...prev.filter(g => g.order.id !== id),
            { order: ghost as Order, expiresAt: Date.now() + 10_000 },
          ])
        }
      }
    }
    prevOrderIdsRef.current = currentIds
  }, [orders])  // eslint-disable-line react-hooks/exhaustive-deps

  // #10: prune expired ghosts
  useEffect(() => {
    if (cancelledGhosts.length === 0) return
    const earliest = Math.min(...cancelledGhosts.map(g => g.expiresAt))
    const delay = earliest - Date.now()
    const id = setTimeout(() => {
      setCancelledGhosts(prev => prev.filter(g => g.expiresAt > Date.now()))
    }, Math.max(delay, 100))
    return () => clearTimeout(id)
  }, [cancelledGhosts])

  const playChime = () => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      ;[523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'; osc.frequency.value = freq
        const t = ctx.currentTime + i * 0.15
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.18, t + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
        osc.start(t); osc.stop(t + 0.5)
      })
    } catch { /* AudioContext blocked */ }
  }

  // #8: track connection drops
  useTableRealtime('orders', 'venue_id', staff?.venue_id ?? undefined, () => setConnected(true))

  // ── Progress handler ──────────────────────────────────────────
  const handleProgress = useCallback(async (order: Order) => {
    if (!staff?.venue_id) return

    // #1: require allergy ack before starting preparation
    if (order.status === 'new') {
      const items = order.items ?? []
      const hasAllergy = items.some(i => i.allergy_flag)
      if (hasAllergy) {
        setAllergyPending(order)
        return
      }
    }

    await doProgress(order)
  }, [staff?.venue_id])  // eslint-disable-line react-hooks/exhaustive-deps

  const doProgress = async (order: Order) => {
    if (!staff?.venue_id) return
    const next: OrderStatus =
      order.status === 'new' ? 'preparing' :
      order.status === 'preparing' ? 'ready' : 'served'
    setProgressing(p => ({ ...p, [order.id]: true }))
    try {
      await updateOrderStatus(order.id, next, staff.id, staff.venue_id)
      if (next === 'ready') toast.success(`${order.order_number} is ready!`, { icon: <Bell size={16} /> })
    } catch { toast.error('Failed to update order.') }
    finally { setProgressing(p => ({ ...p, [order.id]: false })) }
  }

  const handleCancel = async () => {
    if (!confirmCancel || !staff?.venue_id) return
    setCancelling(true)
    try {
      await cancelOrder(confirmCancel.id, staff.venue_id, staff.id)
      toast('Order cancelled.', { icon: <X size={16} /> })
    } catch { toast.error('Failed to cancel.') }
    finally { setCancelling(false); setConfirmCancel(null) }
  }

  // #2: serve all ready tickets for a specific table
  const handleServeTable = async (tableId: string) => {
    if (!staff?.venue_id) return
    const readyForTable = orders.filter(o => o.table_id === tableId && o.status === 'ready')
    await Promise.all(readyForTable.map(o =>
      updateOrderStatus(o.id, 'served', staff.id, staff.venue_id!)
    ))
    toast.success(`All ready orders for T${tableNumbers[tableId]} marked as served.`, { icon: <Check size={16} /> })
  }

  // ── Filtering ─────────────────────────────────────────────────
  const visibleOrders = activeStationId === 'all'
    ? orders
    : orders.filter(o => (o.items ?? []).some(item => item.station_id === activeStationId))

  const columnOrders = (status: OrderStatus) =>
    visibleOrders
      .filter(o => o.status === status)
      .sort((a, b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime())

  // #9: count active orders per station
  const orderCountByStation = (stationId: string) =>
    orders.filter(o =>
      o.status !== 'served' && o.status !== 'cancelled' &&
      (o.items ?? []).some(i => i.station_id === stationId)
    ).length

  // #7: flat list of all visible non-served orders for keyboard nav
  const allVisibleOrders = [
    ...columnOrders('new'),
    ...columnOrders('preparing'),
    ...columnOrders('ready'),
  ]

  // #7: keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === ' ') {
        e.preventDefault()
        if (focusedOrderId) {
          const o = allVisibleOrders.find(o => o.id === focusedOrderId)
          if (o) handleProgress(o)
        } else if (allVisibleOrders.length > 0) {
          setFocusedOrderId(allVisibleOrders[0].id)
        }
      } else if (e.key.toLowerCase() === 'c') {
        if (focusedOrderId) {
          const o = allVisibleOrders.find(o => o.id === focusedOrderId)
          if (o) setConfirmCancel(o)
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        const idx = allVisibleOrders.findIndex(o => o.id === focusedOrderId)
        const next = allVisibleOrders[idx + 1]
        if (next) setFocusedOrderId(next.id)
        else if (allVisibleOrders.length > 0) setFocusedOrderId(allVisibleOrders[0].id)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const idx = allVisibleOrders.findIndex(o => o.id === focusedOrderId)
        const prev = allVisibleOrders[idx - 1]
        if (prev) setFocusedOrderId(prev.id)
      } else if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1
        const o = allVisibleOrders[idx]
        if (o) setFocusedOrderId(o.id)
      } else if (e.key === 'Escape') {
        setFocusedOrderId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusedOrderId, allVisibleOrders, handleProgress])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render guards ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <Spinner size="lg" className="text-white" />
      </div>
    )
  }

  const totalActive = visibleOrders.length
  const activeStation = stations.find(s => s.id === activeStationId)
  const visibleStations = staff?.role === 'kitchen'
    ? stations.filter(s => myStationIds.includes(s.id))
    : stations

  // #2: tables that have multiple ready tickets
  const readyTableIds = (() => {
    const map: Record<string, number> = {}
    columnOrders('ready').forEach(o => { map[o.table_id] = (map[o.table_id] ?? 0) + 1 })
    return Object.entries(map).filter(([, count]) => count >= 2).map(([id]) => id)
  })()

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* #8: disconnected banner */}
      {!connected && (
        <div className="flex items-center justify-center gap-2 bg-red-900/80 border-b border-red-700 px-4 py-2 text-sm text-red-200 shrink-0">
          <WifiOff size={14} />
          <span>Realtime disconnected — orders shown may be stale. Attempting to reconnect…</span>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-8 w-24" />
          <div>
            <p className="font-bold text-sm text-white leading-tight">Kitchen Display</p>
            <p className="text-xs text-gray-500 leading-tight">
              {activeStation ? activeStation.name : 'All stations'} · {staff?.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* #7: keyboard hint */}
          <span className="hidden md:flex items-center gap-1 text-[10px] text-gray-600 bg-gray-900 border border-gray-800 rounded px-2 py-1">
            <kbd className="font-mono">Space</kbd>=advance &nbsp;
            <kbd className="font-mono">C</kbd>=cancel &nbsp;
            <kbd className="font-mono">↑↓</kbd>=navigate
          </span>
          {totalActive > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-gray-800 px-3 py-1 border border-gray-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
              <span className="text-xs font-medium text-gray-300">{totalActive} active</span>
            </div>
          )}
          <button onClick={() => setSoundOn(s => !s)} title={soundOn ? 'Mute' : 'Unmute'}
            className={cn('p-2 rounded-lg transition-colors',
              soundOn ? 'text-brand-400 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-800')}>
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <div title={connected ? 'Connected' : 'Disconnected'}
            className={cn('p-2 rounded-lg', connected ? 'text-emerald-400' : 'text-red-400')}>
            {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
          </div>
          <button onClick={signOut} className="p-2 rounded-lg text-gray-500 hover:bg-gray-800">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Station filter bar — #9: count badges */}
      {visibleStations.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0 scrollbar-hide">
          <StationPill
            label="All"
            color="#6b7280"
            active={activeStationId === 'all'}
            count={orders.filter(o => o.status !== 'served' && o.status !== 'cancelled').length}
            onClick={() => setActiveStationId('all')}
          />
          {visibleStations.map(s => (
            <StationPill
              key={s.id}
              label={s.name}
              color={s.color}
              active={activeStationId === s.id}
              count={orderCountByStation(s.id)}
              onClick={() => setActiveStationId(s.id)}
            />
          ))}
        </div>
      )}

      {/* #2: Serve-all bar — shown when 2+ ready tickets share a table */}
      {readyTableIds.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 py-2 bg-emerald-950/60 border-b border-emerald-800/40 shrink-0 scrollbar-hide">
          <span className="text-xs text-emerald-400 font-medium shrink-0 self-center">Serve table:</span>
          {readyTableIds.map(tid => (
            <button
              key={tid}
              onClick={() => handleServeTable(tid)}
              className="shrink-0 flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-full px-3 py-1 transition-colors active:scale-95"
            >
              T{tableNumbers[tid]} ({columnOrders('ready').filter(o => o.table_id === tid).length})
            </button>
          ))}
        </div>
      )}

      {/* Columns */}
      <div className="flex-1 flex overflow-hidden">
        {BASE_COLUMNS.map((col, colIdx) => {
          const colOrds = columnOrders(col.id)
          // #10: inject ghost cards into the column they were cancelled from
          const ghosts = cancelledGhosts.filter(g => g.order.status === col.id)
          return (
            <div key={col.id}
              className={cn('flex-1 flex flex-col min-w-0',
                colIdx < BASE_COLUMNS.length - 1 && 'border-r border-gray-800')}>
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800 bg-gray-900/60 shrink-0">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', col.dot)} />
                  <span className="font-semibold text-sm text-white">{col.label}</span>
                </div>
                {colOrds.length > 0 && (
                  <span className="text-xs font-bold bg-gray-800 text-gray-300 rounded-full px-2 py-0.5 border border-gray-700">
                    {colOrds.length}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
                {colOrds.length === 0 && ghosts.length === 0 && (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-gray-700 text-center py-8">No orders</p>
                  </div>
                )}

                {/* Live order cards */}
                {colOrds.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    tableNumber={tableNumbers[order.table_id]}
                    col={col}
                    activeStationId={activeStationId}
                    stations={stations}
                    progressing={!!progressing[order.id]}
                    focused={focusedOrderId === order.id}
                    onFocus={() => setFocusedOrderId(order.id)}
                    onProgress={() => handleProgress(order)}
                    onCancel={() => setConfirmCancel(order)}
                    staffId={staff?.id ?? ''}
                    venueId={staff?.venue_id ?? ''}
                  />
                ))}

                {/* #10: ghost cards for recently cancelled orders */}
                {ghosts.map(g => (
                  <CancelledGhostCard
                    key={g.order.id}
                    order={g.order}
                    tableNumber={tableNumbers[g.order.table_id]}
                    expiresAt={g.expiresAt}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Cancel confirm dialog */}
      <ConfirmDialog
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={handleCancel}
        title="Cancel order?"
        message={`Cancel ${confirmCancel?.order_number}? This cannot be undone.`}
        confirmLabel="Cancel Order"
        loading={cancelling}
      />

      {/* #1: allergy acknowledgement modal */}
      {allergyPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 border border-amber-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-amber-900/60 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} className="text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Allergy flag on this ticket</h3>
                <p className="text-xs text-gray-400">{allergyPending.order_number}</p>
              </div>
            </div>

            {/* Show the flagged items */}
            <div className="space-y-1.5 mb-5">
              {(allergyPending.items ?? []).filter(i => i.allergy_flag).map(item => (
                <div key={item.id} className="rounded-lg bg-amber-950/60 border border-amber-800/50 px-3 py-2">
                  <p className="text-sm text-white font-medium">{item.quantity}× {item.item_name}</p>
                  {item.allergy_note && (
                    <p className="text-xs text-amber-300 mt-0.5"><AlertTriangle size={12} className="inline mr-1" />{item.allergy_note}</p>
                  )}
                </div>
              ))}
            </div>

            <p className="text-sm text-amber-200 mb-5">
              Confirm you have read the allergy note above before starting preparation.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setAllergyPending(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-300 text-sm hover:bg-gray-800 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={() => { setAllergyPending(null); doProgress(allergyPending) }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
              >
                Acknowledged — Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Station Pill — #9: count badge ────────────────────────────

function StationPill({ label, color, active, count, onClick }: {
  label: string; color: string; active: boolean; count: number; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border',
        active
          ? 'text-white border-transparent'
          : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
      )}
      style={active ? { backgroundColor: color, borderColor: color } : undefined}
    >
      {!active && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      {label}
      {count > 0 && (
        <span className={cn(
          'rounded-full px-1.5 py-0 text-[10px] font-bold leading-5',
          active ? 'bg-white/20 text-white' : 'bg-gray-700 text-gray-300'
        )}>
          {count}
        </span>
      )}
    </button>
  )
}

// ── Order Card ────────────────────────────────────────────────

interface OrderCardProps {
  order: Order & { items?: OrderItem[] }
  tableNumber: string | undefined
  col: typeof BASE_COLUMNS[number]
  activeStationId: string | 'all'
  stations: KitchenStation[]
  progressing: boolean
  focused: boolean
  onFocus: () => void
  onProgress: () => void
  onCancel: () => void
  staffId: string
  venueId: string
}

function OrderCard({
  order, tableNumber, col, activeStationId, stations,
  progressing, focused, onFocus, onProgress, onCancel, staffId, venueId,
}: OrderCardProps) {
  // #4: MM:SS elapsed timer (seconds-precise)
  const [elapsedSec, setElapsedSec] = useState(() =>
    Math.floor((Date.now() - new Date(order.placed_at).getTime()) / 1000)
  )
  useEffect(() => {
    const id = setInterval(() =>
      setElapsedSec(Math.floor((Date.now() - new Date(order.placed_at).getTime()) / 1000))
    , 1000)
    return () => clearInterval(id)
  }, [order.placed_at])

  const elapsedMins = Math.floor(elapsedSec / 60)
  const elapsedRemSec = elapsedSec % 60
  const isUrgent = elapsedMins >= 12 && col.id !== 'ready'
  const urgencySecondsLeft = (12 * 60) - elapsedSec  // seconds until urgent threshold

  const isWaiterOrder = order.source === 'waiter'

  // Filter items to active station if selected
  const visibleItems = activeStationId === 'all'
    ? (order.items ?? [])
    : (order.items ?? []).filter(item => item.station_id === activeStationId)

  const hasAllergyFlag = visibleItems.some(i => i.allergy_flag)

  // #3: station color for left border — use first item's station color when station-filtered
  const stationColor = activeStationId !== 'all'
    ? stations.find(s => s.id === activeStationId)?.color
    : undefined

  // #5: per-line item done tracking (station-filtered view only)
  const [lineDone, setLineDone] = useState<Set<string>>(new Set())
  const allLinesDone = visibleItems.length > 0 && visibleItems.every(i => lineDone.has(i.id))

  const handleLineToggle = async (item: OrderItem) => {
    const nowDone = !lineDone.has(item.id)
    const next = new Set(lineDone)
    nowDone ? next.add(item.id) : next.delete(item.id)
    setLineDone(next)
    try {
      await updateLineStatus(item.id, nowDone ? 'ready' : 'preparing', staffId, venueId)
    } catch {
      // revert on failure
      nowDone ? next.delete(item.id) : next.add(item.id)
      setLineDone(new Set(next))
      toast.error('Failed to update item.')
    }
  }

  const showLineCheckboxes = activeStationId !== 'all' && col.id === 'preparing'

  return (
    <div
      onClick={onFocus}
      className={cn(
        'rounded-xl bg-gray-900 border overflow-hidden cursor-pointer transition-all',
        // #3: left border in station color
        focused ? 'ring-2 ring-brand-400 ring-offset-1 ring-offset-gray-950' : '',
        hasAllergyFlag ? 'border-amber-600/80' : isUrgent ? 'border-red-700/70' : 'border-gray-800',
      )}
      style={stationColor ? { borderLeftColor: stationColor, borderLeftWidth: 4 } : undefined}
    >
      {/* Allergy warning bar */}
      {hasAllergyFlag && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-900/60 border-b border-amber-700/50">
          <AlertTriangle size={11} className="text-amber-400 shrink-0" />
          <span className="text-[10px] text-amber-300 font-semibold">ALLERGY FLAG — verify before preparing</span>
        </div>
      )}

      {/* Accent bar */}
      <div className={cn('h-0.5 w-full', col.accent)} />

      {/* Card header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-sm font-mono tracking-wide">
            {order.order_number}
          </span>
          <span className="text-xs text-gray-400 bg-gray-800 rounded px-1.5 py-0.5">
            T{tableNumber ?? '?'}
          </span>
          {isWaiterOrder && (
            <span className="inline-flex items-center gap-0.5 text-[10px] bg-purple-900/60 text-purple-300 border border-purple-700/50 rounded px-1.5 py-0.5">
              <User size={9} /> Staff
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* #4: MM:SS timer */}
          <span className={cn(
            'flex items-center gap-0.5 text-xs font-mono font-bold rounded px-1.5 py-0.5',
            isUrgent
              ? 'text-red-400 bg-red-950/60 border border-red-800/50'
              : 'text-gray-500 bg-gray-800'
          )}>
            <Clock size={10} />
            {elapsedMins}:{String(elapsedRemSec).padStart(2, '0')}
          </span>
          {/* #4: countdown to urgent — only show when not yet urgent and < 3 min away */}
          {!isUrgent && urgencySecondsLeft > 0 && urgencySecondsLeft <= 180 && (
            <span className="text-[10px] text-amber-500 font-mono">
              {Math.ceil(urgencySecondsLeft / 60)}m to <Zap size={11} className="inline" />
            </span>
          )}
          <span className="text-[10px] text-gray-600">{formatTime(order.placed_at)}</span>
        </div>
      </div>

      {/* Items — #5: checkboxes when station-filtered + preparing */}
      <div className="px-3 pb-2 space-y-1">
        {visibleItems.map(item => (
          <div key={item.id} className="flex items-start gap-2">
            {/* #5: per-line checkbox */}
            {showLineCheckboxes && (
              <button
                onClick={e => { e.stopPropagation(); handleLineToggle(item) }}
                className="mt-0.5 shrink-0 text-gray-500 hover:text-emerald-400 transition-colors"
                title="Mark item done"
              >
                {lineDone.has(item.id)
                  ? <CheckSquare size={16} className="text-emerald-400" />
                  : <Square size={16} />
                }
              </button>
            )}
            <span className="text-xs font-bold text-brand-400 shrink-0 w-5 text-right mt-0.5">
              {item.quantity}×
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className={cn('text-sm text-white leading-snug', lineDone.has(item.id) && 'line-through opacity-50')}>
                  {item.item_name}
                </p>
                {item.allergy_flag && (
                  <span title={item.allergy_note ?? 'Allergy flag'}>
                    <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                  </span>
                )}
              </div>
              {item.options && Object.keys(item.options).length > 0 && (
                <p className="text-[11px] text-gray-500 leading-tight">
                  {Object.values(item.options as Record<string, string>).join(' · ')}
                </p>
              )}
              {item.notes && (
                <p className="text-[11px] text-amber-400 leading-tight mt-0.5"><AlertTriangle size={12} className="inline mr-1" />{item.notes}</p>
              )}
              {item.allergy_flag && item.allergy_note && (
                <p className="text-[11px] text-amber-300 leading-tight mt-0.5 font-medium">
                  <AlertTriangle size={12} className="inline mr-1" />{item.allergy_note}
                </p>
              )}
            </div>
          </div>
        ))}

        {order.notes && (
          <div className="mt-1.5 rounded-lg bg-amber-950/50 border border-amber-800/40 px-2 py-1.5">
            <p className="text-[11px] text-amber-300 leading-snug"><FileText size={12} className="inline mr-1" />{order.notes}</p>
          </div>
        )}

        {/* #5: "all items done" hint */}
        {showLineCheckboxes && allLinesDone && (
          <p className="text-[11px] text-emerald-400 mt-1"><CheckSquare size={12} className="inline mr-1" />All items checked — tap Mark Ready when plated</p>
        )}
      </div>

      {/* Actions */}
      {col.id !== 'served' && (
        <div className="flex gap-1.5 px-3 pb-2.5">
          <button
            onClick={e => { e.stopPropagation(); onProgress() }}
            disabled={progressing}
            className={cn(
              'flex-1 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95',
              col.btnClass,
              progressing && 'opacity-50 cursor-not-allowed'
            )}
          >
            {progressing ? '…' : col.btnLabel}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onCancel() }}
            disabled={progressing}
            className="w-8 rounded-lg bg-gray-800 hover:bg-red-900/50 text-gray-500 hover:text-red-400 text-xs transition-colors border border-gray-700 flex items-center justify-center"
            title="Cancel (C)"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── #10: Cancelled ghost card ─────────────────────────────────

function CancelledGhostCard({ order, tableNumber, expiresAt }: {
  order: Order & { items?: OrderItem[] }
  tableNumber: string | undefined
  expiresAt: number
}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()))

  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.max(0, expiresAt - Date.now())
      setRemaining(left)
    }, 250)
    return () => clearInterval(id)
  }, [expiresAt])

  const opacity = remaining / 10_000   // fades from 1→0 over 10s

  return (
    <div
      className="rounded-xl bg-gray-900 border border-red-900/60 overflow-hidden transition-opacity"
      style={{ opacity }}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-red-950/40 border-b border-red-900/40">
        <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Cancelled</span>
        <span className="text-[10px] text-gray-600 ml-auto">{Math.ceil(remaining / 1000)}s</span>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-gray-600 text-sm font-mono">{order.order_number}</span>
          <span className="text-xs text-gray-700 bg-gray-800 rounded px-1.5 py-0.5">T{tableNumber ?? '?'}</span>
        </div>
        <div className="space-y-0.5">
          {(order.items ?? []).map(item => (
            <p key={item.id} className="text-xs text-gray-600 line-through">
              {item.quantity}× {item.item_name}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
