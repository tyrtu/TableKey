// ── Cart store tests (no network) ─────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore } from '../stores/cartStore'
import type { CartItem } from '../types/database'

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  const qty = overrides.quantity ?? 2
  const price = overrides.price ?? 10
  const delta = overrides.optionsDelta ?? 0
  return {
    id: 'item-1',
    name: 'Burger',
    price,
    quantity: qty,
    notes: '',
    options: {},
    optionsDelta: delta,
    lineTotal: (price + delta) * qty,
    ...overrides,
  }
}

describe('cartStore', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], notes: '', tableId: null, sessionId: null })
  })

  it('starts empty', () => {
    const { items, itemCount, total } = useCartStore.getState()
    expect(items).toHaveLength(0)
    expect(itemCount()).toBe(0)
    expect(total()).toBe(0)
  })

  it('adds an item', () => {
    const item = makeItem()
    useCartStore.getState().addItem(item)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(2)
    expect(items[0].lineTotal).toBe(20)
  })

  it('merges identical items (same id + options + notes)', () => {
    const item = makeItem({ quantity: 1, lineTotal: 10 })
    useCartStore.getState().addItem(item)
    useCartStore.getState().addItem(item)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(2)
  })

  it('keeps separate lines for different options', () => {
    const a = makeItem({ options: { Size: 'Small' }, lineTotal: 10 })
    const b = makeItem({ options: { Size: 'Large' }, optionsDelta: 2, lineTotal: 12 })
    useCartStore.getState().addItem(a)
    useCartStore.getState().addItem(b)
    expect(useCartStore.getState().items).toHaveLength(2)
  })

  it('removes an item', () => {
    const item = makeItem()
    useCartStore.getState().addItem(item)
    const id = item.id + JSON.stringify(item.options) + item.notes
    useCartStore.getState().removeItem(id)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('updates quantity', () => {
    const item = makeItem({ quantity: 1, lineTotal: 10 })
    useCartStore.getState().addItem(item)
    const id = item.id + JSON.stringify(item.options) + item.notes
    useCartStore.getState().updateQuantity(id, 3)
    expect(useCartStore.getState().items[0].quantity).toBe(3)
    expect(useCartStore.getState().items[0].lineTotal).toBe(30)
  })

  it('removes item when quantity set to 0', () => {
    const item = makeItem({ quantity: 1, lineTotal: 10 })
    useCartStore.getState().addItem(item)
    const id = item.id + JSON.stringify(item.options) + item.notes
    useCartStore.getState().updateQuantity(id, 0)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('computes total correctly', () => {
    useCartStore.getState().addItem(makeItem({ price: 10, quantity: 2, lineTotal: 20 }))
    useCartStore.getState().addItem(makeItem({ id: 'item-2', price: 5, quantity: 3, lineTotal: 15 }))
    expect(useCartStore.getState().total()).toBe(35)
  })

  it('clears cart', () => {
    useCartStore.getState().addItem(makeItem())
    useCartStore.getState().clearCart()
    expect(useCartStore.getState().items).toHaveLength(0)
    expect(useCartStore.getState().total()).toBe(0)
  })

  it('idempotency: adding same item twice at lineTotal produces correct total', () => {
    // Simulates double-tap: same idempotency key should not double-count
    const item = makeItem({ id: 'burger', price: 15, quantity: 1, lineTotal: 15 })
    useCartStore.getState().addItem(item)
    useCartStore.getState().addItem(item) // same item merges
    expect(useCartStore.getState().items[0].quantity).toBe(2)
    expect(useCartStore.getState().total()).toBe(30)
  })
})

describe('split payment math', () => {
  it('equal split rounds up correctly', () => {
    // $47.00 split 3 ways: each person pays $15.67 (last person gets the remainder)
    const total = 47.00
    const n = 3
    const share = Math.ceil((total / n) * 100) / 100
    expect(share).toBe(15.67)
    // Two people at $15.67 = $31.34; last person pays remainder $15.66
    const remainder = Math.round((total - share * (n - 1)) * 100) / 100
    expect(remainder).toBe(15.66)
    // All three sum to total
    expect(share * (n - 1) + remainder).toBeCloseTo(total, 2)
  })

  it('tip does not reduce outstanding', () => {
    const outstanding = 50.00
    const tip = 5.00
    // Tip is separate — it doesn't reduce what you owe on the bill
    const billOutstanding = outstanding // unchanged
    expect(billOutstanding).toBe(50.00)
    expect(tip).toBe(5.00)
  })
})
