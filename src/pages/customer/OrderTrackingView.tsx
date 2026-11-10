import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, CreditCard, CheckCircle, Clock, ChefHat,
  Bell, HelpCircle, X, AlertTriangle, Receipt as ReceiptIcon,
  UserRound, ChevronRight, ChevronDown,
} from 'lucide-react'
import { useSessionOrders } from '../../hooks/useOrders'
import { useTableRealtime } from '../../hooks/useRealtime'
import { computeBill, createHelpRequest, cancelHelpRequest, getSessionHelpRequests } from '../../lib/api'
import { formatCurrency, formatTime, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Input'
import { VenueLogo } from '../../components/ui/VenueLogo'
import {
  WaitingClockSvg, PreparingPanSvg, ReadyBellSvg, ServedCheckSvg,
} from '../../components/ui/Decorations'
import type { RestaurantTable, Venue, TableSession, ComputedBill, HelpRequest, Order } from '../../types/database'

interface Props {
  table: RestaurantTable
  venue: Venue
  session: TableSession
  onBack: () => void
  onCheckout: () => void
}

// Per-status color tokens
const STATUS_CONFIG = {
  new: {
    bar: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    label: 'New',
    step: 1,
  },
  preparing: {
    bar: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'Preparing',
    step: 2,
  },
  ready: {
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'Ready',
    step: 3,
  },
  served: {
    bar: 'bg-gray-300',
    badge: 'bg-gray-50 text-gray-500 border-gray-200',
    label: 'Served',
    step: 4,
  },
} as const

const TOTAL_STEPS = 4

function elapsedMins(placedAt: string) {
  return Math.floor((Date.now() - new Date(placedAt).getTime()) / 60000)
}

export function OrderTrackingView({ table, venue, session, onBack, onCheckout }: Props) {
  const { orders, loading } = useSessionOrders(session.is_active ? session.id : null)
  const [bill, setBill] = useState<ComputedBill | null>(null)
  const [billLoading, setBillLoading] = useState(true)
  const [helpModal, setHelpModal] = useState(false)
  const [openHelp, setOpenHelp] = useState<HelpRequest | null>(null)
  const [servedOpen, setServedOpen] = useState(false)

  const loadBill = useCallback(async () => {
    try {
      const b = await computeBill(session.id)
      setBill(b)
    } catch { setBill(null) }
    finally { setBillLoading(false) }
  }, [session.id])

  useEffect(() => { loadBill() }, [loadBill])
  useTableRealtime('order_items', 'order_id', undefined, () => { loadBill() })

  useEffect(() => {
    getSessionHelpRequests(session.id).then(reqs => {
      const active = reqs.find(r => r.status === 'open' || r.status === 'acknowledged')
      setOpenHelp(active ?? null)
    })
  }, [session.id])
  useTableRealtime('help_requests', 'session_id', session.id, () => {
    getSessionHelpRequests(session.id).then(reqs => {
      const active = reqs.find(r => r.status === 'open' || r.status === 'acknowledged')
      setOpenHelp(active ?? null)
    })
  })

  const activeOrders = orders
    .filter(o => o.status !== 'cancelled')
    .filter(o => o.items && o.items.length > 0)

  const allServed = activeOrders.length > 0 && activeOrders.every(o => o.status === 'served')
  const sessionTotal = bill ? bill.outstanding : activeOrders.reduce((s, o) => s + Number(o.subtotal), 0)
  const unpaidCount = bill?.items.filter(i => i.payment_status === 'unpaid').length ?? activeOrders.length

  // Group orders
  const readyOrders     = activeOrders.filter(o => o.status === 'ready')
  const preparingOrders = activeOrders.filter(o => o.status === 'preparing')
  const newOrders       = activeOrders.filter(o => o.status === 'new')
  const servedOrders    = activeOrders.filter(o => o.status === 'served')

  // Summary chip counts
  const waitingCount   = newOrders.length
  const preparingCount = preparingOrders.length
  const readyCount     = readyOrders.length

  return (
    <div className="flex flex-col min-h-screen bg-warm">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-gray-100 transition-colors" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <VenueLogo
                venue={venue}
                wrapClass="block h-8 w-[6rem] overflow-hidden"
                imgClass="h-[3.5rem] w-auto max-w-none -translate-x-1 -translate-y-1 object-contain"
                textClass="text-sm font-bold text-gray-900"
              />
            </div>
            <p className="text-xs text-gray-500">Table {table.table_number} · verified</p>
          </div>
          <button
            onClick={() => setHelpModal(true)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
              openHelp
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
            )}
          >
            <HelpCircle size={14} />
            {openHelp ? (openHelp.status === 'acknowledged' ? 'On the way' : 'Help sent') : 'Help'}
          </button>
        </div>

        {/* Summary chips */}
        {!loading && activeOrders.length > 0 && (
          <div className="flex gap-2 px-4 pb-3">
            {waitingCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200">
                {waitingCount} waiting
              </span>
            )}
            {preparingCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                {preparingCount} preparing
              </span>
            )}
            {readyCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {readyCount} ready
              </span>
            )}
          </div>
        )}
      </header>

      {loading || billLoading ? (
        <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>
      ) : activeOrders.length === 0 ? (
        <EmptyState
          icon={<ChefHat size={48} />}
          title="No orders yet"
          description="Add items to your cart and place an order."
          action={<Button variant="secondary" onClick={onBack}><ArrowLeft size={16} /> Back to Menu</Button>}
        />
      ) : (
        <main className="flex-1 px-4 py-4 pb-40">

          {/* ── Ready to serve ─────────────────────────── */}
          {readyOrders.length > 0 && (
            <Section label="Ready to serve" count={readyOrders.length}>
              {readyOrders.map(order => (
                <OrderCard key={order.id} order={order} bill={bill} venue={venue} />
              ))}
            </Section>
          )}

          {/* ── In the kitchen ─────────────────────────── */}
          {preparingOrders.length > 0 && (
            <Section label="In the kitchen" count={preparingOrders.length}>
              {preparingOrders.map(order => (
                <OrderCard key={order.id} order={order} bill={bill} venue={venue} />
              ))}
            </Section>
          )}

          {/* ── Waiting for kitchen ────────────────────── */}
          {newOrders.length > 0 && (
            <Section label="Waiting for the kitchen" count={newOrders.length}>
              {newOrders.map(order => (
                <OrderCard key={order.id} order={order} bill={bill} venue={venue} />
              ))}
            </Section>
          )}

          {/* ── Served accordion ───────────────────────── */}
          {servedOrders.length > 0 && (
            <button
              onClick={() => setServedOpen(v => !v)}
              className="w-full flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 mb-4 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span>Served · {servedOrders.length} order{servedOrders.length !== 1 ? 's' : ''}</span>
              <ChevronDown size={16} className={cn('text-gray-400 transition-transform', servedOpen && 'rotate-180')} />
            </button>
          )}
          {servedOpen && servedOrders.map(order => (
            <OrderCard key={order.id} order={order} bill={bill} venue={venue} className="mb-3" />
          ))}

          {/* Bill totals */}
          {bill && !bill.is_settled && bill.outstanding > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 mb-4">
              {bill.tax_amount > 0 && (
                <div className="flex justify-between text-sm text-gray-500 mb-1">
                  <span>Tax</span><span>{formatCurrency(bill.tax_amount, venue.currency)}</span>
                </div>
              )}
              {bill.service_charge_amount > 0 && (
                <div className="flex justify-between text-sm text-gray-500 mb-1">
                  <span>Service charge</span><span>{formatCurrency(bill.service_charge_amount, venue.currency)}</span>
                </div>
              )}
              {bill.paid > 0 && (
                <div className="flex justify-between text-sm text-emerald-600 mb-1">
                  <span>Paid</span><span>−{formatCurrency(bill.paid, venue.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t border-gray-100 pt-2 mt-1">
                <span>Outstanding</span>
                <span>{formatCurrency(bill.outstanding, venue.currency)}</span>
              </div>
            </div>
          )}

          {bill?.is_settled && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 mb-4">
              <CheckCircle size={18} className="text-emerald-600 shrink-0" />
              <p className="text-sm font-medium text-emerald-800">Bill fully paid. Thanks for dining with us!</p>
            </div>
          )}
        </main>
      )}

      {/* ── Pay bar ─────────────────────────────────────── */}
      {!bill?.is_settled && bill && bill.outstanding > 0 && (
        <div className="fixed bottom-[4.5rem] md:bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 pt-3 pb-4 safe-bottom">
          <button
            onClick={onCheckout}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white text-base font-semibold rounded-2xl py-4 transition-all shadow-md shadow-brand-500/20"
          >
            <CreditCard size={18} />
            Pay full bill · {formatCurrency(bill.outstanding, venue.currency)}
          </button>
          <p className="text-[11px] text-center text-gray-400 mt-2">
            {unpaidCount} item{unpaidCount !== 1 ? 's' : ''} outstanding · Pay cash with waiter
          </p>
        </div>
      )}

      <HelpModal
        open={helpModal}
        onClose={() => setHelpModal(false)}
        session={session}
        table={table}
        venue={venue}
        orders={activeOrders.filter(o => o.status !== 'served')}
        openHelp={openHelp}
        onHelpCreated={(req) => setOpenHelp(req)}
        onHelpCancelled={() => setOpenHelp(null)}
      />
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────

function Section({ label, count, children }: {
  label: string; count: number; children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-xs text-gray-400">{count}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

// ── Status micro-illustration map ────────────────────────────

function StatusIllustration({ status, className }: { status: string; className?: string }) {
  const cls = cn('shrink-0', className)
  if (status === 'new')       return <WaitingClockSvg className={cls} />
  if (status === 'preparing') return <PreparingPanSvg className={cls} />
  if (status === 'ready')     return <ReadyBellSvg className={cls} />
  return <ServedCheckSvg className={cls} />
}

// ── Order card ────────────────────────────────────────────────

function OrderCard({ order, bill, venue, className }: {
  order: Order & { items?: import('../../types/database').OrderItem[] }
  bill: ComputedBill | null
  venue: Venue
  className?: string
}) {
  const cfg = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.new
  const stepPct = (cfg.step / TOTAL_STEPS) * 100
  const elapsed = elapsedMins(order.placed_at)
  const isLate = order.status === 'new' && elapsed >= 10

  // Primary display: first item name (most prominent)
  const firstItem = order.items?.[0]
  const extraCount = (order.items?.length ?? 1) - 1
  const displayName = firstItem
    ? extraCount > 0
      ? `${firstItem.item_name} +${extraCount} more`
      : firstItem.item_name
    : order.order_number

  // Status subtext
  const subtext = order.status === 'new'
    ? isLate ? `Order received · ${elapsed} min ago — may be slow` : 'Order received'
    : order.status === 'preparing'
    ? `About ${Math.max(2, 15 - elapsed)} min left`
    : order.status === 'ready'
    ? 'On its way to you'
    : 'Served — enjoy!'

  return (
    <div className={cn('bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden', className)}>
      {/* Progress bar — full width, color per status */}
      <div className="h-1 bg-gray-100">
        <div
          className={cn('h-full rounded-full transition-all duration-700', cfg.bar)}
          style={{ width: `${stepPct}%` }}
        />
      </div>

      <div className="px-4 py-3">
        {/* Item name (hero) + status badge + illustration */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="font-semibold text-gray-900 text-sm leading-snug flex-1">{displayName}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusIllustration
              status={order.status}
              className={cn(
                'w-7 h-7',
                order.status === 'new'       ? 'text-amber-500 opacity-80' :
                order.status === 'preparing' ? 'text-blue-500 opacity-80' :
                order.status === 'ready'     ? 'text-emerald-500 opacity-90' :
                'text-gray-400 opacity-60'
              )}
            />
            <span className={cn(
              'text-[11px] font-semibold rounded-full px-2.5 py-0.5 border',
              cfg.badge
            )}>
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Secondary row: order number · time · subtext · price */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {order.order_number} · {formatTime(order.placed_at)}
            {subtext && <span className="ml-1 text-gray-500">· {subtext}</span>}
          </p>
          <p className="text-sm font-semibold text-gray-800 shrink-0 ml-2">
            {formatCurrency(Number(order.subtotal), venue.currency)}
          </p>
        </div>

        {/* Late warning — only for orders waiting >10 min */}
        {isLate && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <Clock size={12} className="shrink-0" />
            Waiting longer than usual — we'll check on this
          </div>
        )}
      </div>
    </div>
  )
}

// ── Help modal (unchanged logic, updated icons) ───────────────

interface HelpModalProps {
  open: boolean
  onClose: () => void
  session: TableSession
  table: RestaurantTable
  venue: Venue
  orders: (Order & { items?: import('../../types/database').OrderItem[] })[]
  openHelp: HelpRequest | null
  onHelpCreated: (req: HelpRequest) => void
  onHelpCancelled: () => void
}

const PROBLEM_TYPES = [
  { value: 'wrong_item',      label: 'Wrong item brought' },
  { value: 'missing_item',    label: 'Item is missing' },
  { value: 'cold',            label: 'Food is cold' },
  { value: 'not_as_expected', label: 'Not as expected' },
  { value: 'taking_too_long', label: 'Taking too long' },
  { value: 'other',           label: 'Other' },
] as const

function HelpModal({ open, onClose, session, table, venue, orders, openHelp, onHelpCreated, onHelpCancelled }: HelpModalProps) {
  const [step, setStep] = useState<'menu' | 'order_problem' | 'sent'>('menu')
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [problemType, setProblemType] = useState<typeof PROBLEM_TYPES[number]['value']>('wrong_item')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const resetAndClose = () => { setStep('menu'); setSelectedOrderId(''); setNote(''); onClose() }

  const handleSend = async (type: HelpRequest['request_type'], opts?: {
    orderId?: string; problemType?: typeof PROBLEM_TYPES[number]['value']; note?: string
  }) => {
    setSubmitting(true)
    try {
      const req = await createHelpRequest(
        venue.id, session.id, table.id, type,
        { orderId: opts?.orderId, problemType: opts?.problemType, note: opts?.note }
      )
      onHelpCreated(req)
      setStep('sent')
    } catch { setStep('sent') }
    finally { setSubmitting(false) }
  }

  const handleCancel = async () => {
    if (!openHelp) return
    setCancelling(true)
    try { await cancelHelpRequest(openHelp.id); onHelpCancelled(); resetAndClose() }
    finally { setCancelling(false) }
  }

  if (openHelp && step !== 'sent') {
    return (
      <Modal open={open} onClose={resetAndClose} title="Your help request" size="sm">
        <div className="space-y-4">
          <div className={cn(
            'rounded-xl p-4 text-center',
            openHelp.status === 'acknowledged' ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
          )}>
            {openHelp.status === 'acknowledged' ? (
              <>
                <UserRound size={28} className="mx-auto mb-2 text-emerald-600" />
                <p className="font-semibold text-emerald-800">Waiter is on the way</p>
                <p className="text-xs text-emerald-600 mt-1">Someone is coming to help you</p>
              </>
            ) : (
              <>
                <Bell size={28} className="mx-auto mb-2 text-amber-600" />
                <p className="font-semibold text-amber-800">Request sent</p>
                <p className="text-xs text-amber-600 mt-1">Waiting for a staff member to respond</p>
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" fullWidth onClick={handleCancel} loading={cancelling}>
            <X size={14} /> Cancel request
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="How can we help?" size="sm">
      {step === 'menu' && (
        <div className="space-y-2">
          <HelpOption icon={<Bell size={22} />} label="Call a waiter" description="Someone will come to your table" onClick={() => handleSend('call_waiter')} loading={submitting} />
          <HelpOption icon={<ReceiptIcon size={22} />} label="Ask for the bill" description="We'll prepare your bill" onClick={() => handleSend('ask_for_bill')} loading={submitting} />
          <HelpOption icon={<AlertTriangle size={22} />} label="Problem with an order" description="Wrong item, cold food, missing item…" onClick={() => { setStep('order_problem'); setSelectedOrderId(orders[0]?.id ?? '') }} loading={false} />
          <HelpOption icon={<CreditCard size={22} />} label="Payment problem" description="Something went wrong with payment" onClick={() => handleSend('payment_problem')} loading={submitting} />
        </div>
      )}

      {step === 'order_problem' && (
        <div className="space-y-4">
          <button onClick={() => setStep('menu')} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">← Back</button>
          {orders.length > 1 && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Which order?</label>
              <div className="space-y-1.5">
                {orders.map(o => (
                  <button key={o.id} onClick={() => setSelectedOrderId(o.id)}
                    className={cn('w-full flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition-colors',
                      selectedOrderId === o.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700 hover:border-gray-300')}>
                    <span className="font-medium">{o.order_number}</span>
                    <span className="text-xs text-gray-400">{o.items?.length ?? 0} items</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">What's the problem?</label>
            <div className="grid grid-cols-2 gap-2">
              {PROBLEM_TYPES.map(pt => (
                <button key={pt.value} onClick={() => setProblemType(pt.value)}
                  className={cn('rounded-xl border px-3 py-2.5 text-xs font-medium text-left transition-colors',
                    problemType === pt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700 hover:border-gray-300')}>
                  {pt.label}
                </button>
              ))}
            </div>
          </div>
          <Textarea label="Details (optional)" value={note} onChange={e => setNote(e.target.value)} placeholder="Anything else we should know…" rows={2} />
          <Button fullWidth onClick={() => handleSend('order_problem', { orderId: selectedOrderId || undefined, problemType, note: note.trim() || undefined })} loading={submitting}>
            <AlertTriangle size={15} /> Report Problem
          </Button>
        </div>
      )}

      {step === 'sent' && (
        <div className="text-center py-4">
          <Bell size={40} className="mx-auto mb-3 text-brand-500" />
          <p className="font-semibold text-gray-900 mb-1">Request sent!</p>
          <p className="text-sm text-gray-500 mb-4">A staff member will be with you shortly.</p>
          <Button fullWidth onClick={resetAndClose}>Close</Button>
        </div>
      )}
    </Modal>
  )
}

function HelpOption({ icon, label, description, onClick, loading }: {
  icon: React.ReactNode; label: string; description: string; onClick: () => void; loading: boolean
}) {
  return (
    <button onClick={onClick} disabled={loading}
      className="w-full flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 text-left hover:bg-gray-50 hover:border-gray-200 transition-colors active:scale-[0.98] disabled:opacity-50">
      <span className="text-brand-500 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      {loading
        ? <div className="h-4 w-4 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin shrink-0" />
        : <ChevronRight size={16} className="text-gray-300 shrink-0" />}
    </button>
  )
}
