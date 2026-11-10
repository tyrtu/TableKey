import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from '../types/database'

interface CartState {
  items: CartItem[]
  tableId: string | null
  sessionId: string | null
  notes: string
  addItem: (item: CartItem) => void
  removeItem: (cartItemId: string) => void
  updateQuantity: (cartItemId: string, quantity: number) => void
  updateNotes: (notes: string) => void
  clearCart: () => void
  setContext: (tableId: string, sessionId: string) => void
  total: () => number
  itemCount: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      tableId: null,
      sessionId: null,
      notes: '',

      addItem: (item) => {
        const items = get().items
        // Merge if same id + same options + same notes
        const existing = items.find(
          (i) =>
            i.id === item.id &&
            JSON.stringify(i.options) === JSON.stringify(item.options) &&
            i.notes === item.notes
        )
        if (existing) {
          set({
            items: items.map((i) =>
              i === existing
                ? {
                    ...i,
                    quantity: i.quantity + item.quantity,
                    lineTotal: (i.quantity + item.quantity) * (i.price + i.optionsDelta),
                  }
                : i
            ),
          })
        } else {
          set({ items: [...items, item] })
        }
      },

      removeItem: (cartItemId) => {
        set({ items: get().items.filter((i) => i.id + JSON.stringify(i.options) + i.notes !== cartItemId) })
      },

      updateQuantity: (cartItemId, quantity) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((i) => i.id + JSON.stringify(i.options) + i.notes !== cartItemId) })
          return
        }
        set({
          items: get().items.map((i) => {
            if (i.id + JSON.stringify(i.options) + i.notes !== cartItemId) return i
            return { ...i, quantity, lineTotal: quantity * (i.price + i.optionsDelta) }
          }),
        })
      },

      updateNotes: (notes) => set({ notes }),
      clearCart: () => set({ items: [], notes: '' }),
      setContext: (tableId, sessionId) => set({ tableId, sessionId }),
      total: () => get().items.reduce((s, i) => s + i.lineTotal, 0),
      itemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
    }),
    {
      name: 'tk_cart',
      // Don't persist tableId/sessionId across different sessions
      partialize: (state) => ({ items: state.items, notes: state.notes }),
    }
  )
)
