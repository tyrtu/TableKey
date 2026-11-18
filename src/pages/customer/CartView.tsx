import { useState } from 'react'
import { ArrowLeft, Trash2, Minus, Plus, ShoppingCart, ClipboardList, Bell, Users, Clock, CheckCircle, ChevronRight, Send, UtensilsCrossed } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCartStore } from '../../stores/cartStore'
import { placeOrder, createTableRequest, checkRateLimit, PresenceConfirmationRequiredError } from '../../lib/api'
import { AlreadySeatedError } from '../../lib/api/requests'
import { getDeviceToken, getIdempotencyKey } from '../../lib/device'
import { formatCurrency, formatTime, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { VenueLogo } from '../../components/ui/VenueLogo'
import type { RestaurantTable, Venue, TableSession, TableRequest } from '../../types/database'

// ── ALL LOGIC PRESERVED ───────────────────────────────────────
// Props, hooks, handlers, ctaState() — identical to previous version.
// Only visual presentation changed.

interface Props {
  table: RestaurantTable
  venue: Venue
  session: TableSession | null
  verified: boolean
  onBack: () => void
  onCheckout: () => void
  onViewTracking: () => void
  onOrderPlaced: () => void
  onRequestSent: (req: TableRequest) => void
  onAlreadySeated: () => void
  onJoinTable: () => void
  pendingRequest: TableRequest | null
}

export function CartView({
  table, venue, session, verified, onBack, onViewTracking,
  onOrderPlaced, onRequestSent, onJoinTable, pendingRequest,
  onAlreadySeated,
}: Props) {
  const { items, notes, updateQuantity, removeItem, updateNotes, clearCart, total, itemCount } = useCartStore()
  const [placing, setPlacing] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [idemKey] = useState(() => getIdempotencyKey())

  const handlePlaceOrder = async () => {
    if (!session || items.length === 0) return
    setPlacing(true)
    try {
      await placeOrder(venue.id, table.id, session.id, items, notes, idemKey)
      clearCart()
      toast.success('Order sent to kitchen!')
      onOrderPlaced()
      onViewTracking()
    } catch (err: unknown) {
      if (err instanceof PresenceConfirmationRequiredError) {
        toast.error(err.message, { duration: 7000 })
        return
      }
      const msg = err instanceof Error ? err.message : 'Failed to place order. Please try again.'
      toast.error(msg)
    } finally {
      setPlacing(false)
    }
  }

  const handleRequest = async () => {
    setRequesting(true)
    try {
      const allowed = await checkRateLimit(venue.id, getDeviceToken(), venue.rate_limit_requests ?? 10)
      if (!allowed) {
        toast.error('Too many requests. Please wait 2 minutes before trying again.')
        return
      }
      const req = await createTableRequest(venue.id, table.id)
      if (req) onRequestSent(req)
      toast('Request sent! Keep this screen open.', { icon: <Bell size={16} /> })
    } catch (error) {
      if (error instanceof AlreadySeatedError) {
        onAlreadySeated()
        toast('You are already seated at this table. Your order is ready to send.', { icon: <Users size={16} /> })
        return
      }
      toast.error('Failed to send request. Please try again.')
    } finally {
      setRequesting(false)
    }
  }

  const cartTotal = total()
  const count = itemCount()
  const presenceActive = !!session?.presence_confirmed_until &&
    new Date(session.presence_confirmed_until) > new Date()

  type CtaState = 'empty' | 'request' | 'join_or_request' | 'waiting' | 'ready' | 'closed'
  const ctaState = (): CtaState => {
    if (items.length === 0) return 'empty'
    if (!venue.kitchen_open) return 'closed'
    if (verified) return 'ready'
    if (pendingRequest && pendingRequest.status === 'pending') return 'waiting'
    if (session?.is_active) return 'join_or_request'
    return 'request'
  }
  const cta = ctaState()

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ background: '#FFFAF5', minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>

      {/* ── Header ───────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: '#ffffff', borderBottom: '1px solid #F0E5D8',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
          <button
            onClick={onBack}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#F5F5F5', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Back"
          >
            <ArrowLeft size={18} color="#1C1917" />
          </button>

          {/* Logo */}
          <VenueLogo
            venue={venue}
            wrapClass="block h-9 w-[6.5rem] overflow-hidden shrink-0"
            imgClass="h-9 w-auto max-w-none object-contain"
            textClass="text-base font-bold text-gray-900"
          />

          {/* Title + table */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1C1917', letterSpacing: '-0.3px', lineHeight: 1.2 }}>Your order</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8590C', flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, fontWeight: 500, color: '#78716C' }}>Table {table.table_number}</span>
            </div>
          </div>

          {verified && (
            <button
              onClick={onViewTracking}
              style={{ width: 36, height: 36, borderRadius: '50%', background: '#F5F5F5', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              aria-label="Order tracking"
            >
              <ClipboardList size={18} color="#78716C" />
            </button>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={48} />}
          title="Your cart is empty"
          description="Add items from the menu to get started."
          action={
            <button
              onClick={onBack}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', borderRadius: 24,
                background: '#E8590C', color: '#fff',
                fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer',
              }}
            >
              <ArrowLeft size={16} /> Browse Menu
            </button>
          }
        />
      ) : (
        <>
          <main style={{ flex: 1, padding: '16px 16px 220px' }}>

            {/* Status banner */}
            {cta === 'ready' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#F0FDF4', border: '1px solid #BBF7D0',
                borderRadius: 16, padding: '12px 14px', marginBottom: 16,
              }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle size={16} color="#fff" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#15803D' }}>You're approved</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#16A34A' }}>Review your order, then send it to the kitchen.</p>
                </div>
              </div>
            )}
            {verified && session && !presenceActive && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: '#FFFBEB', border: '1px solid #FDE68A',
                borderRadius: 16, padding: '12px 14px', marginBottom: 16,
              }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Clock size={15} color="#fff" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#92400E' }}>Waiter confirmation needed</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#B45309' }}>Your waiter needs to confirm the table is still occupied before this order can be sent.</p>
                </div>
              </div>
            )}
            {cta === 'waiting' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#FFFBEB', border: '1px solid #FDE68A',
                borderRadius: 16, padding: '12px 14px', marginBottom: 16,
              }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#92400E' }}>Waiting for waiter approval</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#B45309' }}>Your items are saved. Approval coming shortly.</p>
                </div>
              </div>
            )}

            {/* Items header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1917' }}>Your items</span>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', background: '#1C1917',
                  color: '#fff', fontSize: 11, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{count}</span>
              </div>
              <button
                onClick={onBack}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#E8590C', padding: '4px 0' }}
              >
                + Add more
              </button>
            </div>

            {/* Cart items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {items.map((item) => {
                const cartItemId = item.id + JSON.stringify(item.options) + item.notes
                return (
                  <div key={cartItemId} style={{
                    background: '#ffffff', borderRadius: 18, border: '1px solid #F0E5D8',
                    padding: '14px 14px 12px', boxShadow: '0 2px 0 rgba(234,223,211,0.5)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      {/* Item thumbnail */}
                      <div style={{
                        width: 52, height: 52, borderRadius: 14, background: '#FBF0E8',
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden',
                      }}>
                        <svg width="28" height="28" viewBox="0 0 62 62" fill="none">
                          <circle cx="22" cy="28" r="12" fill="#B5482A" />
                          <circle cx="38" cy="24" r="10" fill="#7A9B3A" />
                          <circle cx="34" cy="38" r="10" fill="#D9822B" />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1C1917', lineHeight: 1.3 }}>{item.name}</p>
                        {Object.keys(item.options).length > 0 && (
                          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#78716C' }}>{Object.values(item.options).join(', ')}</p>
                        )}
                        {item.notes && (
                          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#A8A29E', fontStyle: 'italic' }}>"{item.notes}"</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(cartItemId)}
                        style={{ padding: 6, background: '#F5F5F5', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 size={14} color="#78716C" />
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                      {/* Stepper */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#F5F5F5', borderRadius: 24, padding: '3px 6px' }}>
                        <button
                          onClick={() => updateQuantity(cartItemId, item.quantity - 1)}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff', border: '1px solid #E5E7EB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          aria-label="Decrease quantity"
                        >
                          <Minus size={13} color="#1C1917" />
                        </button>
                        <span style={{ width: 28, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#1C1917' }}>{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(cartItemId, item.quantity + 1)}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: '#E8590C', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          aria-label="Increase quantity"
                        >
                          <Plus size={13} color="#fff" />
                        </button>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#1C1917' }}>
                        {formatCurrency(item.lineTotal, venue.currency)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Allergies / special requests row */}
            <button
              onClick={() => setNotesExpanded(v => !v)}
              style={{
                width: '100%', background: '#ffffff', borderRadius: 18,
                border: '1px solid #F0E5D8', padding: '14px',
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                marginBottom: 14, boxShadow: '0 2px 0 rgba(234,223,211,0.5)',
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FBF0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UtensilsCrossed size={16} color="#E8590C" />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1C1917' }}>Allergies or special requests?</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#78716C' }}>
                  {notes ? notes : 'Add a note for the kitchen'}
                </p>
              </div>
              <ChevronRight size={16} color="#A8A29E" style={{ transform: notesExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {notesExpanded && (
              <div style={{ marginTop: -8, marginBottom: 14, padding: '0 2px' }}>
                <textarea
                  value={notes}
                  onChange={e => updateNotes(e.target.value)}
                  placeholder="Allergies, special instructions…"
                  maxLength={300}
                  rows={3}
                  style={{
                    width: '100%', borderRadius: 14, border: '1.5px solid #F0E5D8',
                    padding: '12px 14px', fontSize: 14, color: '#1C1917',
                    background: '#fff', resize: 'none', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.5,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Totals */}
            <div style={{ padding: '0 2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: '#78716C' }}>Subtotal · {count} item{count !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1917' }}>{formatCurrency(cartTotal, venue.currency)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="#78716C" strokeWidth="1.2" />
                  <text x="7" y="10.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#78716C">i</text>
                </svg>
                <span style={{ fontSize: 12, color: '#78716C' }}>Your order goes straight to the kitchen.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1.5px solid #F0E5D8' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#1C1917' }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#1C1917' }}>{formatCurrency(cartTotal, venue.currency)}</span>
              </div>
            </div>
          </main>

          {/* ── Bottom CTA ──────────────────────────────────── */}
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 480, zIndex: 30,
            padding: '16px 16px calc(72px + max(16px, env(safe-area-inset-bottom)))',
            background: 'linear-gradient(to top, #FFFAF5 60%, transparent)',
          }}>
            {/* Kitchen closed */}
            {cta === 'closed' && (
              <div style={{ textAlign: 'center', fontSize: 14, color: '#78716C', padding: '16px 0' }}>
                Kitchen is currently closed. You can still build your cart.
              </div>
            )}

            {/* Request */}
            {cta === 'request' && (
              <>
                <button
                  onClick={handleRequest}
                  disabled={requesting}
                  style={{
                    width: '100%', height: 56, borderRadius: 28, border: 'none',
                    background: requesting ? '#F3A07A' : '#E8590C', color: '#fff',
                    fontSize: 16.5, fontWeight: 700, cursor: requesting ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 16px rgba(232,89,12,0.35)',
                  }}
                >
                  {requesting
                    ? <><div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Requesting…</>
                    : <><Bell size={18} /> Request to Order · {formatCurrency(cartTotal, venue.currency)}</>
                  }
                </button>
                <p style={{ textAlign: 'center', fontSize: 12, color: '#78716C', marginTop: 8 }}>
                  A waiter will verify you're at the table — your items stay saved.
                </p>
              </>
            )}

            {/* Join or request */}
            {cta === 'join_or_request' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onJoinTable} style={{ flex: 1, height: 52, borderRadius: 26, border: '1.5px solid #E8590C', background: '#fff', color: '#E8590C', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Users size={16} /> Join Table
                </button>
                <button onClick={handleRequest} disabled={requesting} style={{ flex: 1, height: 52, borderRadius: 26, border: 'none', background: '#E8590C', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Bell size={16} /> New Group
                </button>
              </div>
            )}

            {/* Waiting */}
            {cta === 'waiting' && (
              <>
                <div style={{ height: 52, borderRadius: 26, background: '#FFF7ED', border: '1.5px solid #FED7AA', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div style={{ width: 16, height: 16, border: '2px solid #F59E0B', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#92400E' }}>Waiting for waiter approval…</span>
                </div>
                <p style={{ textAlign: 'center', fontSize: 12, color: '#78716C', marginTop: 8 }}>Your cart is safe. Don't close this screen.</p>
              </>
            )}

            {/* Ready — send to kitchen */}
            {cta === 'ready' && (
              <>
                <button
                  onClick={handlePlaceOrder}
                  disabled={placing}
                  style={{
                    width: '100%', height: 56, borderRadius: 28, border: 'none',
                    background: placing ? '#F3A07A' : '#E8590C', color: '#fff',
                    fontSize: 16.5, fontWeight: 700, cursor: placing ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 16px rgba(232,89,12,0.35)',
                  }}
                >
                  {placing
                    ? <><div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Sending…</>
                    : <><Send size={18} /> Send to kitchen · {formatCurrency(cartTotal, venue.currency)}</>
                  }
                </button>
                <p style={{ textAlign: 'center', fontSize: 12, color: '#78716C', marginTop: 8 }}>
                  Your order goes straight to the kitchen.
                </p>
              </>
            )}
          </div>

          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </>
      )}
    </div>
  )
}
