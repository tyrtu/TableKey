import { useState } from 'react'
import { ArrowLeft, Trash2, Minus, Plus, ShoppingCart, ClipboardList, Bell, Users, Clock, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCartStore } from '../../stores/cartStore'
import { placeOrder, createTableRequest, checkRateLimit, PresenceConfirmationRequiredError } from '../../lib/api'
import { AlreadySeatedError } from '../../lib/api/requests'
import { getDeviceToken, getIdempotencyKey } from '../../lib/device'
import { formatCurrency, formatTime, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/EmptyState'
import { VenueLogo } from '../../components/ui/VenueLogo'
import type { RestaurantTable, Venue, TableSession, TableRequest } from '../../types/database'

interface Props {
  table: RestaurantTable
  venue: Venue
  session: TableSession | null
  verified: boolean
  onBack: () => void
  onCheckout: () => void
  onViewTracking: () => void
  onOrderPlaced: () => void
  // Callbacks to trigger request flow without leaving cart
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
        toast('You are already seated at this table. Your order is ready to send.', {
          icon: <Users size={16} />,
        })
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

  // ── What state is the bottom CTA in? ──────────────────────────
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

  return (
    <div className="flex flex-col min-h-screen bg-warm">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-gray-100 transition-colors" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <VenueLogo
              venue={venue}
              wrapClass="block h-7 w-[5.5rem] overflow-hidden"
              imgClass="h-[3.2rem] w-auto max-w-none -translate-x-1 -translate-y-0.5 object-contain"
              textClass="text-base font-bold text-gray-900"
            />
            <p className="text-xs text-gray-500">Table {table.table_number}</p>
          </div>
          {verified && (
            <button
              onClick={onViewTracking}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500"
              aria-label="Order tracking"
            >
              <ClipboardList size={20} />
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
            <Button variant="secondary" onClick={onBack}>
              <ArrowLeft size={16} />
              Browse Menu
            </Button>
          }
        />
      ) : (
        <>
          <main className="flex-1 px-4 py-4 pb-52">
            {/* Status banner */}
            {cta === 'waiting' && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
                <Clock size={18} className="text-amber-500 shrink-0 animate-pulse" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Waiting for waiter approval</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Your items are saved. As soon as a waiter approves, your order will be ready to send.
                  </p>
                </div>
              </div>
            )}
            {cta === 'join_or_request' && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3">
                <Bell size={18} className="text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">One step before ordering</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Request waiter approval or join the existing table session to send your order.
                  </p>
                </div>
              </div>
            )}
            {cta === 'request' && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3">
                <Bell size={18} className="text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">Request to order</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Tap the button below — a waiter will verify you're at the table and unlock your order.
                  </p>
                </div>
              </div>
            )}
            {cta === 'ready' && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                <p className="text-sm font-semibold text-emerald-800">
                  Approved! Review your order and tap Send to Kitchen.
                </p>
              </div>
            )}
            {verified && session && (
              <div className={cn(
                'mb-4 flex items-start gap-3 rounded-2xl px-4 py-3 border',
                presenceActive
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              )}>
                {presenceActive ? (
                  <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Clock size={18} className="text-amber-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={cn(
                    'text-sm font-semibold',
                    presenceActive ? 'text-emerald-800' : 'text-amber-900'
                  )}>
                    {presenceActive ? 'Table presence confirmed' : 'Waiter confirmation needed'}
                  </p>
                  <p className={cn(
                    'text-xs mt-0.5',
                    presenceActive ? 'text-emerald-700' : 'text-amber-700'
                  )}>
                    {presenceActive
                      ? `You can send this order. Confirmation is valid until ${formatTime(session.presence_confirmed_until!)}.`
                      : 'Your waiter needs to confirm the table is still occupied before this order can be sent.'}
                  </p>
                </div>
              </div>
            )}

            {/* Cart items */}
            <div className="flex flex-col gap-3 mb-6">
              {items.map((item) => {
                const cartItemId = item.id + JSON.stringify(item.options) + item.notes
                return (
                  <div key={cartItemId} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900">{item.name}</p>
                        {Object.keys(item.options).length > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {Object.values(item.options).join(', ')}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-gray-400 mt-0.5 italic">"{item.notes}"</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(cartItemId)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1 rounded-xl border border-gray-200">
                        <button
                          onClick={() => updateQuantity(cartItemId, item.quantity - 1)}
                          className="h-8 w-8 flex items-center justify-center hover:bg-gray-50 rounded-l-xl transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-7 text-center text-sm font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(cartItemId, item.quantity + 1)}
                          className="h-8 w-8 flex items-center justify-center hover:bg-gray-50 rounded-r-xl transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="font-bold text-gray-900 text-sm">
                        {formatCurrency(item.lineTotal, venue.currency)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Order notes */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm mb-4">
              <Textarea
                label="Order notes (optional)"
                placeholder="Allergies, special instructions…"
                rows={2}
                value={notes}
                onChange={(e) => updateNotes(e.target.value)}
                maxLength={300}
              />
            </div>

            {/* Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">{count} item{count !== 1 ? 's' : ''}</span>
                <span className="font-bold text-gray-900">{formatCurrency(cartTotal, venue.currency)}</span>
              </div>
              <p className="text-xs text-gray-400">Payment at the end of your meal.</p>
            </div>
          </main>

          {/* Bottom CTA — changes based on state */}
          <div className="fixed bottom-[4.5rem] md:bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur border-t border-gray-100 p-4 safe-bottom">

            {/* Kitchen closed */}
            {cta === 'closed' && (
              <div className="text-center text-sm text-gray-500 py-2">
                Kitchen is currently closed. You can still build your cart.
              </div>
            )}

            {/* No session — request waiter */}
            {cta === 'request' && (
              <>
                <Button fullWidth size="lg" onClick={handleRequest} loading={requesting}>
                  <Bell size={18} />
                  Request to Order · {formatCurrency(cartTotal, venue.currency)}
                </Button>
                <p className="text-xs text-center text-gray-400 mt-2">
                  A waiter will verify you're at the table — your items stay saved.
                </p>
              </>
            )}

            {/* Active session — join or request as new group */}
            {cta === 'join_or_request' && (
              <div className="flex gap-2">
                <Button fullWidth variant="secondary" onClick={onJoinTable}>
                  <Users size={16} />
                  Join Table
                </Button>
                <Button fullWidth onClick={handleRequest} loading={requesting}>
                  <Bell size={16} />
                  New Group
                </Button>
              </div>
            )}

            {/* Request pending — waiting for waiter */}
            {cta === 'waiting' && (
              <>
                <div className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-50 border border-amber-200">
                  <div className="h-4 w-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium text-amber-700">Waiting for waiter approval…</span>
                </div>
                <p className="text-xs text-center text-gray-400 mt-2">
                  Your cart is safe. Don't close this screen.
                </p>
              </>
            )}

            {/* Verified — ready to send */}
            {cta === 'ready' && (
              <>
                <Button fullWidth size="lg" onClick={handlePlaceOrder} loading={placing}>
                  Send to Kitchen · {formatCurrency(cartTotal, venue.currency)}
                </Button>
                <p className="text-xs text-center text-gray-400 mt-2">
                  Your order goes straight to the kitchen.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
