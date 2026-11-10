import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, CreditCard, Banknote, Smartphone, Receipt,
  CheckCircle, Clock, AlertCircle, ChevronRight, ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  computeBill, initiatePayment, releaseReservation,
  initiateMpesaStkPush, initiateStripeCheckout,
  pollMpesaPaymentStatus, getReceipt,
} from '../../lib/api'
import { getDeviceToken } from '../../lib/device'
import { formatCurrency, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { VenueLogo } from '../../components/ui/VenueLogo'
import type {
  RestaurantTable, Venue, TableSession,
  ComputedBill, BillItem,
} from '../../types/database'

type PayStep = 'select' | 'tip' | 'method' | 'mpesa_wait' | 'receipt'
type PayScope = 'all' | 'items'

interface Props {
  table: RestaurantTable
  venue: Venue
  session: TableSession
  onBack: () => void
  onDone: () => void
}

export function CheckoutView({ table, venue, session, onBack, onDone }: Props) {
  const [step, setStep] = useState<PayStep>('select')
  const [bill, setBill] = useState<ComputedBill | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState(() => crypto.randomUUID())

  // Selection
  const [scope, setScope] = useState<PayScope>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Tip
  const [tipPct, setTipPct] = useState<number | null>(null)
  const [customTip, setCustomTip] = useState('')
  const [showCustomTip, setShowCustomTip] = useState(false)

  // M-Pesa
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [mpesaPaymentId, setMpesaPaymentId] = useState<string | null>(null)
  const [mpesaPollCount, setMpesaPollCount] = useState(0)

  // Receipt
  const [receiptData, setReceiptData] = useState<Record<string, unknown> | null>(null)

  const loadBill = useCallback(async () => {
    setLoading(true)
    try {
      const b = await computeBill(session.id)
      setBill(b)
    } catch { toast.error('Failed to load bill.') }
    finally { setLoading(false) }
  }, [session.id])

  useEffect(() => { loadBill() }, [loadBill])

  // ── Computed values ───────────────────────────────────────────

  const unpaidItems = bill?.items.filter(i => i.payment_status === 'unpaid') ?? []
  const itemsToPayFor = scope === 'all'
    ? unpaidItems.map(i => i.order_item_id)
    : Array.from(selectedIds)

  const selectedSubtotal = scope === 'all'
    ? (bill?.outstanding ?? 0)
    : unpaidItems
        .filter(i => selectedIds.has(i.order_item_id))
        .reduce((s, i) => s + i.line_total, 0)

  const tipAmount = showCustomTip
    ? parseFloat(customTip) || 0
    : tipPct != null ? Math.round(selectedSubtotal * tipPct / 100 * 100) / 100 : 0

  const estimatedTotal = selectedSubtotal + tipAmount

  // ── Step-skip helpers ─────────────────────────────────────────
  const skipTip = !venue.tip_enabled
  const availableMethods = [
    venue.mpesa_shortcode ? 'mpesa' : null,
    venue.allow_card ? 'card' : null,
    venue.allow_cash ? 'cash' : null,
  ].filter(Boolean) as ('mpesa' | 'card' | 'cash')[]
  const singleMethod = availableMethods.length === 1 ? availableMethods[0] : null

  // ── Handlers ──────────────────────────────────────────────────

  const handleProceedToTip = () => {
    if (scope === 'items' && selectedIds.size === 0) {
      toast.error('Select at least one item to pay for.')
      return
    }
    if (skipTip) {
      // Skip tip screen
      if (singleMethod) {
        handlePay(singleMethod)
      } else {
        setStep('method')
      }
    } else {
      setStep('tip')
    }
  }

  const handleProceedToMethod = () => {
    if (singleMethod) {
      // Only one method available — trigger it directly, skip the method screen
      handlePay(singleMethod)
    } else {
      setStep('method')
    }
  }

  const handlePay = async (method: 'mpesa' | 'card' | 'cash') => {
    setPaying(true)
    try {
      const result = await initiatePayment(
        session.id, method,
        scope === 'items' ? itemsToPayFor : null,
        tipAmount, scope === 'items' ? 'items' : 'full', null,
        paymentIdempotencyKey,
      )
      if (!result.success) {
        toast.error(result.message ?? 'Payment failed.')
        setPaymentIdempotencyKey(crypto.randomUUID())
        return
      }

      if (method === 'mpesa') {
        if (!mpesaPhone.match(/^(?:254|\+254|0)\d{9}$/)) {
          toast.error('Enter a valid M-Pesa phone number.')
          setPaying(false)
          return
        }
        const normalised = mpesaPhone.replace(/^(?:\+254|0)/, '254')
        await initiateMpesaStkPush(result.payment_id!, normalised, result.total!, result.mpesa_shortcode ?? '')
        setMpesaPaymentId(result.payment_id!)
        setStep('mpesa_wait')
      } else if (method === 'card') {
        const url = await initiateStripeCheckout(result.payment_id!, result.total!)
        window.location.href = url
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Payment initiation failed.')
    } finally {
      setPaying(false)
    }
  }

  // ── M-Pesa polling ────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'mpesa_wait' || !mpesaPaymentId) return
    const POLL_INTERVAL = 4000
    const MAX_POLLS = 30 // 2 min timeout

    const poll = async () => {
      const payment = await pollMpesaPaymentStatus(mpesaPaymentId)
      if (!payment) return
      if (payment.state === 'succeeded') {
        const receipt = await getReceipt(mpesaPaymentId)
        setReceiptData(receipt?.data ?? null)
        setStep('receipt')
      } else if (['failed', 'cancelled'].includes(payment.state)) {
        await releaseReservation(session.id, null)
        toast.error('Payment failed or was cancelled. Please try again.')
        setStep('method')
        setMpesaPaymentId(null)
        setMpesaPollCount(0)
        setPaymentIdempotencyKey(crypto.randomUUID())
        loadBill()
      } else {
        setMpesaPollCount(n => n + 1)
      }
    }

    if (mpesaPollCount >= MAX_POLLS) {
      releaseReservation(session.id, null)
      toast.error('Payment confirmation timed out. If money was deducted, it will be reconciled automatically.')
      setStep('method')
      setMpesaPaymentId(null)
      setMpesaPollCount(0)
      loadBill()
      return
    }

    const id = setTimeout(poll, POLL_INTERVAL)
    return () => clearTimeout(id)
  }, [step, mpesaPaymentId, mpesaPollCount, session.id, loadBill])

  // ── Render ────────────────────────────────────────────────────

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>
  if (!bill) return null

  return (
    <div className="flex flex-col min-h-screen bg-warm">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          {step !== 'receipt' && (
            <button
              onClick={async () => {
                if (step === 'select') { await releaseReservation(session.id, null); onBack() }
                else if (step === 'tip') setStep('select')
                else if (step === 'method') setStep(skipTip ? 'select' : 'tip')
                else if (step === 'mpesa_wait') { await releaseReservation(session.id, null); setStep(singleMethod ? 'select' : 'method'); setMpesaPaymentId(null) }
              }}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <VenueLogo
            venue={venue}
            imgClass="h-7 w-auto max-w-[5rem] object-contain"
            wrapClass="flex h-7 w-16 items-center justify-center shrink-0"
          />
          <h1 className="font-bold text-gray-900">
            {step === 'select' ? 'Pay Bill' :
             step === 'tip' ? 'Add a Tip' :
             step === 'method' ? 'Payment Method' :
             step === 'mpesa_wait' ? 'Confirm on Phone' : 'Receipt'}
          </h1>
          <span className="ml-auto text-xs text-gray-400">Table {table.table_number}</span>
        </div>
        {/* Progress dots — only show steps that are actually in play */}
        <div className="flex gap-1.5 justify-center pb-2">
          {(['select', ...(skipTip ? [] : ['tip']), ...(singleMethod ? [] : ['method'])] as PayStep[]).map((s) => (
            <div key={s} className={cn('h-1.5 rounded-full transition-all',
              step === s ? 'w-6 bg-brand-500' : 'w-3 bg-gray-200'
            )} />
          ))}
        </div>
      </header>

      {/* ── STEP: SELECT ITEMS ─────────────────────────────────── */}
      {step === 'select' && (
        <div className="flex-1 px-4 py-4 pb-36">
          {bill.outstanding <= 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle size={48} className="text-emerald-500 mb-3" />
              <p className="font-semibold text-gray-900">Bill is fully paid!</p>
              <Button className="mt-4" onClick={onDone}>Done</Button>
            </div>
          ) : (
            <>
              {/* Scope selector */}
              <div className="flex gap-2 mb-4">
                {[{id:'all',label:'Pay all'},{id:'items',label:'Select items'}].map(opt => (
                  <button key={opt.id} onClick={() => setScope(opt.id as PayScope)}
                    className={cn('flex-1 py-2 rounded-xl text-sm font-medium border transition-colors',
                      scope === opt.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'
                    )}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Bill summary */}
              <BillSummaryCard bill={bill} currency={venue.currency}
                selectable={scope === 'items'}
                selectedIds={selectedIds}
                onToggle={(id) => setSelectedIds(prev => {
                  const next = new Set(prev)
                  next.has(id) ? next.delete(id) : next.add(id)
                  return next
                })}
              />

              {/* Totals */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 mt-3">
                {bill.tax_amount > 0 && (
                  <Row label={`Tax (${(bill.tax_rate * 100).toFixed(0)}%)`} value={formatCurrency(bill.tax_amount, venue.currency)} />
                )}
                {bill.service_charge_amount > 0 && (
                  <Row label={`Service (${(bill.service_charge_rate * 100).toFixed(0)}%)`} value={formatCurrency(bill.service_charge_amount, venue.currency)} />
                )}
                {bill.paid > 0 && <Row label="Already paid" value={`-${formatCurrency(bill.paid, venue.currency)}`} green />}
                <Row label="You're paying" value={formatCurrency(scope === 'all' ? bill.outstanding : selectedSubtotal, venue.currency)} bold />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP: TIP ─────────────────────────────────────────── */}
      {step === 'tip' && (
        <div className="flex-1 px-4 py-4 pb-36">
          <p className="text-sm text-gray-500 mb-4 text-center">Your bill: <strong>{formatCurrency(selectedSubtotal, venue.currency)}</strong></p>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {venue.tip_presets.map(pct => (
              <button key={pct} onClick={() => { setTipPct(pct); setShowCustomTip(false) }}
                className={cn('rounded-xl border py-4 text-center transition-colors',
                  tipPct === pct && !showCustomTip ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700'
                )}>
                <p className="text-xl font-bold">{pct}%</p>
                <p className="text-xs text-gray-400">{formatCurrency(selectedSubtotal * pct / 100, venue.currency)}</p>
              </button>
            ))}
            <button onClick={() => { setShowCustomTip(true); setTipPct(null) }}
              className={cn('rounded-xl border py-4 text-center transition-colors',
                showCustomTip ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700'
              )}>
              <p className="text-sm font-bold">Custom</p>
            </button>
            <button onClick={() => { setTipPct(null); setShowCustomTip(false) }}
              className={cn('rounded-xl border py-4 text-center transition-colors',
                tipPct === null && !showCustomTip ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700'
              )}>
              <p className="text-sm font-bold">No tip</p>
            </button>
          </div>

          {showCustomTip && (
            <Input label="Custom tip amount" type="number" min="0" step="0.01"
              value={customTip} onChange={e => setCustomTip(e.target.value)}
              placeholder="0.00" className="mb-4"
            />
          )}

          <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3">
            <Row label="Subtotal" value={formatCurrency(selectedSubtotal, venue.currency)} />
            <Row label="Tip" value={formatCurrency(tipAmount, venue.currency)} />
            <Row label="Total" value={formatCurrency(estimatedTotal, venue.currency)} bold />
          </div>
        </div>
      )}

      {/* ── STEP: METHOD ──────────────────────────────────────── */}
      {step === 'method' && (
        <div className="flex-1 px-4 py-4 pb-10">
          <div className="rounded-2xl bg-brand-50 border border-brand-100 px-4 py-3 text-center mb-6">
            <p className="text-xs text-brand-600 mb-0.5">Total to pay</p>
            <p className="text-3xl font-bold text-brand-700">{formatCurrency(estimatedTotal, venue.currency)}</p>
            {tipAmount > 0 && <p className="text-xs text-brand-500 mt-0.5">incl. {formatCurrency(tipAmount, venue.currency)} tip</p>}
          </div>

          <div className="flex flex-col gap-3">
            {venue.mpesa_shortcode && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => setStep('method')}
                  className="w-full flex items-center gap-3 px-4 py-3">
                  <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <Smartphone size={20} className="text-green-600" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-900 text-sm">M-Pesa</p>
                    <p className="text-xs text-gray-400">STK push to your phone</p>
                  </div>
                </button>
                <div className="px-4 pb-3">
                  <Input
                    placeholder="07XX XXX XXX or 254XXX..."
                    type="tel"
                    value={mpesaPhone}
                    onChange={e => setMpesaPhone(e.target.value)}
                    className="mb-2"
                  />
                  <Button fullWidth onClick={() => handlePay('mpesa')} loading={paying}
                    className="bg-green-600 hover:bg-green-700">
                    Pay with M-Pesa
                  </Button>
                </div>
              </div>
            )}

            {venue.allow_card && (
              <button onClick={() => handlePay('card')} disabled={paying}
                className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 hover:bg-gray-50 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <CreditCard size={20} className="text-blue-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-gray-900 text-sm">Pay by Card</p>
                  <p className="text-xs text-gray-400">Secure hosted checkout</p>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
              </button>
            )}

            {venue.allow_cash && (
              <div className="rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote size={16} className="text-gray-500" />
                  <p className="text-sm font-medium text-gray-600">Cash</p>
                </div>
                <p className="text-xs text-gray-400">Let your waiter know you'd like to pay cash. They'll record it on their end.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEP: MPESA WAITING ───────────────────────────────── */}
      {step === 'mpesa_wait' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-xs w-full shadow-sm border border-gray-100 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Smartphone size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Check your phone</h2>
            <p className="text-sm text-gray-500 mb-6">
              An M-Pesa prompt has been sent to <strong>{mpesaPhone}</strong>.<br />
              Enter your PIN to confirm.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mb-6">
              <Spinner size="sm" />
              <span>Waiting for confirmation…</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              {mpesaPollCount > 10 ? `Still waiting… (${Math.floor(mpesaPollCount * 4 / 60)}m elapsed)` : `Checking every few seconds…`}
            </p>
            <Button variant="ghost" size="sm" onClick={() => {
              releaseReservation(session.id, null)
              setStep('method')
              setMpesaPaymentId(null)
              setMpesaPollCount(0)
            }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP: RECEIPT ─────────────────────────────────────── */}
      {step === 'receipt' && (
        <div className="flex-1 px-4 py-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center mb-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle size={36} className="text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Payment confirmed!</h2>
            {!!receiptData?.receipt_number && (
              <p className="text-xs text-gray-400 mb-4">Receipt {String(receiptData.receipt_number)}</p>
            )}
            {receiptData && (
              <div className="text-left mt-4 border-t border-gray-100 pt-4 space-y-1.5">
                <Row label="Subtotal" value={formatCurrency(Number(receiptData.subtotal), venue.currency)} />
                {Number(receiptData.tax_amount) > 0 && <Row label="Tax" value={formatCurrency(Number(receiptData.tax_amount), venue.currency)} />}
                {Number(receiptData.svc) > 0 && <Row label="Service" value={formatCurrency(Number(receiptData.svc), venue.currency)} />}
                {Number(receiptData.tip_amount) > 0 && <Row label="Tip" value={formatCurrency(Number(receiptData.tip_amount), venue.currency)} />}
                <Row label="Total paid" value={formatCurrency(Number(receiptData.total), venue.currency)} bold />
              </div>
            )}
          </div>
          <Button fullWidth size="lg" onClick={onDone}>
            <Receipt size={18} /> Done
          </Button>
        </div>
      )}

      {/* ── Bottom CTA ─────────────────────────────────────────── */}
      {(step === 'select' || step === 'tip') && bill.outstanding > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur border-t border-gray-100 p-4">
          <Button fullWidth size="lg" onClick={step === 'select' ? handleProceedToTip : handleProceedToMethod}>
            Continue · {formatCurrency(estimatedTotal || selectedSubtotal, venue.currency)}
            <ChevronRight size={18} />
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function Row({ label, value, bold, green }: { label: string; value: string; bold?: boolean; green?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={cn('text-sm', bold ? 'font-bold text-gray-900' : green ? 'text-emerald-600' : 'text-gray-500')}>{label}</span>
      <span className={cn('text-sm', bold ? 'font-bold text-gray-900' : green ? 'text-emerald-600' : 'text-gray-700')}>{value}</span>
    </div>
  )
}

function BillSummaryCard({
  bill, currency, selectable, selectedIds, onToggle,
}: {
  bill: ComputedBill
  currency: string
  selectable: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const byOrder = bill.items.reduce((acc, item) => {
    const key = item.order_number
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<string, BillItem[]>)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {Object.entries(byOrder).map(([orderNum, items]) => (
        <div key={orderNum} className="border-b border-gray-50 last:border-b-0">
          <button
            onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(orderNum) ? n.delete(orderNum) : n.add(orderNum); return n })}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
          >
            <span>{orderNum}</span>
            <ChevronDown size={14} className={cn('transition-transform', expanded.has(orderNum) ? 'rotate-180' : '')} />
          </button>
          {expanded.has(orderNum) && items.map(item => (
            <div key={item.order_item_id}
              onClick={() => selectable && item.payment_status === 'unpaid' && onToggle(item.order_item_id)}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 border-t border-gray-50',
                selectable && item.payment_status === 'unpaid' && 'cursor-pointer hover:bg-gray-50',
                item.payment_status === 'paid' && 'opacity-50',
                item.payment_status === 'voided' && 'opacity-30 line-through',
              )}
            >
              {selectable && item.payment_status === 'unpaid' && (
                <div className={cn('h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                  selectedIds.has(item.order_item_id) ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                )}>
                  {selectedIds.has(item.order_item_id) && <div className="h-2.5 w-2.5 rounded-sm bg-white" />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{item.quantity}× {item.item_name}</p>
                {item.notes && <p className="text-xs text-gray-400 italic">{item.notes}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-gray-900">{formatCurrency(item.line_total, currency)}</p>
                <ItemStatusPill status={item.payment_status} />
              </div>
            </div>
          ))}
        </div>
      ))}
      {bill.items.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No items yet.</p>
      )}
    </div>
  )
}

function ItemStatusPill({ status }: { status: string }) {
  if (status === 'paid') return <span className="text-[10px] text-emerald-600 font-medium">Paid</span>
  if (status === 'reserved') return <span className="text-[10px] text-yellow-600 font-medium">Reserved</span>
  if (status === 'voided') return <span className="text-[10px] text-red-500 font-medium">Voided</span>
  if (status === 'comped') return <span className="text-[10px] text-purple-600 font-medium">Comped</span>
  return null
}
