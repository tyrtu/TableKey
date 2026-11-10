import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, Lock, Search, ShoppingCart, UtensilsCrossed } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getMenu, getActiveSession,
  createTableRequest, verifyCode, isDeviceVerified, checkRateLimit,
} from '../../lib/api'
import { AlreadySeatedError } from '../../lib/api/requests'
import { supabase } from '../../lib/supabase'
import { getDeviceToken, storeSessionAccess, getStoredSessionId, clearSessionAccess } from '../../lib/device'
import { useTableRealtime } from '../../hooks/useRealtime'
import { useCartStore } from '../../stores/cartStore'
import { cn } from '../../lib/utils'
import type { RestaurantTable, Venue, TableSession, TableRequest, MenuCategory, MenuItem, ItemOption } from '../../types/database'
import { FullPageSpinner } from '../../components/ui/Spinner'
import { MenuView } from './MenuView'
import { RequestView } from './RequestView'
import { CodeEntryView } from './CodeEntryView'
import { YouAreInView } from './YouAreInView'
import { GreetingView } from './GreetingView'
import { CartView } from './CartView'
import { OrderTrackingView } from './OrderTrackingView'
import { CheckoutView } from './CheckoutView'

export type CustomerView = 'greeting' | 'menu' | 'request' | 'approved' | 'code' | 'cart' | 'tracking' | 'checkout'

export interface MenuData {
  categories: MenuCategory[]
  items: MenuItem[]
  options: ItemOption[]
}

export default function TablePage() {
  // New URL format: /:venueSlug/t/:tableSlug
  const { venueSlug, tableSlug } = useParams<{ venueSlug: string; tableSlug: string }>()

  const [view, setView] = useState<CustomerView>('menu')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [table, setTable] = useState<RestaurantTable | null>(null)
  const [venue, setVenue] = useState<Venue | null>(null)
  const [session, setSession] = useState<TableSession | null>(null)
  const [pendingRequest, setPendingRequest] = useState<TableRequest | null>(null)
  const [menuData, setMenuData] = useState<MenuData>({ categories: [], items: [], options: [] })
  const [verified, setVerified] = useState(false)
  const [isRequester, setIsRequester] = useState(false)
  const [approvedCode, setApprovedCode] = useState<string | null>(null)

  const setContext = useCartStore((s) => s.setContext)
  const clearCart = useCartStore((s) => s.clearCart)
  const cartItemCount = useCartStore((s) => s.itemCount())

  // Persist isRequester across remounts in localStorage
  const markAsRequester = useCallback((tableId: string) => {
    setIsRequester(true)
    localStorage.setItem('tk_is_requester_' + tableId, '1')
  }, [])
  const clearRequester = useCallback((tableId: string) => {
    setIsRequester(false)
    localStorage.removeItem('tk_is_requester_' + tableId)
  }, [])

  // ── Boot ──────────────────────────────────────────────────────
  const boot = useCallback(async () => {
    if (!venueSlug || !tableSlug) {
      setError('Invalid table link.')
      setLoading(false)
      return
    }
    setLoading(true)

    // Use the new get_table_by_slug RPC (migration 008)
    // Falls back to old qr_token lookup for backward compat
    const { data: slugResult } = await supabase.rpc('get_table_by_slug', {
      p_venue_slug: venueSlug,
      p_table_slug: tableSlug,
    })

    if (!slugResult?.found) {
      setError('Table not found. Scan the QR code at your table.')
      setLoading(false)
      return
    }

    const tbl: RestaurantTable = {
      id: slugResult.table_id,
      venue_id: slugResult.venue_id,
      table_number: slugResult.table_number,
      label: slugResult.label,
      capacity: slugResult.capacity,
      status: slugResult.status,
      qr_token: '',
      table_slug: slugResult.table_slug ?? null,
      created_at: '',
    }

    const vn: Partial<Venue> = {
      id: slugResult.venue_id,
      name: slugResult.venue_name,
      slug: slugResult.venue_slug,
      payment_mode: slugResult.payment_mode,
      code_length: slugResult.code_length,
      max_code_attempts: slugResult.max_code_attempts,
      kitchen_open: slugResult.kitchen_open,
      currency: slugResult.currency,
      tip_enabled: slugResult.tip_enabled,
      tip_presets: slugResult.tip_presets,
    }

    setTable(tbl)
    setVenue(vn as Venue)

    // Show greeting on first scan (once per table, stored in localStorage)
    const greetedKey = 'tk_greeted_' + tbl.id
    const hasGreeted = localStorage.getItem(greetedKey) === '1'

    const [menu, activeSess] = await Promise.all([
      getMenu(tbl.venue_id),
      getActiveSession(tbl.id),
    ])

    setMenuData(menu)

    let alreadyVerified = false

    if (activeSess) {
      setSession(activeSess)
      const storedSessId = getStoredSessionId(tbl.id)

      if (storedSessId === activeSess.id) {
        const dev = await isDeviceVerified(activeSess.id)
        if (dev) {
          setApprovedCode(activeSess.current_code)
          setVerified(true)
          setContext(tbl.id, activeSess.id)
          alreadyVerified = true
        }
      }
      // Restore isRequester flag if they were waiting before a reload
      const wasRequester = localStorage.getItem('tk_is_requester_' + tbl.id) === '1'
      if (wasRequester) setIsRequester(true)
    }

    // Show greeting only on first scan when not already in a session
    if (!hasGreeted && !alreadyVerified) {
      setView('greeting')
    }

    setLoading(false)
  }, [venueSlug, tableSlug, setContext])

  useEffect(() => { boot() }, [boot])

  // ── Realtime: session changes ─────────────────────────────────
  useTableRealtime('table_sessions', 'table_id', table?.id, (payload) => {
    const updated = payload.new as unknown as TableSession

    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      if (!updated.is_active) {
        // Only react to OUR current session closing
        const currentSession = session
        if (!currentSession || updated.id !== currentSession.id) return

        if (table) { clearSessionAccess(table.id); clearRequester(table.id) }
        clearCart()
        setVerified(false)
        setIsRequester(false)
        setApprovedCode(null)
        setSession(null)
        setView('menu')
        setPendingRequest(null)
        toast('Your table session has ended.', { icon: <Lock size={16} /> })
      } else {
        setSession(updated)

        const wasRequester = table
          ? localStorage.getItem('tk_is_requester_' + table.id) === '1'
          : isRequester

        if (wasRequester) {
          if (table) {
            storeSessionAccess(table.id, updated.id, updated.current_code ?? '')
            clearRequester(table.id)
          }
          setVerified(true)
          setContext(table!.id, updated.id)
          setApprovedCode(updated.current_code)
          // If they were on the cart, return them there after showing the code
          setView('approved')
        }
      }
    }
  })

  // ── Realtime: request changes ─────────────────────────────────
  useTableRealtime('table_requests', 'table_id', table?.id, (payload) => {
    const req = payload.new as unknown as TableRequest
    if (req.device_token !== getDeviceToken()) return
    if (req.status === 'denied') {
      setPendingRequest(null)
      if (table) clearRequester(table.id)
      setIsRequester(false)
      setView('menu')
      toast.error('Your request was declined. Please ask a staff member for help.')
    }
  })

  // ── Actions ───────────────────────────────────────────────────
  const handleRequestToOrder = async () => {
    if (!table || !venue) return
    try {
      const allowed = await checkRateLimit(venue.id, getDeviceToken(), venue.rate_limit_requests ?? 10)
      if (!allowed) {
        toast.error('Too many requests. Please wait 2 minutes before trying again.')
        return
      }
      const req = await createTableRequest(venue.id, table.id)
      setPendingRequest(req)
      markAsRequester(table.id)
      setView('request')
    } catch (error) {
      if (error instanceof AlreadySeatedError && session?.id === error.sessionId) {
        restoreVerifiedSession()
        toast('You are already seated at this table. Your order is ready to send.', {
          icon: <ClipboardList size={16} />,
        })
        return
      }
      toast.error('Failed to send request. Please try again.')
    }
  }

  const restoreVerifiedSession = () => {
    if (!table || !session) return
    storeSessionAccess(table.id, session.id, session.current_code ?? '')
    setVerified(true)
    setApprovedCode(session.current_code)
    setContext(table.id, session.id)
    clearRequester(table.id)
    setIsRequester(false)
    setView(cartItemCount > 0 ? 'cart' : 'menu')
  }

  const handleOrderPlaced = () => {
    if (table) clearRequester(table.id)
    setIsRequester(false)
    // Keep the device verified for the active table session. Additional orders
    // should not send the diner through approval again.
  }

  const handleCodeSubmit = async (code: string): Promise<string | null> => {
    if (!session || !venue) return 'No active session.'
    const result = await verifyCode(session, code, venue.id, venue.max_code_attempts ?? 5)
    if (result.success && table) {
      storeSessionAccess(table.id, session.id, code)
      setVerified(true)
      setContext(table.id, session.id)
      setView('menu')
    }
    return result.success ? null : result.message
  }

  // ── Render ────────────────────────────────────────────────────
  if (loading) return <FullPageSpinner label="Loading menu…" />

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-warm">
        <div className="text-center max-w-xs">
          <Search size={56} className="mb-4 text-gray-400" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Table not found</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!table || !venue) return null

  const sharedProps = { table, venue, menuData, session, verified }

  return (
    <div className="min-h-screen bg-warm">
      {view === 'greeting' && table && venue && (
        <GreetingView
          table={table}
          venue={venue}
          onContinue={() => {
            localStorage.setItem('tk_greeted_' + table.id, '1')
            setView('menu')
          }}
        />
      )}

      {view === 'menu' && (
        <MenuView
          {...sharedProps}
          onRequestToOrder={handleRequestToOrder}
          onJoinTable={() => setView('code')}
          onOpenCart={() => setView('cart')}
          onViewTracking={() => setView('tracking')}
          approvedCode={approvedCode}
          onShowCode={() => setView('approved')}
        />
      )}

      {view === 'request' && (
        <RequestView
          table={table}
          venue={venue}
          request={pendingRequest}
          onBack={() => {
            setPendingRequest(null)
            if (table) clearRequester(table.id)
            setIsRequester(false)
            setView('menu')
          }}
        />
      )}

      {view === 'approved' && session && (
        <YouAreInView
          table={table}
          venue={venue}
          session={session}
          onContinue={() => {
            // If they have cart items waiting, send them back to cart
            const cartStore = useCartStore.getState()
            setView(cartStore.itemCount() > 0 ? 'cart' : 'menu')
          }}
        />
      )}

      {view === 'code' && session && (
        <CodeEntryView
          table={table}
          venue={venue}
          session={session}
          onSubmit={handleCodeSubmit}
          onBack={() => setView('menu')}
        />
      )}

      {view === 'cart' && (
        <CartView
          {...sharedProps}
          onBack={() => setView('menu')}
          onCheckout={() => setView('checkout')}
          onViewTracking={() => setView('tracking')}
          onOrderPlaced={handleOrderPlaced}
          pendingRequest={pendingRequest}
          onRequestSent={(req) => {
            setPendingRequest(req)
            markAsRequester(table.id)
            // Stay on cart — no navigation. The waiting banner shows in CartView.
          }}
          onAlreadySeated={restoreVerifiedSession}
          onJoinTable={() => setView('code')}
        />
      )}

      {view === 'checkout' && session && (
        <CheckoutView
          table={table}
          venue={venue}
          session={session}
          onBack={() => setView('tracking')}
          onDone={() => setView('tracking')}
        />
      )}

      {view === 'tracking' && session && (
        <OrderTrackingView
          table={table}
          venue={venue}
          session={session}
          onBack={() => setView('menu')}
          onCheckout={() => setView('checkout')}
        />
      )}

      {(['menu', 'cart', 'tracking'] as CustomerView[]).includes(view) && (
        <CustomerBottomNav
          view={view}
          verified={verified}
          cartItemCount={cartItemCount}
          onMenu={() => setView('menu')}
          onCart={() => setView('cart')}
          onTracking={() => setView('tracking')}
        />
      )}
    </div>
  )
}

function CustomerBottomNav({
  view,
  verified,
  cartItemCount,
  onMenu,
  onCart,
  onTracking,
}: {
  view: CustomerView
  verified: boolean
  cartItemCount: number
  onMenu: () => void
  onCart: () => void
  onTracking: () => void
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
      aria-label="Table navigation"
    >
      <CustomerNavButton
        active={view === 'menu'}
        onClick={onMenu}
        icon={<UtensilsCrossed size={20} />}
        label="Menu"
      />
      <CustomerNavButton
        active={view === 'cart'}
        onClick={onCart}
        icon={<ShoppingCart size={20} />}
        label="Cart"
        badge={cartItemCount}
      />
      {verified && (
        <CustomerNavButton
          active={view === 'tracking'}
          onClick={onTracking}
          icon={<ClipboardList size={20} />}
          label="Order status"
        />
      )}
    </nav>
  )
}

function CustomerNavButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
        active ? 'text-brand-600' : 'text-gray-500'
      )}
    >
      <span className={cn(
        'flex h-8 w-12 items-center justify-center rounded-lg transition-colors',
        active && 'bg-brand-50'
      )}>
        {icon}
      </span>
      <span>{label}</span>
      {!!badge && badge > 0 && (
        <span className="absolute top-1.5 left-1/2 ml-3 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}
