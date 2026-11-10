import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, Trash2, Gift, CheckCircle, MoreVertical,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  computeBill, staffRecordCash, staffVoidItem, staffCompItem, staffCloseSessionOverride,
} from '../../lib/api'
import { getSupabase } from '../../lib/supabase'
import { useTableRealtime } from '../../hooks/useRealtime'
import { formatCurrency, formatTime, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Spinner } from '../../components/ui/Spinner'
import type {
  ComputedBill, BillItem, VoidReason, CompReason, OverrideReason, Staff,
} from '../../types/database'

interface Props {
  sessionId: string
  tableNumber: string
  venueId: string
  staffId: string
  currency: string
  onClose: () => void
}

const VOID_REASONS: { value: VoidReason; label: string }[] = [
  { value: 'wrong_item',            label: 'Wrong item sent' },
  { value: 'customer_changed_mind', label: 'Customer changed mind' },
  { value: 'kitchen_error',         label: 'Kitchen error' },
  { value: 'other',                 label: 'Other' },
]
const COMP_REASONS: { value: CompReason; label: string }[] = [
  { value: 'complaint',        label: 'Customer complaint' },
  { value: 'service_issue',    label: 'Service issue' },
  { value: 'manager_goodwill', label: 'Manager goodwill' },
  { value: 'other',            label: 'Other' },
]
const OVERRIDE_REASONS: { value: OverrideReason; label: string }[] = [
  { value: 'cash_received', label: 'Cash received outside system' },
  { value: 'comped',        label: 'Comped (no charge)' },
  { value: 'dispute',       label: 'Dispute / walkout' },
  { value: 'other',         label: 'Other' },
]

// Status dot color
const STATUS_DOT: Record<string, string> = {
  new:       'bg-amber-400',
  preparing: 'bg-blue-500',
  ready:     'bg-emerald-500',
  served:    'bg-gray-400',
}
const STATUS_LABEL: Record<string, string> = {
  new: 'New', preparing: 'Preparing', ready: 'Ready', served: 'Served',
}

const INITIAL_VISIBLE = 4

export function BillView({ sessionId, tableNumber, venueId, staffId, currency, onClose }: Props) {
  const [bill, setBill] = useState<ComputedBill | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'outstanding' | 'paid'>('outstanding')
  const [showAll, setShowAll] = useState(false)

  // Item action popover
  const [actionItem, setActionItem] = useState<BillItem | null>(null)

  // Cash modal
  const [cashModal, setCashModal] = useState(false)
  const [cashReceived, setCashReceived] = useState('')
  const [cashTip, setCashTip] = useState('')
  const [recordingCash, setRecordingCash] = useState(false)
  const [cashIdempotencyKey, setCashIdempotencyKey] = useState(() => crypto.randomUUID())

  // Void modal
  const [voidModal, setVoidModal] = useState<BillItem | null>(null)
  const [voidReason, setVoidReason] = useState<VoidReason>('wrong_item')
  const [voidNote, setVoidNote] = useState('')
  const [voiding, setVoiding] = useState(false)

  // Comp modal
  const [compModal, setCompModal] = useState<BillItem | null>(null)
  const [compReason, setCompReason] = useState<CompReason>('complaint')
  const [compNote, setCompNote] = useState('')
  const [comping, setComping] = useState(false)

  // Override modal
  const [overrideModal, setOverrideModal] = useState(false)
  const [overrideReason, setOverrideReason] = useState<OverrideReason>('cash_received')
  const [overrideNote, setOverrideNote] = useState('')
  const [overriding, setOverriding] = useState(false)
  const [needsManager, setNeedsManager] = useState(false)
  const [managers, setManagers] = useState<Staff[]>([])
  const [selectedManager, setSelectedManager] = useState('')

  const loadBill = useCallback(async () => {
    try {
      const b = await computeBill(sessionId)
      setBill(b)
    } catch { toast.error('Failed to load bill.') }
    finally { setLoading(false) }
  }, [sessionId])

  useEffect(() => { loadBill() }, [loadBill])
  useTableRealtime('order_items', 'session_id', sessionId, () => loadBill())

  useEffect(() => {
    getSupabase().from('staff')
      .select('id, name, role').eq('venue_id', venueId)
      .in('role', ['owner', 'admin', 'manager']).eq('active', true)
      .then(({ data }) => setManagers((data ?? []) as Staff[]))
  }, [venueId])

  // ── Handlers ─────────────────────────────────────────────────

  const handleCashPayment = async () => {
    const cash = parseFloat(cashReceived)
    if (!bill || isNaN(cash) || cash < 0) { toast.error('Enter a valid cash amount.'); return }
    if (cash < bill.outstanding) { toast.error(`${formatCurrency(bill.outstanding - cash, currency)} short.`); return }
    setRecordingCash(true)
    try {
      const result = await staffRecordCash(sessionId, staffId, null, cash, parseFloat(cashTip) || 0, cashIdempotencyKey)
      if (!result.success) { toast.error(result.message ?? 'Failed.'); return }
      toast.success(`Cash recorded. Change: ${formatCurrency(result.change_due ?? 0, currency)}`)
      setCashModal(false); setCashReceived(''); setCashTip('')
      setCashIdempotencyKey(crypto.randomUUID())
      loadBill()
      if (bill.is_settled) onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to record cash.')
    } finally { setRecordingCash(false) }
  }

  const handleVoid = async () => {
    if (!voidModal) return
    setVoiding(true)
    try {
      const result = await staffVoidItem(voidModal.order_item_id, staffId, voidReason, voidNote)
      if (!result.success) { toast.error(result.message ?? 'Failed.'); return }
      toast.success(`"${voidModal.item_name}" voided.`)
      setVoidModal(null); setVoidNote(''); loadBill()
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed.') }
    finally { setVoiding(false) }
  }

  const handleComp = async () => {
    if (!compModal) return
    setComping(true)
    try {
      const result = await staffCompItem(compModal.order_item_id, staffId, compReason, compNote)
      if (!result.success) { toast.error(result.message ?? 'Failed.'); return }
      toast.success(`"${compModal.item_name}" comped.`)
      setCompModal(null); setCompNote(''); loadBill()
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed.') }
    finally { setComping(false) }
  }

  const handleOverrideClose = async () => {
    setOverriding(true)
    try {
      const result = await staffCloseSessionOverride(
        sessionId, staffId, overrideReason, overrideNote,
        needsManager ? selectedManager || null : null
      )
      if (result.requires_approval && !needsManager) { setNeedsManager(true); setOverriding(false); return }
      if (!result.success) { toast.error(result.message ?? 'Failed.'); setOverriding(false); return }
      toast.success(`Table ${tableNumber} closed.${result.outstanding_written_off ? ` ${formatCurrency(result.outstanding_written_off, currency)} written off.` : ''}`)
      setOverrideModal(false); onClose()
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed.') }
    finally { setOverriding(false) }
  }

  // ── Render ────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-3 animate-pulse py-2">
      <div className="h-20 bg-gray-100 rounded-2xl w-full" />
      <div className="h-10 bg-gray-100 rounded-xl w-full" />
      <div className="h-14 bg-gray-100 rounded-xl w-full" />
      <div className="h-14 bg-gray-100 rounded-xl w-full" />
      <div className="h-14 bg-gray-100 rounded-xl w-full" />
    </div>
  )
  if (!bill) return null

  // Unique orders (by order_number) with their items
  const orderMap = new Map<string, { orderNumber: string; orderStatus: string; orderTime: string; items: BillItem[] }>()
  for (const item of bill.items) {
    if (!orderMap.has(item.order_number)) {
      orderMap.set(item.order_number, {
        orderNumber: item.order_number,
        orderStatus: (item as BillItem & { order_status?: string }).order_status ?? 'new',
        orderTime: (item as BillItem & { placed_at?: string }).placed_at ?? '',
        items: [],
      })
    }
    orderMap.get(item.order_number)!.items.push(item)
  }

  const unpaidItems  = bill.items.filter(i => ['unpaid', 'reserved'].includes(i.payment_status))
  const paidItems    = bill.items.filter(i => ['paid', 'voided', 'comped'].includes(i.payment_status))
  const orderCount   = orderMap.size
  const unpaidCount  = unpaidItems.length

  // Flat item rows for the active tab
  const tabItems = activeTab === 'outstanding' ? unpaidItems : paidItems
  const visibleItems = showAll ? tabItems : tabItems.slice(0, INITIAL_VISIBLE)
  const hiddenCount  = tabItems.length - INITIAL_VISIBLE

  const cashReceiedNum = parseFloat(cashReceived) || 0
  const changeDue = Math.max(0, cashReceiedNum - (bill.outstanding + (parseFloat(cashTip) || 0)))

  return (
    <div className="pb-2">

      {/* ── Settled banner ── */}
      {bill.is_settled && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 mb-4">
          <CheckCircle size={18} className="text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-800">Bill fully paid.</p>
          <button onClick={onClose} className="ml-auto text-xs text-emerald-600 font-medium">Close table</button>
        </div>
      )}

      {/* ── Summary card ── */}
      <div className="flex items-center justify-between bg-[#fdf6ee] border border-[#f0e4d0] rounded-2xl px-4 py-3.5 mb-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {orderCount} {orderCount === 1 ? 'order' : 'orders'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {unpaidCount} {unpaidCount === 1 ? 'item' : 'items'} outstanding
          </p>
        </div>
        <p className="text-2xl font-bold text-gray-900">
          {formatCurrency(bill.outstanding, currency)}
        </p>
      </div>

      {/* ── Outstanding / Paid tab toggle ── */}
      <div className="flex bg-gray-100 rounded-xl p-0.5 mb-4">
        <button
          onClick={() => { setActiveTab('outstanding'); setShowAll(false) }}
          className={cn(
            'flex-1 text-sm font-medium py-2 rounded-[10px] transition-colors',
            activeTab === 'outstanding' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          )}
        >
          Outstanding · {unpaidItems.length}
        </button>
        <button
          onClick={() => { setActiveTab('paid'); setShowAll(false) }}
          className={cn(
            'flex-1 text-sm font-medium py-2 rounded-[10px] transition-colors',
            activeTab === 'paid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          )}
        >
          Paid · {paidItems.length}
        </button>
      </div>

      {/* ── Flat item list ── */}
      {tabItems.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {activeTab === 'outstanding' ? 'No outstanding items.' : 'No paid items yet.'}
        </p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-3">
          {visibleItems.map((item, idx) => {
            const status = (item as BillItem & { order_status?: string }).order_status ?? 'new'
            const placedAt = (item as BillItem & { placed_at?: string }).placed_at ?? ''
            const canAdjust = ['unpaid', 'reserved'].includes(item.payment_status)
            return (
              <div
                key={item.order_item_id}
                className={cn(
                  'flex items-start gap-3 px-4 py-3',
                  idx < visibleItems.length - 1 && 'border-b border-gray-50'
                )}
              >
                {/* Select circle (visual only for now) */}
                <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-gray-200 shrink-0" />

                {/* Item info */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm text-gray-900 leading-snug',
                    item.payment_status === 'voided' && 'line-through text-gray-400'
                  )}>
                    {item.quantity}× {item.item_name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[status] ?? 'bg-gray-300')} />
                    <p className="text-[11px] text-gray-400">
                      {item.order_number}
                      {placedAt ? ` · ${formatTime(placedAt)}` : ''}
                      {' · '}{STATUS_LABEL[status] ?? status}
                    </p>
                  </div>
                  {item.notes && <p className="text-[11px] text-gray-400 italic mt-0.5">"{item.notes}"</p>}
                </div>

                {/* Price */}
                <p className={cn(
                  'text-sm font-medium shrink-0',
                  item.payment_status === 'voided' || item.payment_status === 'comped'
                    ? 'text-gray-400 line-through'
                    : 'text-gray-900'
                )}>
                  {formatCurrency(item.line_total, currency)}
                </p>

                {/* Three-dot action menu */}
                {canAdjust && (
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setActionItem(actionItem?.order_item_id === item.order_item_id ? null : item)}
                      className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical size={15} />
                    </button>
                    {actionItem?.order_item_id === item.order_item_id && (
                      <div className="absolute right-0 top-7 z-10 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[130px]">
                        <button
                          onClick={() => { setVoidModal(item); setVoidReason('wrong_item'); setActionItem(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={13} /> Void
                        </button>
                        <button
                          onClick={() => { setCompModal(item); setCompReason('complaint'); setActionItem(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-purple-600 hover:bg-purple-50 transition-colors"
                        >
                          <Gift size={13} /> Comp
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Show more / less */}
          {tabItems.length > INITIAL_VISIBLE && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="w-full py-3 text-sm font-semibold text-brand-600 hover:text-brand-700 border-t border-gray-50 transition-colors"
            >
              {showAll ? 'Show less' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'order' : 'orders'}`}
            </button>
          )}
        </div>
      )}

      {/* ── Totals (compact) ── */}
      {!bill.is_settled && bill.outstanding > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 mb-4 space-y-1">
          {bill.tax_amount > 0 && <TRow label={`Tax (${(bill.tax_rate * 100).toFixed(0)}%)`} value={formatCurrency(bill.tax_amount, currency)} />}
          {bill.service_charge_amount > 0 && <TRow label="Service charge" value={formatCurrency(bill.service_charge_amount, currency)} />}
          {bill.voided > 0 && <TRow label="Voided" value={`−${formatCurrency(bill.voided, currency)}`} muted />}
          {bill.comped > 0 && <TRow label="Comped" value={`−${formatCurrency(bill.comped, currency)}`} muted />}
          {bill.paid > 0 && <TRow label="Already paid" value={`−${formatCurrency(bill.paid, currency)}`} green />}
        </div>
      )}

      {/* ── Record cash CTA ── */}
      {!bill.is_settled && bill.outstanding > 0 && (
        <div className="mt-2">
          <button
            onClick={() => { setCashModal(true); setCashReceived(''); setCashTip(''); setCashIdempotencyKey(crypto.randomUUID()) }}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white text-sm font-semibold rounded-2xl py-4 transition-all shadow-md shadow-brand-500/20"
          >
            Record cash payment · {formatCurrency(bill.outstanding, currency)}
          </button>
          <p className="text-xs text-center text-gray-400 mt-2">Select items to pay for part of the bill</p>
        </div>
      )}

      {/* ── Force close ── */}
      {!bill.is_settled && (
        <button
          onClick={() => { setOverrideModal(true); setNeedsManager(false); setOverrideNote('') }}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition-colors py-2.5 mt-3"
        >
          <AlertTriangle size={14} />
          Force close — writes off {formatCurrency(bill.outstanding, currency)} outstanding
        </button>
      )}

      {/* ── Cash modal ── */}
      <Modal open={cashModal} onClose={() => setCashModal(false)} title="Record Cash Payment" size="sm">
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-center">
            <p className="text-xs text-gray-500">Outstanding</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(bill.outstanding, currency)}</p>
          </div>
          <div>
            <Input label="Cash received" type="number" min="0" step="0.01"
              value={cashReceived} onChange={e => setCashReceived(e.target.value)} placeholder="0.00" autoFocus />
            {cashReceived !== '' && (() => {
              const amt = parseFloat(cashReceived)
              if (isNaN(amt) || amt <= 0) return <p className="text-xs text-red-500 mt-1">Enter a valid amount.</p>
              if (amt < bill.outstanding) return <p className="text-xs text-red-500 mt-1">{formatCurrency(bill.outstanding - amt, currency)} short.</p>
              return <p className="text-xs text-emerald-600 mt-1"><CheckCircle size={13} className="inline mr-1" />Amount covers the balance.</p>
            })()}
          </div>
          <Input label="Tip (optional)" type="number" min="0" step="0.01"
            value={cashTip} onChange={e => setCashTip(e.target.value)} placeholder="0.00" />
          {cashReceiedNum > 0 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2">
              <p className="text-sm text-emerald-800 font-medium">Change due: {formatCurrency(changeDue, currency)}</p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setCashModal(false)}>Cancel</Button>
            <Button onClick={handleCashPayment} loading={recordingCash}
              disabled={!cashReceived || parseFloat(cashReceived) < bill.outstanding}>
              Confirm Payment
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Void modal ── */}
      <Modal open={!!voidModal} onClose={() => setVoidModal(null)} title="Void Item" size="sm">
        {voidModal && (
          <div className="space-y-4">
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <p className="text-sm font-medium text-red-800">{voidModal.quantity}× {voidModal.item_name}</p>
              <p className="text-sm text-red-600">{formatCurrency(voidModal.line_total, currency)}</p>
            </div>
            <Select label="Reason *" value={voidReason} onChange={e => setVoidReason(e.target.value as VoidReason)} options={VOID_REASONS} />
            <Input label="Note (optional)" value={voidNote} onChange={e => setVoidNote(e.target.value)} placeholder="Add details…" />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setVoidModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleVoid} loading={voiding}>Void Item</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Comp modal ── */}
      <Modal open={!!compModal} onClose={() => setCompModal(null)} title="Comp Item" size="sm">
        {compModal && (
          <div className="space-y-4">
            <div className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-3">
              <p className="text-sm font-medium text-purple-800">{compModal.quantity}× {compModal.item_name}</p>
              <p className="text-xs text-purple-600">{formatCurrency(compModal.line_total, currency)} will be comped</p>
            </div>
            <Select label="Reason *" value={compReason} onChange={e => setCompReason(e.target.value as CompReason)} options={COMP_REASONS} />
            <Input label="Note (optional)" value={compNote} onChange={e => setCompNote(e.target.value)} placeholder="Add details…" />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setCompModal(null)}>Cancel</Button>
              <Button onClick={handleComp} loading={comping}>Comp Item</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Override close modal ── */}
      <Modal open={overrideModal} onClose={() => setOverrideModal(false)} title="Close with Outstanding Balance" size="sm">
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <p className="text-sm font-medium text-amber-800">Outstanding: {formatCurrency(bill.outstanding, currency)}</p>
            </div>
            <p className="text-xs text-amber-600">This will close the table and write off any unpaid balance.</p>
          </div>
          <Select label="Reason *" value={overrideReason} onChange={e => setOverrideReason(e.target.value as OverrideReason)} options={OVERRIDE_REASONS} />
          <Input label="Note" value={overrideNote} onChange={e => setOverrideNote(e.target.value)} placeholder="Add details…" />
          {needsManager && (
            <>
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                <p className="text-xs text-blue-700 font-medium">Manager approval required</p>
              </div>
              <Select label="Approving manager" value={selectedManager}
                onChange={e => setSelectedManager(e.target.value)}
                options={[{ value: '', label: 'Select manager…' }, ...managers.map(m => ({ value: m.id, label: m.name }))]}
              />
            </>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setOverrideModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleOverrideClose} loading={overriding}
              disabled={needsManager && !selectedManager}>
              Close Table
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────

function TRow({ label, value, bold, green, muted }: {
  label: string; value: string; bold?: boolean; green?: boolean; muted?: boolean
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={cn(muted ? 'text-gray-400' : 'text-gray-500')}>{label}</span>
      <span className={cn(bold ? 'font-bold text-gray-900' : green ? 'text-emerald-600' : muted ? 'text-gray-400' : 'text-gray-700')}>{value}</span>
    </div>
  )
}
