import { useState, useEffect, useMemo } from 'react'
import { ShoppingCart, Bell, UtensilsCrossed, ClipboardList, Search, X, Users, Receipt, AlertTriangle, Check, ChefHat } from 'lucide-react'
import { cn, formatCurrency } from '../../lib/utils'
import { useCartStore } from '../../stores/cartStore'
import { useSessionOrders } from '../../hooks/useOrders'
import { computeBill } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { VenueLogo } from '../../components/ui/VenueLogo'
import { ItemDetailModal } from './ItemDetailModal'
import type { RestaurantTable, Venue, TableSession, MenuItem, ItemOption, ComputedBill } from '../../types/database'
import type { MenuData } from './TablePage'
import rustoBotanical from '../../../rusto-botanical.svg'

interface Props {
  table: RestaurantTable
  venue: Venue
  menuData: MenuData
  session: TableSession | null
  verified: boolean
  approvedCode: string | null
  onRequestToOrder: () => void
  onJoinTable: () => void
  onShowCode: () => void
  onOpenCart: () => void
  onViewTracking: () => void
}

export function MenuView({ table, venue, menuData, session, verified, approvedCode, onRequestToOrder, onJoinTable, onShowCode, onOpenCart, onViewTracking }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>(menuData.categories[0]?.id ?? '')
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [search, setSearch] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [bill, setBill] = useState<ComputedBill | null>(null)
  const [ordersPlaced, setOrdersPlaced] = useState(false)

  const itemCount = useCartStore((s) => s.itemCount())
  const total = useCartStore((s) => s.total())

  // Live order statuses for the status bar (#5)
  const { orders: liveOrders } = useSessionOrders(
    verified && session?.is_active ? session.id : null
  )
  const preparingCount = liveOrders.filter(o => o.status === 'preparing').length
  const readyCount = liveOrders.filter(o => o.status === 'ready').length
  const showStatusBar = verified && (preparingCount > 0 || readyCount > 0)

  // Load bill whenever session is active and verified
  useEffect(() => {
    if (!session?.id || !verified) { setBill(null); return }
    // Check if any orders exist first
    const active = liveOrders.filter(o => o.status !== 'cancelled' && (o.items?.length ?? 0) > 0)
    if (active.length === 0) { setBill(null); setOrdersPlaced(false); return }
    setOrdersPlaced(true)
    computeBill(session.id)
      .then(b => setBill(b))
      .catch(() => {
        // RPC not yet available — compute from the orders already loaded above.
        const total = active.reduce((s, o) => s + Number(o.subtotal), 0)
        setBill({ outstanding: total, total, paid: 0 } as unknown as ComputedBill)
      })
  }, [session?.id, verified, liveOrders])

  const { categories, items, options } = menuData

  const filteredItems = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
    )
  }, [items, search])

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>()
    for (const cat of categories) {
      map.set(cat.id, filteredItems.filter((i) => i.category_id === cat.id))
    }
    return map
  }, [categories, filteredItems])

  const optionsByItem = useMemo(() => {
    const map = new Map<string, ItemOption[]>()
    for (const opt of options) {
      const list = map.get(opt.item_id) ?? []
      list.push(opt)
      map.set(opt.item_id, list)
    }
    return map
  }, [options])

  const handleRequest = async () => {
    setRequesting(true)
    await onRequestToOrder()
    setRequesting(false)
  }

  const visibleCategories = categories.filter((c) => (itemsByCategory.get(c.id)?.length ?? 0) > 0)
  const isRusto = venue.name.trim().toLowerCase() === 'rusto'

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="relative sticky top-0 z-30 overflow-hidden bg-[#fcf8ef] border-b border-[#eadfca] shadow-sm">
        {isRusto && (
          <img
            src={rustoBotanical}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-2 -top-1 z-0 h-auto w-[58vw] min-w-[190px] max-w-[270px] select-none opacity-90 md:w-[310px] md:max-w-none"
          />
        )}
        <div className="relative z-10 px-4 pt-4 pb-3">
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0">
              <VenueLogo venue={venue} />
              <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Your table · Scan to order
                <span className="sr-only">Table {table.table_number}{table.label ? `, ${table.label}` : ''}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center rounded-full bg-gray-900/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Table {table.table_number}
              </span>
              {verified && approvedCode && (
                <button
                  onClick={onShowCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
                  aria-label="Show table code"
                >
                  <span className="font-mono tracking-widest">{approvedCode.split('').join(' ')}</span>
                  <Users size={13} />
                </button>
              )}
              {verified && (
                <button
                  onClick={onViewTracking}
                  className="relative p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
                  aria-label="Order status"
                >
                  <ClipboardList size={22} />
                </button>
              )}
              {verified && (
                <button
                  onClick={onOpenCart}
                  className="relative p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
                  aria-label="Cart"
                >
                  <ShoppingCart size={22} />
                  {itemCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {itemCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Outstanding bill strip — always visible when there's an unpaid balance */}
          {verified && bill && !bill.is_settled && bill.outstanding > 0 && (
            <button
              onClick={onViewTracking}
              className="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2 hover:bg-amber-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Receipt size={14} className="text-amber-600 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-amber-800 leading-tight">Outstanding balance</p>
                  {bill.paid > 0 && (
                    <p className="text-[10px] text-amber-600 leading-tight">{formatCurrency(bill.paid, venue.currency)} already paid</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-amber-800">{formatCurrency(bill.outstanding, venue.currency)}</span>
                <span className="text-[10px] text-amber-500 bg-amber-100 rounded-full px-2 py-0.5 font-medium">Pay</span>
              </div>
            </button>
          )}

          {/* Settled confirmation strip */}
          {verified && bill?.is_settled && ordersPlaced && (
            <div className="w-full flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2">
              <Check size={15} className="text-emerald-600" />
              <p className="text-xs font-medium text-emerald-700">Bill fully paid — thanks for dining with us!</p>
            </div>
          )}

          {/* Order status bar — shows live kitchen progress */}
          {showStatusBar && (
            <button
              onClick={onViewTracking}
              className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-2 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {preparingCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
                    <ChefHat size={13} />
                    {preparingCount} preparing
                  </span>
                )}
                {preparingCount > 0 && readyCount > 0 && (
                  <span className="text-gray-300 text-xs">·</span>
                )}
                {readyCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
                    <Check size={13} />
                    {readyCount} ready
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">View →</span>
            </button>
          )}

          <div className="mb-3">
            <h2 className="text-[1.65rem] font-bold leading-tight tracking-tight text-gray-900">
              Good food, <span className="text-brand-600">made easy.</span>
            </h2>
            <p className="mt-1 text-xs text-gray-600">Browse the menu and order straight to your table.</p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              className="w-full h-10 pl-9 pr-8 text-sm rounded-full border border-[#eadfca] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {/* Category tabs */}
        {!search && (
          <div className="relative z-10 flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap border',
                  activeCategory === cat.id
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white/70 text-gray-600 border-[#eadfca] hover:bg-white'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Kitchen closed banner */}
      {!venue.kitchen_open && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3">
          <UtensilsCrossed size={16} className="text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-800">Kitchen is currently closed. You can browse the menu but ordering is unavailable.</p>
        </div>
      )}

      {/* Menu content */}
      <main className="flex-1 px-4 py-5 pb-36">
        {search ? (
          <div>
            <p className="text-xs text-gray-500 mb-3">{filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for "{search}"</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  currency={venue.currency}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
              {filteredItems.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <UtensilsCrossed size={36} className="mx-auto mb-2" />
                  <p className="text-sm">No items match "{search}"</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          categories.map((cat) => {
            const catItems = itemsByCategory.get(cat.id) ?? []
            if (catItems.length === 0) return null
            if (activeCategory && activeCategory !== cat.id) return null
            return (
              <section key={cat.id} className="mb-8">
                <div className="mb-3 flex items-end gap-3">
                  <div className="shrink-0">
                    <h2 className="text-lg font-bold tracking-tight text-gray-900">{cat.name}</h2>
                    {cat.description && <p className="text-xs text-gray-500">{cat.description}</p>}
                  </div>
                  <div className="mb-1 h-px flex-1 bg-[#e8ddca]" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {catItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      currency={venue.currency}
                      onClick={() => setSelectedItem(item)}
                    />
                  ))}
                </div>
              </section>
            )
          })
        )}
      </main>

      {/* Floating cart pill — visible when verified and cart has items */}
      {verified && itemCount > 0 && (
        <button
          onClick={onOpenCart}
          className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-brand-500 text-white rounded-full shadow-lg shadow-brand-500/30 px-5 py-3 hover:bg-brand-600 active:scale-95 transition-all"
          aria-label={`View cart — ${itemCount} items`}
        >
          <div className="relative">
            <ShoppingCart size={20} />
            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-white text-brand-600 text-[10px] font-bold flex items-center justify-center">
              {itemCount}
            </span>
          </div>
          <span className="font-semibold text-sm">View Cart</span>
          <span className="text-sm font-bold opacity-90">{formatCurrency(total, venue.currency)}</span>
        </button>
      )}

      {/* Bottom CTA — only shown when not verified (pre-session actions) */}
      {!verified && (
        <div className="fixed bottom-[4.5rem] md:bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur border-t border-gray-100 p-4 safe-bottom">
          {/* If they have items, show View Cart prominently — request happens in cart */}
          {itemCount > 0 && (
            <button
              onClick={onOpenCart}
              className="flex w-full items-center justify-between bg-brand-500 text-white rounded-xl px-4 py-3 font-medium hover:bg-brand-600 transition-colors mb-2"
            >
              <span className="flex items-center gap-2">
                <ShoppingCart size={18} />
                View Cart &amp; Order
              </span>
              <span className="font-bold">{formatCurrency(total, venue.currency)}</span>
            </button>
          )}
          {session?.is_active ? (
            <ActiveSessionChoice
              onJoin={onJoinTable}
              onNewGroup={handleRequest}
              requesting={requesting}
              kitchenOpen={venue.kitchen_open}
            />
          ) : (
            itemCount === 0 && (
              <Button
                fullWidth
                size="lg"
                onClick={handleRequest}
                loading={requesting}
                disabled={!venue.kitchen_open}
              >
                <Bell size={18} />
                {venue.kitchen_open ? 'Request to Order' : 'Kitchen Closed'}
              </Button>
            )
          )}
        </div>
      )}

      {/* Item detail modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          options={optionsByItem.get(selectedItem.id) ?? []}
          venue={venue}
          verified={verified}
          onClose={() => setSelectedItem(null)}
          onRequestToOrder={handleRequest}
        />
      )}
    </div>
  )
}

function MenuItemCard({
  item,
  currency,
  onClick,
}: {
  item: MenuItem
  currency: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full overflow-hidden text-left rounded-xl bg-white border border-[#eadfca] shadow-sm',
        'active:scale-[0.98] transition-transform',
        !item.available && 'opacity-60'
      )}
      aria-label={`${item.name}, ${formatCurrency(item.price, currency)}`}
    >
      {item.image_url ? (
        <img
          src={item.image_url}
          alt={item.name}
          className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          loading="lazy"
        />
      ) : (
        <div className="h-36 w-full bg-gray-100 flex items-center justify-center text-2xl">
          <UtensilsCrossed size={36} className="text-gray-400" />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-1">
          <p className="font-bold text-gray-900 text-sm leading-tight">{item.name}</p>
          {!item.available && (
            <Badge variant="red" className="shrink-0 text-[10px]">86'd</Badge>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
        )}
        {item.allergens && item.allergens.length > 0 && (
          <p className="text-[10px] text-gray-400 mt-1"><AlertTriangle size={11} className="inline mr-1" />{item.allergens.join(', ')}</p>
        )}
        <div className="flex items-center justify-between mt-1.5">
          <div>
            <span className="block text-base font-bold text-brand-600">{formatCurrency(item.price, currency)}</span>
            {item.prep_time_min && <span className="text-[10px] text-gray-400">~{item.prep_time_min} min</span>}
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm" aria-hidden="true">
            <span className="text-xl font-light leading-none">+</span>
          </span>
        </div>
      </div>
    </button>
  )
}


// ── Active session choice component ───────────────────────────
// Shows when there's an active session but this device hasn't joined.
// The user must identify whether they belong to the existing group
// or are a new group sitting down.

function ActiveSessionChoice({
  onJoin, onNewGroup, requesting, kitchenOpen,
}: {
  onJoin: () => void
  onNewGroup: () => void
  requesting: boolean
  kitchenOpen: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (!expanded) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-center text-gray-500 font-medium">
          This table already has an active session
        </p>
        <div className="flex gap-2">
          <Button
            fullWidth
            size="lg"
            onClick={() => setExpanded(true)}
            disabled={!kitchenOpen}
          >
            <Users size={18} />
            {kitchenOpen ? 'What brings you here?' : 'Kitchen Closed'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-900">Who are you?</p>
        <p className="text-xs text-gray-400 mt-0.5">This helps us seat you correctly</p>
      </div>

      {/* Option 1 — Joining existing group */}
      <button
        onClick={onJoin}
        disabled={!kitchenOpen}
        className="w-full flex items-start gap-3 rounded-2xl border-2 border-brand-500 bg-brand-50 px-4 py-3 text-left active:scale-[0.98] transition-all disabled:opacity-50"
      >
        <div className="h-9 w-9 rounded-full bg-brand-500 flex items-center justify-center shrink-0 mt-0.5">
          <Users size={18} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-brand-700 text-sm">I'm with the group at this table</p>
          <p className="text-xs text-brand-500 mt-0.5">
            Your tablemate has a 4-digit code — enter it to join their session
          </p>
        </div>
      </button>

      {/* Option 2 — New group */}
      <button
        onClick={onNewGroup}
        disabled={!kitchenOpen || requesting}
        className="w-full flex items-start gap-3 rounded-2xl border-2 border-gray-200 bg-white px-4 py-3 text-left active:scale-[0.98] transition-all hover:border-gray-300 disabled:opacity-50"
      >
        <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
          {requesting
            ? <div className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            : <Bell size={18} className="text-gray-600" />
          }
        </div>
        <div>
          <p className="font-semibold text-gray-800 text-sm">We just sat down — new group</p>
          <p className="text-xs text-gray-400 mt-0.5">
            We'll notify your waiter to come verify and seat your group
          </p>
        </div>
      </button>

      <button
        onClick={() => setExpanded(false)}
        className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
      >
        ← Back
      </button>
    </div>
  )
}
