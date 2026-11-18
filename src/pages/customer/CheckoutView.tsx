import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, CreditCard, Banknote, Smartphone,
  CheckCircle, ChevronRight, ChevronDown, ChevronLeft,
  Plus, Minus, Send,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  computeBill, initiatePayment, releaseReservation,
  initiateMpesaStkPush, initiateStripeCheckout,
  pollMpesaPaymentStatus, getReceipt,
} from '../../lib/api'
import { formatCurrency, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { VenueLogo } from '../../components/ui/VenueLogo'
import type {
  RestaurantTable, Venue, TableSession,
  ComputedBill, BillItem,
} from '../../types/database'

// ── ALL LOGIC PRESERVED ───────────────────────────────────────
// Props, state, handlers, polling — identical to previous version.

type PayStep = 'select' | 'tip' | 'method' | 'mpesa_wait' | 'receipt'
type PayScope = 'all' | 'items'

interface Props {
  table: RestaurantTable
  venue: Venue
  session: TableSession
  onBack: () => void
  onDone: () => void
}

// ── Design tokens ─────────────────────────────────────────────
const C = {
  orange: '#E8590C',
  orangeLight: '#FFF1EB',
  orangeBorder: '#FDDBC8',
  ink: '#1C1917',
  muted: '#78716C',
  accentRed: '#C2410C',
  border: '#F0E5D8',
  tile: '#FBF0E8',
  bg: '#FFFAF5',
  white: '#ffffff',
}

export function CheckoutView({ table, venue, session, onBack, onDone }: Props) {
  const [step, setStep] = useState<PayStep>('select')
  const [bill, setBill] = useState<ComputedBill | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState(() => crypto.randomUUID())

  const [scope, setScope] = useState<PayScope>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [tipPct, setTipPct] = useState<number | null>(null)
  const [customTip, setCustomTip] = useState('')
  const [showCustomTip, setShowCustomTip] = useState(false)

  const [mpesaPhone, setMpesaPhone] = useState('')
  const [mpesaPaymentId, setMpesaPaymentId] = useState<string | null>(null)
  const [mpesaPollCount, setMpesaPollCount] = useState(0)

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

  const unpaidItems = bill?.items.filter(i => i.payment_status === 'unpaid') ?? []
  const itemsToPayFor = scope === 'all'
    ? unpaidItems.map(i => i.order_item_id)
    : Array.from(selectedIds)

  const selectedSubtotal = scope === 'all'
    ? (bill?.outstanding ?? 0)
    : unpaidItems.filter(i => selectedIds.has(i.order_item_id)).reduce((s, i) => s + i.line_total, 0)

  const tipAmount = showCustomTip
    ? parseFloat(customTip) || 0
    : tipPct != null ? Math.round(selectedSubtotal * tipPct / 100 * 100) / 100 : 0

  const estimatedTotal = selectedSubtotal + tipAmount

  const skipTip = !venue.tip_enabled
  const availableMethods = [
    venue.mpesa_shortcode ? 'mpesa' : null,
    venue.allow_card ? 'card' : null,
    venue.allow_cash ? 'cash' : null,
  ].filter(Boolean) as ('mpesa' | 'card' | 'cash')[]
  const singleMethod = availableMethods.length === 1 ? availableMethods[0] : null

  const handleProceedToTip = () => {
    if (scope === 'items' && selectedIds.size === 0) { toast.error('Select at least one item.'); return }
    if (skipTip) { singleMethod ? handlePay(singleMethod) : setStep('method') }
    else setStep('tip')
  }

  const handleProceedToMethod = () => {
    singleMethod ? handlePay(singleMethod) : setStep('method')
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
      if (!result.success) { toast.error(result.message ?? 'Payment failed.'); setPaymentIdempotencyKey(crypto.randomUUID()); return }
      if (method === 'mpesa') {
        if (!mpesaPhone.match(/^(?:254|\+254|0)\d{9}$/)) { toast.error('Enter a valid M-Pesa number.'); setPaying(false); return }
        const normalised = mpesaPhone.replace(/^(?:\+254|0)/, '254')
        await initiateMpesaStkPush(result.payment_id!, normalised, result.total!, result.mpesa_shortcode ?? '')
        setMpesaPaymentId(result.payment_id!)
        setStep('mpesa_wait')
      } else if (method === 'card') {
        window.location.href = await initiateStripeCheckout(result.payment_id!, result.total!)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Payment failed.')
    } finally { setPaying(false) }
  }

  useEffect(() => {
    if (step !== 'mpesa_wait' || !mpesaPaymentId) return
    if (mpesaPollCount >= 30) {
      releaseReservation(session.id, null)
      toast.error('Payment confirmation timed out.')
      setStep('method'); setMpesaPaymentId(null); setMpesaPollCount(0); loadBill(); return
    }
    const id = setTimeout(async () => {
      const payment = await pollMpesaPaymentStatus(mpesaPaymentId)
      if (!payment) return
      if (payment.state === 'succeeded') {
        const receipt = await getReceipt(mpesaPaymentId)
        setReceiptData(receipt?.data ?? null); setStep('receipt')
      } else if (['failed', 'cancelled'].includes(payment.state)) {
        await releaseReservation(session.id, null)
        toast.error('Payment failed or cancelled.')
        setStep('method'); setMpesaPaymentId(null); setMpesaPollCount(0)
        setPaymentIdempotencyKey(crypto.randomUUID()); loadBill()
      } else { setMpesaPollCount(n => n + 1) }
    }, 4000)
    return () => clearTimeout(id)
  }, [step, mpesaPaymentId, mpesaPollCount, session.id, loadBill])

  // ── Shared layout wrapper ─────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <Spinner size="lg" />
    </div>
  )
  if (!bill) return null

  const stepTitle = step === 'select' ? 'Pay Bill'
    : step === 'tip' ? 'Add a Tip'
    : step === 'method' ? 'Payment Method'
    : step === 'mpesa_wait' ? 'Confirm on Phone'
    : 'Receipt'

  // Active steps for dot indicators
  const activeSteps = ['select', ...(skipTip ? [] : ['tip']), ...(singleMethod ? [] : ['method'])] as PayStep[]

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>

      {/* ── Header ───────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: C.white, borderBottom: `1px solid ${C.border}`,
        boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
          {step !== 'receipt' && (
            <button
              onClick={async () => {
                if (step === 'select') { await releaseReservation(session.id, null); onBack() }
                else if (step === 'tip') setStep('select')
                else if (step === 'method') setStep(skipTip ? 'select' : 'tip')
                else if (step === 'mpesa_wait') { await releaseReservation(session.id, null); setStep(singleMethod ? 'select' : 'method'); setMpesaPaymentId(null) }
              }}
              style={{ width: 34, height: 34, borderRadius: '50%', background: '#F5F5F5', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              aria-label="Back"
            >
              <ArrowLeft size={17} color={C.ink} />
            </button>
          )}
          <VenueLogo venue={venue} wrapClass="block h-8 w-[5.5rem] overflow-hidden shrink-0" imgClass="h-8 w-auto max-w-none object-contain" textClass="text-sm font-black text-gray-900" />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: '-0.3px' }}>{stepTitle}</p>
          </div>
          <span style={{ fontSize: 11.5, color: C.muted, flexShrink: 0 }}>Table {table.table_number}</span>
        </div>
        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingBottom: 10 }}>
          {activeSteps.map(s => (
            <div key={s} style={{
              height: 5, borderRadius: 3, transition: 'all 0.2s',
              width: step === s ? 24 : 10,
              background: step === s ? C.orange : '#E5E7EB',
            }} />
          ))}
        </div>
      </header>

      {/* ── STEP 1: SELECT / PAY ALL ─────────────────────────── */}
      {step === 'select' && (
        <div style={{ flex: 1, padding: '16px 16px 120px' }}>
          {bill.outstanding <= 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <CheckCircle size={40} color="#16A34A" />
              </div>
              <p style={{ fontSize: 17, fontWeight: 800, color: C.ink, margin: '0 0 16px' }}>Bill is fully paid!</p>
              <OrangeButton onClick={onDone}>Done</OrangeButton>
            </div>
          ) : (
            <>
              {/* Scope tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[{ id: 'all', label: 'Pay all' }, { id: 'items', label: 'Select items' }, { id: 'split', label: 'Split' }].map(opt => (
                  <button key={opt.id} onClick={() => { if (opt.id !== 'split') setScope(opt.id as PayScope) }}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 24, border: `1.5px solid ${scope === opt.id ? C.orange : C.border}`,
                      background: scope === opt.id ? C.orangeLight : C.white,
                      color: scope === opt.id ? C.orange : C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Bill items by order */}
              <BillSummaryCard bill={bill} currency={venue.currency} selectable={scope === 'items'} selectedIds={selectedIds}
                onToggle={id => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })}
              />

              {/* Totals */}
              <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.border}`, padding: '14px 16px', marginTop: 10 }}>
                {bill.tax_amount > 0 && <TRow label={`Tax (${(bill.tax_rate * 100).toFixed(0)}%)`} value={formatCurrency(bill.tax_amount, venue.currency)} />}
                {bill.service_charge_amount > 0 && <TRow label="Service charge" value={formatCurrency(bill.service_charge_amount, venue.currency)} />}
                {bill.paid > 0 && <TRow label="Already paid" value={`-${formatCurrency(bill.paid, venue.currency)}`} accent />}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: C.muted }}>You're paying</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>{formatCurrency(scope === 'all' ? bill.outstanding : selectedSubtotal, venue.currency)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP 2: TIP ──────────────────────────────────────── */}
      {step === 'tip' && (
        <div style={{ flex: 1, padding: '16px 16px 120px' }}>
          <p style={{ textAlign: 'center', fontSize: 14, color: C.muted, marginBottom: 20 }}>
            Your bill: <strong style={{ color: C.ink }}>{formatCurrency(selectedSubtotal, venue.currency)}</strong>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            {venue.tip_presets.map(pct => {
              const active = tipPct === pct && !showCustomTip
              return (
                <button key={pct} onClick={() => { setTipPct(pct); setShowCustomTip(false) }}
                  style={{
                    padding: '16px 8px', borderRadius: 18, textAlign: 'center',
                    border: `1.5px solid ${active ? C.orange : C.border}`,
                    background: active ? C.orangeLight : C.white, cursor: 'pointer',
                  }}>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: active ? C.orange : C.ink }}>{pct}%</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: C.muted }}>{formatCurrency(selectedSubtotal * pct / 100, venue.currency)}</p>
                </button>
              )
            })}
            <button onClick={() => { setShowCustomTip(true); setTipPct(null) }}
              style={{ padding: '16px 8px', borderRadius: 18, border: `1.5px solid ${showCustomTip ? C.orange : C.border}`, background: showCustomTip ? C.orangeLight : C.white, cursor: 'pointer' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: showCustomTip ? C.orange : C.ink }}>Custom</p>
            </button>
            <button onClick={() => { setTipPct(null); setShowCustomTip(false) }}
              style={{ padding: '16px 8px', borderRadius: 18, border: `1.5px solid ${tipPct === null && !showCustomTip ? C.orange : C.border}`, background: tipPct === null && !showCustomTip ? C.orangeLight : C.white, cursor: 'pointer' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: tipPct === null && !showCustomTip ? C.orange : C.ink }}>No tip</p>
            </button>
          </div>
          {showCustomTip && (
            <Input label="Custom tip" type="number" min="0" step="0.01" value={customTip} onChange={e => setCustomTip(e.target.value)} placeholder="0.00" className="mb-4" />
          )}
          <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 14 }}>Tips are optional and always up to you. Thank you for dining with us.</p>
          <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.border}`, padding: '12px 16px' }}>
            <TRow label="Subtotal" value={formatCurrency(selectedSubtotal, venue.currency)} />
            <TRow label={`Tip${tipPct ? ` (${tipPct}%)` : ''}`} value={formatCurrency(tipAmount, venue.currency)} />
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{formatCurrency(estimatedTotal, venue.currency)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: PAYMENT METHOD ───────────────────────────── */}
      {step === 'method' && (
        <div style={{ flex: 1, padding: '16px 16px 20px' }}>
          {/* Total hero */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Total to pay</p>
            <p style={{ margin: '4px 0 0', fontSize: 36, fontWeight: 900, color: C.orange, letterSpacing: '-1px' }}>{formatCurrency(estimatedTotal, venue.currency)}</p>
            {tipAmount > 0 && <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{formatCurrency(selectedSubtotal, venue.currency)} + {formatCurrency(tipAmount, venue.currency)} tip</p>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Card */}
            {venue.allow_card && (
              <button onClick={() => handlePay('card')} disabled={paying}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: C.white, borderRadius: 18, border: `1.5px solid ${C.border}`,
                  padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                  boxShadow: '0 2px 0 rgba(234,223,211,0.5)',
                }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CreditCard size={22} color="#4F46E5" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink }}>Card</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>Visa, Mastercard, Amex</p>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${C.border}`, flexShrink: 0 }} />
              </button>
            )}

            {/* M-Pesa */}
            {venue.mpesa_shortcode && (
              <div style={{ background: C.white, borderRadius: 18, border: `1.5px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 2px 0 rgba(234,223,211,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Smartphone size={22} color="#16A34A" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink }}>M-Pesa</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>Approve on your phone</p>
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${C.border}`, flexShrink: 0 }} />
                </div>
                <div style={{ padding: '0 16px 14px' }}>
                  <Input placeholder="07XX XXX XXX or 254XXX..." type="tel" value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)} className="mb-2" />
                  <OrangeButton onClick={() => handlePay('mpesa')} loading={paying} fullWidth>Pay with M-Pesa</OrangeButton>
                </div>
              </div>
            )}

            {/* Cash */}
            {venue.allow_cash && (
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: C.white, borderRadius: 18, border: `1.5px solid ${C.border}`,
                  padding: '14px 16px', cursor: 'default', textAlign: 'left',
                  boxShadow: '0 2px 0 rgba(234,223,211,0.5)',
                }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Banknote size={22} color="#D97706" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink }}>Cash or card machine</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>A waiter comes to your table</p>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${C.border}`, flexShrink: 0 }} />
              </button>
            )}
          </div>

          <p style={{ textAlign: 'center', fontSize: 11.5, color: C.muted, marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1a5 5 0 1 0 0 10A5 5 0 0 0 6 1zm0 7.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm.75-3a.75.75 0 0 1-1.5 0V4a.75.75 0 0 1 1.5 0v1.5z" fill="#A8A29E"/></svg>
            Payments are encrypted · Powered by TableKey
          </p>
        </div>
      )}

      {/* ── STEP: MPESA WAITING ──────────────────────────────── */}
      {step === 'mpesa_wait' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 28, padding: 32, maxWidth: 320, width: '100%', textAlign: 'center', border: `1px solid ${C.border}` }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Smartphone size={36} color="#16A34A" />
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: C.ink }}>Check your phone</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
              An M-Pesa prompt has been sent to <strong style={{ color: C.ink }}>{mpesaPhone}</strong>. Enter your PIN to confirm.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <Spinner size="sm" />
              <span style={{ fontSize: 13, color: C.muted }}>Waiting for confirmation…</span>
            </div>
            <button onClick={() => { releaseReservation(session.id, null); setStep('method'); setMpesaPaymentId(null); setMpesaPollCount(0) }}
              style={{ background: 'none', border: 'none', fontSize: 13, color: C.muted, cursor: 'pointer', padding: '8px 0' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: RECEIPT ────────────────────────────────────── */}
      {step === 'receipt' && (
        <div style={{ flex: 1, padding: '24px 16px 24px' }}>
          {/* Success hero */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={40} color="#16A34A" />
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.ink }}>Payment received</h2>
            {receiptData && <p style={{ margin: '6px 0 0', fontSize: 13, color: C.muted }}>
              {formatCurrency(Number(receiptData.total), venue.currency)} paid. Thanks for dining with us.
            </p>}
          </div>

          {/* Receipt card */}
          {receiptData && (
            <div style={{ background: C.white, borderRadius: 22, border: `1px solid ${C.border}`, padding: '18px 20px', marginBottom: 20, boxShadow: '0 3px 0 rgba(234,223,211,0.6)' }}>
              {!!receiptData.order_number && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Order</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{String(receiptData.order_number)} · Table {table.table_number}</span>
                </div>
              )}
              <TRow label="Subtotal" value={formatCurrency(Number(receiptData.subtotal), venue.currency)} />
              {Number(receiptData.tax_amount) > 0 && <TRow label="Tax" value={formatCurrency(Number(receiptData.tax_amount), venue.currency)} />}
              {Number(receiptData.svc) > 0 && <TRow label="Service" value={formatCurrency(Number(receiptData.svc), venue.currency)} />}
              {Number(receiptData.tip_amount) > 0 && <TRow label="Tip" value={formatCurrency(Number(receiptData.tip_amount), venue.currency)} />}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>Total paid</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: C.ink }}>{formatCurrency(Number(receiptData.total), venue.currency)}</span>
              </div>
              {!!receiptData.receipt_number && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  <TRow label="Reference" value={`TK ${String(receiptData.receipt_number).slice(-6).toUpperCase()}`} />
                </div>
              )}
            </div>
          )}

          <OrangeButton onClick={onDone} fullWidth>Done</OrangeButton>
          <button style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', fontSize: 13, color: C.muted, cursor: 'pointer' }}>
            Email me the receipt
          </button>
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#D1C5BC' }}>Powered by TableKey</p>
        </div>
      )}

      {/* ── Bottom CTA bar ───────────────────────────────────── */}
      {(step === 'select' || step === 'tip') && bill.outstanding > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 480, zIndex: 30,
          padding: `16px 16px calc(72px + max(16px, env(safe-area-inset-bottom)))`,
          background: `linear-gradient(to top, ${C.bg} 60%, transparent)`,
        }}>
          <OrangeButton
            onClick={step === 'select' ? handleProceedToTip : handleProceedToMethod}
            fullWidth
            loading={paying}
          >
            Continue · {formatCurrency(estimatedTotal || selectedSubtotal, venue.currency)}
            <ChevronRight size={18} />
          </OrangeButton>
        </div>
      )}

      {/* Pay method CTA */}
      {step === 'method' && (
        <div style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 480, zIndex: 30,
          padding: `16px 16px calc(72px + max(16px, env(safe-area-inset-bottom)))`,
          background: `linear-gradient(to top, ${C.bg} 60%, transparent)`,
        }}>
          {venue.allow_cash && (
            <OrangeButton onClick={() => {}} fullWidth>
              Pay {formatCurrency(estimatedTotal, venue.currency)}
              <ChevronRight size={18} />
            </OrangeButton>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared small components ───────────────────────────────────

function TRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 13, color: '#78716C' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent ? '#16A34A' : '#1C1917' }}>{value}</span>
    </div>
  )
}

function OrangeButton({ onClick, children, fullWidth, loading }: {
  onClick: () => void
  children: React.ReactNode
  fullWidth?: boolean
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        width: fullWidth ? '100%' : 'auto',
        height: 56, borderRadius: 28, border: 'none',
        background: loading ? '#F3A07A' : '#E8590C', color: '#ffffff',
        fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: '0 4px 16px rgba(232,89,12,0.3)',
        transition: 'transform 0.1s',
      }}
      onPointerDown={e => !loading && (e.currentTarget.style.transform = 'scale(0.98)')}
      onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {loading
        ? <><div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Processing…</>
        : children
      }
    </button>
  )
}

function BillSummaryCard({ bill, currency, selectable, selectedIds, onToggle }: {
  bill: ComputedBill; currency: string; selectable: boolean
  selectedIds: Set<string>; onToggle: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const byOrder = bill.items.reduce((acc, item) => {
    if (!acc[item.order_number]) acc[item.order_number] = []
    acc[item.order_number].push(item)
    return acc
  }, {} as Record<string, BillItem[]>)

  return (
    <div style={{ background: '#ffffff', borderRadius: 18, border: '1px solid #F0E5D8', overflow: 'hidden', boxShadow: '0 2px 0 rgba(234,223,211,0.5)' }}>
      {Object.entries(byOrder).map(([orderNum, items], gi) => (
        <div key={orderNum} style={{ borderBottom: gi < Object.keys(byOrder).length - 1 ? '1px solid #F5EDE4' : 'none' }}>
          {/* Order header row */}
          <button
            onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(orderNum) ? n.delete(orderNum) : n.add(orderNum); return n })}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1C1917' }}>{orderNum}</span>
              <span style={{ fontSize: 12, color: '#78716C', marginLeft: 8 }}>{items.length} dish{items.length !== 1 ? 'es' : ''}</span>
            </div>
            <ChevronDown size={14} color="#A8A29E" style={{ transform: expanded.has(orderNum) ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {/* Items */}
          {expanded.has(orderNum) && items.map(item => (
            <div
              key={item.order_item_id}
              onClick={() => selectable && item.payment_status === 'unpaid' && onToggle(item.order_item_id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 16px', borderTop: '1px solid #FAF0E8',
                cursor: selectable && item.payment_status === 'unpaid' ? 'pointer' : 'default',
                opacity: ['paid', 'voided'].includes(item.payment_status) ? 0.5 : 1,
              }}
            >
              {selectable && item.payment_status === 'unpaid' && (
                <div style={{
                  width: 20, height: 20, borderRadius: 6, border: `2px solid ${selectedIds.has(item.order_item_id) ? '#E8590C' : '#D6D3D1'}`,
                  background: selectedIds.has(item.order_item_id) ? '#E8590C' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {selectedIds.has(item.order_item_id) && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, color: '#1C1917', textDecoration: item.payment_status === 'voided' ? 'line-through' : 'none' }}>
                  {item.quantity}× {item.item_name}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: 11, color: '#78716C' }}>{formatCurrency(item.unit_price, currency)} each</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#1C1917' }}>{formatCurrency(item.line_total, currency)}</p>
                <ItemPill status={item.payment_status} />
              </div>
            </div>
          ))}

          {/* Show total for order */}
          {expanded.has(orderNum) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px 12px', background: '#FFFBF7' }}>
              <span style={{ fontSize: 12, color: '#78716C' }}>Order total</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E8590C' }}>{formatCurrency(items.reduce((s, i) => s + i.line_total, 0), currency)}</span>
            </div>
          )}
        </div>
      ))}
      {bill.items.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: 13, color: '#A8A29E', padding: '20px 0' }}>No items yet.</p>
      )}

      {/* "You're paying" summary at bottom */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #F0E5D8', background: '#FAF5F0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#78716C' }}>You're paying</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#E8590C' }}>
            {formatCurrency(selectable
              ? bill.items.filter(i => selectedIds.has(i.order_item_id)).reduce((s, i) => s + i.line_total, 0)
              : bill.outstanding, currency)}
          </span>
        </div>
      </div>
    </div>
  )
}

function ItemPill({ status }: { status: string }) {
  if (status === 'paid') return <span style={{ fontSize: 10, fontWeight: 600, color: '#16A34A' }}>Paid</span>
  if (status === 'reserved') return <span style={{ fontSize: 10, fontWeight: 600, color: '#D97706' }}>Reserved</span>
  if (status === 'voided') return <span style={{ fontSize: 10, fontWeight: 600, color: '#DC2626' }}>Voided</span>
  if (status === 'comped') return <span style={{ fontSize: 10, fontWeight: 600, color: '#7C3AED' }}>Comped</span>
  return null
}
