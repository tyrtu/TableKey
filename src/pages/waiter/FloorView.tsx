import { useState, useEffect } from 'react'
import {
  Users, Clock, DollarSign, CheckCircle2, CreditCard,
  Plus, Banknote, ChevronRight, ChefHat, LayoutGrid,
  Bell, AlertCircle, Wallet,
} from 'lucide-react'
import { useFloorTables } from '../../hooks/useTables'
import {
  closeSessionNormal, regenerateCode, computeBill,
  getStaffOrdersBySession, openTableAsWaiter, staffRecordCash,
} from '../../lib/api'
import { getSupabase } from '../../lib/supabase'
import { formatCurrency, elapsedLabel, cn } from '../../lib/utils'
import { Spinner } from '../../components/ui/Spinner'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { TableDetailModal } from './TableDetailModal'
import type { TableWithSession } from '../../hooks/useTables'
import type { ComputedBill } from '../../types/database'
import toast from 'react-hot-toast'

interface Props {
  venueId: string | null
  staffId: string | null
  activeFilter: FloorFilter
  setActiveFilter: (f: FloorFilter) => void
  pendingRequestTableIds: Set<string>
}

type BillCache = Record<string, { bill: ComputedBill; allServed: boolean }>
type KitchenCache = Record<string, { preparing: number; ready: number }>

export type FloorFilter = 'all' | 'idle' | 'active' | 'requested' | 'needs_payment'

export function FloorView({ venueId, staffId, activeFilter, setActiveFilter, pendingRequestTableIds }: Props) {
  const { tables, loading, reload } = useFloorTables(venueId)
  const [selected, setSelected] = useState<TableWithSession | null>(null)
  const [closing, setClosing] = useState(false)
  const [confirmClose, setConfirmClose] = useState<TableWithSession | null>(null)
  const [billCache, setBillCache] = useState<BillCache>({})
  const [kitchenCache, setKitchenCache] = useState<KitchenCache>({})
  const [currency, setCurrency] = useState('USD')

  const [opening, setOpening] = useState<string | null>(null)
  const [quickCash, setQuickCash] = useState<{ table: TableWithSession; bill: ComputedBill } | null>(null)
  const [cashReceived, setCashReceived] = useState('')
  const [cashTip, setCashTip] = useState('')
  const [recordingCash, setRecordingCash] = useState(false)

  useEffect(() => {
    if (!venueId) return
    getSupabase().from('venues').select('currency').eq('id', venueId).single()
      .then(({ data }) => { if (data?.currency) setCurrency(data.currency) })
  }, [venueId])

  useEffect(() => {
    const activeTables = tables.filter(t => t.active_session?.is_active)
    if (activeTables.length === 0) return
    activeTables.forEach(async (t) => {
      const sessId = t.active_session!.id
      try {
        const [bill, orders] = await Promise.all([
          computeBill(sessId),
          getStaffOrdersBySession(sessId),
        ])
        const activeOrders = orders.filter(o => o.status !== 'cancelled')
        const allServed = activeOrders.length > 0 && activeOrders.every(o => o.status === 'served')
        setBillCache(prev => ({ ...prev, [sessId]: { bill, allServed } }))
        const preparing = activeOrders.filter(o => o.status === 'preparing').length
        const ready = activeOrders.filter(o => o.status === 'ready').length
        setKitchenCache(prev => ({ ...prev, [sessId]: { preparing, ready } }))
      } catch { /* bill RPC not yet available */ }
    })
  }, [tables])

  const handleCloseSession = async (table: TableWithSession) => {
    if (!table.active_session || !staffId || !venueId) return
    setClosing(true)
    try {
      await closeSessionNormal(table.active_session.id, table.id, venueId, staffId)
      toast.success(`Table ${table.table_number} closed.`)
      setSelected(null)
      reload()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to close session.'
      if (msg.includes('Outstanding')) {
        toast.error(`${msg} Use the Bill tab to close with an override.`, { duration: 8000 })
      } else {
        toast.error(msg)
      }
    } finally {
      setClosing(false)
      setConfirmClose(null)
    }
  }

  const handleRegenCode = async (table: TableWithSession) => {
    if (!table.active_session || !staffId || !venueId) return
    try {
      const { data: venue } = await getSupabase().from('venues').select('code_length').eq('id', venueId).single()
      const newCode = await regenerateCode(table.active_session.id, venueId, staffId, venue?.code_length ?? 4)
      toast.success(`New code for T${table.table_number}: ${newCode.split('').join(' ')}`, { duration: 8000 })
      reload()
    } catch { toast.error('Failed to regenerate code.') }
  }

  const handleOpenTable = async (table: TableWithSession) => {
    if (!staffId || !venueId) return
    setOpening(table.id)
    try {
      const { data: venue } = await getSupabase().from('venues').select('code_length').eq('id', venueId).single()
      const result = await openTableAsWaiter(table.id, staffId, venue?.code_length ?? 4)
      if (!result.success) { toast.error(result.message ?? 'Failed to open table.'); return }
      toast.success(`Table ${table.table_number} opened. Code: ${result.code?.split('').join(' ')}`, { duration: 10000 })
      reload()
      setTimeout(() => {
        const updated = tables.find(t => t.id === table.id)
        if (updated) setSelected(updated)
      }, 600)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to open table.')
    } finally { setOpening(null) }
  }

  const handleQuickCash = async () => {
    if (!quickCash || !staffId) return
    const cash = parseFloat(cashReceived)
    const bill = quickCash.bill
    if (isNaN(cash) || cash < bill.outstanding) {
      toast.error(`Enter at least ${formatCurrency(bill.outstanding, currency)}`)
      return
    }
    setRecordingCash(true)
    try {
      const result = await staffRecordCash(
        quickCash.table.active_session!.id, staffId, null, cash, parseFloat(cashTip) || 0
      )
      if (!result.success) { toast.error(result.message ?? 'Failed.'); return }
      toast.success(`Cash recorded. Change: ${formatCurrency(result.change_due ?? 0, currency)}`)
      setQuickCash(null); setCashReceived(''); setCashTip('')
      reload()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed.')
    } finally { setRecordingCash(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>

  // ── Derived counts ────────────────────────────────────────────
  const statusOrder = ['requested', 'awaiting_payment', 'active', 'idle', 'closed']

  const withMeta = tables.map(table => {
    const entry = table.active_session ? billCache[table.active_session.id] : undefined
    const kitchen = table.active_session ? kitchenCache[table.active_session.id] : undefined
    const needsPayment = !!entry && entry.allServed && !entry.bill.is_settled && entry.bill.outstanding > 0
    const isPreparing = !needsPayment && !!kitchen && kitchen.preparing > 0
    const isReady = !needsPayment && !isPreparing && !!kitchen && kitchen.ready > 0
    return { table, bill: entry?.bill, allServed: entry?.allServed ?? false, needsPayment, isPreparing, isReady, kitchen }
  })

  const sorted = [...withMeta].sort((a, b) => {
    if (a.needsPayment && !b.needsPayment) return -1
    if (!a.needsPayment && b.needsPayment) return 1
    return statusOrder.indexOf(a.table.status) - statusOrder.indexOf(b.table.status)
  })

  const totalCount    = tables.length
  const activeCount   = tables.filter(t => ['active', 'awaiting_payment'].includes(t.status)).length
  const requestedCount = tables.filter(t => t.status === 'requested').length
  const idleCount     = tables.filter(t => t.status === 'idle').length
  const needsPaymentList = withMeta.filter(m => m.needsPayment)
  const needsPaymentCount = needsPaymentList.length

  // #1: filter grid by active summary card
  const displayed = sorted.filter(m => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'idle') return m.table.status === 'idle'
    if (activeFilter === 'active') return ['active', 'awaiting_payment'].includes(m.table.status)
    if (activeFilter === 'requested') return m.table.status === 'requested' || pendingRequestTableIds.has(m.table.id)
    if (activeFilter === 'needs_payment') return m.needsPayment
    return true
  })

  // ── Summary card definitions ──────────────────────────────────
  const summaryCards: {
    id: FloorFilter
    label: string
    value: number
    icon: React.ReactNode
    activeStyle: string
    inactiveStyle: string
    pulse?: boolean
  }[] = [
    {
      id: 'all',
      label: 'All Tables',
      value: totalCount,
      icon: <LayoutGrid size={15} />,
      activeStyle: 'bg-gray-800 text-white border-gray-800',
      inactiveStyle: 'bg-white text-gray-700 border-gray-200 hover:border-gray-300',
    },
    {
      id: 'active',
      label: 'Active',
      value: activeCount,
      icon: <Users size={15} />,
      activeStyle: 'bg-blue-600 text-white border-blue-600',
      inactiveStyle: 'bg-blue-50 text-blue-700 border-blue-200 hover:border-blue-300',
    },
    {
      id: 'requested',
      label: 'Requests',
      value: requestedCount,
      icon: <Bell size={15} />,
      activeStyle: 'bg-amber-500 text-white border-amber-500',
      inactiveStyle: 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-300',
      // #5: pulse when there are pending requests
      pulse: requestedCount > 0,
    },
    {
      id: 'needs_payment',
      label: 'Needs Pay',
      value: needsPaymentCount,
      icon: <Wallet size={15} />,
      activeStyle: 'bg-red-600 text-white border-red-600',
      inactiveStyle: needsPaymentCount > 0
        ? 'bg-red-50 text-red-700 border-red-300 hover:border-red-400'
        : 'bg-white text-gray-400 border-gray-200',
    },
  ]

  return (
    <div className="px-4 py-4 md:px-6 md:py-5">

      {/* Filter pills — single scrollable row */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
        {summaryCards.map(card => (
          <button
            key={card.id}
            onClick={() => setActiveFilter(card.id)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
              activeFilter === card.id
                ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 shadow-sm'
            )}
          >
            {card.label === 'All Tables' ? 'All' : card.label} · {card.value}
          </button>
        ))}
      </div>

      {/* Active filter label */}
      {activeFilter !== 'all' && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-500">
            Showing: <span className="text-gray-800 font-semibold">
              {summaryCards.find(c => c.id === activeFilter)?.label}
            </span>
            {' '}({displayed.length})
          </p>
          <button
            onClick={() => setActiveFilter('all')}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* #6: Needs Payment — prominent full-width rows */}
      {activeFilter === 'needs_payment' && (
        needsPaymentList.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <CheckCircle2 size={40} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">All tables are paid up</p>
            <p className="text-xs text-gray-400 mt-1">No outstanding balances right now.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {needsPaymentList.map(({ table, bill }) => (
              <div
                key={table.id}
                className="w-full bg-white rounded-2xl border border-red-200 shadow-[0_4px_14px_rgba(239,68,68,0.08)] overflow-hidden"
              >
                {/* Red top accent */}
                <div className="h-1 w-full bg-red-500" />
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="h-11 w-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <CreditCard size={22} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-base">Table {table.table_number}</span>
                      {table.label && <span className="text-xs text-gray-400">· {table.label}</span>}
                      {/* #3: capacity always shown */}
                      {table.capacity && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <Users size={9} /> {table.capacity}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <CheckCircle2 size={11} className="text-emerald-500" />
                      All orders served
                      {table.active_session && (
                        <span className="ml-1 text-gray-400">· {elapsedLabel(table.active_session.opened_at)}</span>
                      )}
                    </p>
                  </div>
                  {/* #6: amount is the hero */}
                  {bill && (
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-red-600 leading-tight">{formatCurrency(bill.outstanding, currency)}</p>
                      {bill.paid > 0 && (
                        <p className="text-[10px] text-gray-400">{formatCurrency(bill.paid, currency)} paid</p>
                      )}
                    </div>
                  )}
                </div>
                {/* #6: inline action buttons */}
                <div className="flex border-t border-red-100">
                  <button
                    onClick={() => {
                      if (bill) { setQuickCash({ table, bill }); setCashReceived(''); setCashTip('') }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors border-r border-red-100"
                  >
                    <Banknote size={15} /> Cash
                  </button>
                  <button
                    onClick={() => setSelected(table)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <ChevronRight size={15} /> Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Grid view — all filters except needs_payment */}
      {activeFilter !== 'needs_payment' && (
        displayed.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <AlertCircle size={36} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No tables match this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {displayed.map(({ table, bill, allServed, needsPayment, isPreparing, isReady, kitchen }) => (
              <TableCard
                key={table.id}
                table={table}
                bill={bill}
                allServed={allServed}
                needsPayment={needsPayment}
                isPreparing={isPreparing}
                isReady={isReady}
                currency={currency}
                kitchen={kitchen}
                onClick={() => setSelected(table)}
                onOpen={table.status === 'idle' ? () => handleOpenTable(table) : undefined}
                opening={opening === table.id}
                onQuickCash={bill && !bill.is_settled && bill.outstanding > 0
                  ? () => { setQuickCash({ table, bill }); setCashReceived(''); setCashTip('') }
                  : undefined}
                onQuickCode={() => setSelected(table)}
              />
            ))}
          </div>
        )
      )}

      {selected && (
        <TableDetailModal
          table={selected}
          onClose={() => setSelected(null)}
          onCloseSession={() => setConfirmClose(selected)}
          onRegenCode={() => handleRegenCode(selected)}
          venueId={venueId}
          staffId={staffId}
          currency={currency}
        />
      )}

      <ConfirmDialog
        open={!!confirmClose}
        onClose={() => setConfirmClose(null)}
        onConfirm={() => confirmClose && handleCloseSession(confirmClose)}
        title="End current party?"
        message={`This will end access for every device at Table ${confirmClose?.table_number} and reset it for a new party. The table must be fully paid before it can be reset.`}
        confirmLabel="End party and reset"
        loading={closing}
      />

      {/* Quick cash modal */}
      <Modal
        open={!!quickCash}
        onClose={() => setQuickCash(null)}
        title={`Quick Cash — Table ${quickCash?.table.table_number}`}
        size="sm"
      >
        {quickCash && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-center">
              <p className="text-xs text-gray-500">Outstanding</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(quickCash.bill.outstanding, currency)}</p>
            </div>
            <Input label="Cash received" type="number" min="0" step="0.01"
              value={cashReceived} onChange={e => setCashReceived(e.target.value)} placeholder="0.00" autoFocus />
            <Input label="Tip (optional)" type="number" min="0" step="0.01"
              value={cashTip} onChange={e => setCashTip(e.target.value)} placeholder="0.00" />
            {parseFloat(cashReceived) > 0 && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2">
                <p className="text-sm text-emerald-800 font-medium">
                  Change due: {formatCurrency(
                    Math.max(0, parseFloat(cashReceived) - quickCash.bill.outstanding - (parseFloat(cashTip) || 0)),
                    currency
                  )}
                </p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setQuickCash(null)}>Cancel</Button>
              <Button onClick={handleQuickCash} loading={recordingCash}>
                <Banknote size={15} /> Confirm Payment
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Table icon SVG ────────────────────────────────────────────
// Simple top-down table + chairs silhouette, colored per state

function TableIconSvg({ state, className }: { state: string; className?: string }) {
  const colors: Record<string, { table: string; chairs: string }> = {
    payment:   { table: '#ef4444', chairs: '#fca5a5' },
    ready:     { table: '#10b981', chairs: '#6ee7b7' },
    preparing: { table: '#f59e0b', chairs: '#fcd34d' },
    requested: { table: '#eab308', chairs: '#fde047' },
    active:    { table: '#3b82f6', chairs: '#93c5fd' },
    idle:      { table: '#9ca3af', chairs: '#d1d5db' },
  }
  const c = colors[state] ?? colors.idle
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" fill="none" className={className}>
      {/* Table top */}
      <rect x="10" y="14" width="20" height="12" rx="2" fill={c.table} />
      {/* Chair top */}
      <rect x="14" y="8"  width="12" height="5" rx="1.5" fill={c.chairs} />
      {/* Chair bottom */}
      <rect x="14" y="27" width="12" height="5" rx="1.5" fill={c.chairs} />
      {/* Chair left */}
      <rect x="4"  y="14" width="5" height="12" rx="1.5" fill={c.chairs} />
      {/* Chair right */}
      <rect x="31" y="14" width="5" height="12" rx="1.5" fill={c.chairs} />
    </svg>
  )
}

// ── Table Card ────────────────────────────────────────────────

function TableCard({
  table, bill, allServed, needsPayment, isPreparing, isReady,
  currency, kitchen, onClick, onOpen, opening, onQuickCash, onQuickCode,
}: {
  table: TableWithSession
  bill: ComputedBill | undefined
  allServed: boolean
  needsPayment: boolean
  isPreparing: boolean
  isReady: boolean
  currency: string
  kitchen?: { preparing: number; ready: number }
  onClick: () => void
  onOpen?: () => void
  opening?: boolean
  onQuickCash?: () => void
  onQuickCode?: () => void
}) {
  const visualState = needsPayment ? 'payment'
    : isReady      ? 'ready'
    : isPreparing  ? 'preparing'
    : table.status

  const cardStyle = {
    payment:          'bg-white border-[#e05c27] shadow-[0_4px_14px_rgba(224,92,39,0.12)]',
    ready:            'bg-white border-emerald-300 shadow-[0_4px_14px_rgba(16,185,129,0.08)]',
    preparing:        'bg-white border-amber-300',
    idle:             'bg-white border-gray-200 shadow-[0_2px_8px_rgba(23,22,20,0.04)]',
    requested:        'bg-white border-[#e05c27] shadow-[0_4px_14px_rgba(224,92,39,0.10)]',
    active:           'bg-white border-blue-200 shadow-[0_2px_8px_rgba(59,130,246,0.07)]',
    settling:         'bg-white border-indigo-200',
    awaiting_payment: 'bg-white border-purple-200',
    parked:           'bg-white border-orange-200 opacity-70',
    closed:           'bg-white border-gray-200 opacity-60',
  }[visualState] ?? 'bg-white border-gray-200'

  // Status pill style
  const statusPill = {
    payment:          'bg-[#fff1ec] text-[#e05c27]',
    ready:            'bg-emerald-50 text-emerald-700',
    preparing:        'bg-amber-50 text-amber-700',
    idle:             'bg-gray-100 text-gray-500',
    requested:        'bg-[#fff1ec] text-[#e05c27]',
    active:           'bg-blue-50 text-blue-700',
    settling:         'bg-indigo-50 text-indigo-700',
    awaiting_payment: 'bg-purple-50 text-purple-700',
    parked:           'bg-orange-50 text-orange-600',
    closed:           'bg-gray-50 text-gray-400',
  }[visualState] ?? 'bg-gray-100 text-gray-500'

  const dotStyle = {
    payment:          'bg-[#e05c27] animate-pulse',
    ready:            'bg-emerald-500 animate-pulse',
    preparing:        'bg-amber-500 animate-pulse',
    idle:             'bg-gray-300',
    requested:        'bg-[#e05c27] animate-pulse',
    active:           'bg-blue-500',
    settling:         'bg-indigo-500',
    awaiting_payment: 'bg-purple-500',
    parked:           'bg-orange-400',
    closed:           'bg-gray-300',
  }[visualState] ?? 'bg-gray-300'

  // Status text — contextual like the design
  const statusText = needsPayment ? 'Bill requested'
    : table.status === 'requested' ? 'Request pending'
    : isReady ? 'Ready to serve'
    : isPreparing ? 'In kitchen'
    : table.status === 'active' ? `Active · ${elapsedLabel(table.active_session!.opened_at)}`
    : table.status === 'awaiting_payment' ? 'Paying'
    : 'Available'

  // Help flag — check if kitchen has needs_help (from status)
  const hasHelpRequest = table.status === 'requested'

  // Guests count — from session devices would be ideal, for now use capacity as upper bound
  const guestInfo = table.capacity ? `${table.capacity} seats` : null

  // Single contextual CTA matching the design
  const cta = (() => {
    if (needsPayment) return {
      label: 'Collect payment',
      style: 'bg-[#e05c27] hover:bg-[#c94f1f] text-white',
      action: onQuickCash,
    }
    if (table.status === 'requested') return {
      label: 'View request',
      style: 'bg-gray-900 hover:bg-gray-800 text-white',
      action: onQuickCode,
    }
    if (table.status === 'active' || table.status === 'awaiting_payment' || isReady || isPreparing) return {
      label: 'View bill',
      style: 'bg-gray-100 hover:bg-gray-200 text-gray-800',
      action: onQuickCode,
    }
    if (table.status === 'idle') return null
    return {
      label: 'Details',
      style: 'bg-gray-100 hover:bg-gray-200 text-gray-800',
      action: onQuickCode,
    }
  })()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className={cn(
        'rounded-2xl border p-4 text-left transition-all active:scale-[0.97] w-full cursor-pointer flex flex-col gap-2',
        cardStyle
      )}
    >
      {/* Top row: icon + table number + amount */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <TableIconSvg state={visualState} className="w-9 h-9 shrink-0" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold tracking-tight text-gray-900">
                T{table.table_number}
              </span>
              {bill && !bill.is_settled && bill.outstanding > 0 && (
                <span className={cn(
                  'text-sm font-bold',
                  needsPayment ? 'text-[#e05c27]' : 'text-gray-900'
                )}>
                  {formatCurrency(bill.outstanding, currency)}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 leading-tight">
              {guestInfo}
              {table.active_session && !['idle','closed'].includes(table.status) && (
                <> · {table.active_session && `${elapsedLabel(table.active_session.opened_at)}`}</>
              )}
            </p>
          </div>
        </div>
        {/* Status dot */}
        <span className={cn('h-2 w-2 rounded-full mt-1 shrink-0', dotStyle)} />
      </div>

      {/* Status pill */}
      <div className="flex items-center gap-1.5">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', statusPill)}>
          {statusText}
        </span>
        {bill?.is_settled && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={9} /> Paid
          </span>
        )}
      </div>

      {/* Kitchen status pills */}
      {kitchen && (kitchen.preparing > 0 || kitchen.ready > 0) && (
        <div className="flex flex-wrap gap-1">
          {kitchen.preparing > 0 && (
            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
              <ChefHat size={9} /> {kitchen.preparing}
            </span>
          )}
          {kitchen.ready > 0 && (
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
              <CheckCircle2 size={9} /> {kitchen.ready} ready
            </span>
          )}
        </div>
      )}

      {/* Open Table button for idle tables */}
      {onOpen && table.status === 'idle' && (
        <button
          onClick={e => { e.stopPropagation(); onOpen() }}
          disabled={opening}
          className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#fff1ec] text-[#e05c27] text-xs font-semibold hover:bg-[#ffe4d6] border border-[#fbd0bc] transition-colors disabled:opacity-50"
        >
          {opening
            ? <span className="h-3 w-3 border-2 border-[#e05c27]/40 border-t-[#e05c27] rounded-full animate-spin" />
            : <Plus size={12} />}
          {opening ? 'Opening…' : '+ Open Table'}
        </button>
      )}

      {/* Single contextual CTA for active tables */}
      {cta && (
        <button
          onClick={e => { e.stopPropagation(); cta.action?.() }}
          className={cn(
            'mt-1 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors',
            cta.style
          )}
        >
          {cta.label}
        </button>
      )}
    </div>
  )
}
