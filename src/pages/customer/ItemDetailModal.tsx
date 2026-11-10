import { useState, useMemo } from 'react'
import { Minus, Plus, Bell, UtensilsCrossed } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { formatCurrency } from '../../lib/utils'
import { useCartStore } from '../../stores/cartStore'
import type { MenuItem, ItemOption, Venue } from '../../types/database'
import type { CartItem } from '../../types/database'

interface Props {
  item: MenuItem
  options: ItemOption[]
  venue: Venue
  verified: boolean
  onClose: () => void
  onRequestToOrder: () => void
}

export function ItemDetailModal({ item, options, venue, verified, onClose, onRequestToOrder }: Props) {
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const addItem = useCartStore((s) => s.addItem)

  const optionsDelta = useMemo(() => {
    let delta = 0
    for (const opt of options) {
      const chosenLabel = selectedOptions[opt.group_name]
      if (chosenLabel) {
        const choice = opt.choices?.find((c) => c.label === chosenLabel)
        if (choice) delta += choice.price_delta
      }
    }
    return delta
  }, [options, selectedOptions])

  const lineTotal = (item.price + optionsDelta) * quantity

  const requiredMissing = options.some(
    (opt) => opt.required && !selectedOptions[opt.group_name]
  )

  const handleAdd = () => {
    if (!item.available) return
    const cartItem: CartItem = {
      id: item.id,
      name: item.name,
      price: item.price,
      quantity,
      notes,
      options: { ...selectedOptions },
      optionsDelta,
      lineTotal,
    }
    addItem(cartItem)
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="md">
      {/* Item image */}
      {item.image_url ? (
        <img
          src={item.image_url}
          alt={item.name}
          className="w-full h-48 object-cover rounded-xl mb-4 -mt-1"
        />
      ) : (
        <div className="w-full h-32 rounded-xl bg-gray-100 flex items-center justify-center text-5xl mb-4 -mt-1">
          <UtensilsCrossed size={40} className="text-gray-400" />
        </div>
      )}

      {/* Info */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h2 className="text-xl font-bold text-gray-900">{item.name}</h2>
        {!item.available && <Badge variant="red">86'd</Badge>}
      </div>
      {item.description && <p className="text-sm text-gray-500 mb-3">{item.description}</p>}
      <p className="text-lg font-bold text-brand-600 mb-4">
        {formatCurrency(item.price, venue.currency)}
        {optionsDelta > 0 && (
          <span className="text-sm text-gray-400 ml-1">+{formatCurrency(optionsDelta, venue.currency)}</span>
        )}
      </p>

      {/* Allergens */}
      {item.allergens && item.allergens.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100">
          <p className="text-xs text-amber-700 font-medium">Contains: {item.allergens.join(', ')}</p>
        </div>
      )}

      {/* Options */}
      {options.map((opt) => (
        <div key={opt.id} className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <p className="text-sm font-semibold text-gray-900">{opt.group_name}</p>
            {opt.required && (
              <span className="text-[10px] bg-brand-100 text-brand-700 rounded-full px-1.5 py-0.5 font-medium">Required</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(opt.choices ?? []).map((choice) => (
              <button
                key={choice.id}
                onClick={() =>
                  setSelectedOptions((prev) => ({
                    ...prev,
                    [opt.group_name]: prev[opt.group_name] === choice.label ? '' : choice.label,
                  }))
                }
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  selectedOptions[opt.group_name] === choice.label
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {choice.label}
                {choice.price_delta > 0 && (
                  <span className="ml-1 text-xs text-gray-400">+{formatCurrency(choice.price_delta, venue.currency)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Notes */}
      <div className="mb-4">
        <Textarea
          label="Special instructions (optional)"
          placeholder="e.g. no onions, extra sauce, allergy info…"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={200}
        />
      </div>

      {/* Quantity + Add */}
      {!verified ? (
        <div className="space-y-2">
          <p className="text-xs text-center text-gray-500">Request to order first, then add items to your cart.</p>
          <Button fullWidth variant="secondary" onClick={onRequestToOrder}>
            <Bell size={16} />
            Request to Order
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-2 py-1">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Decrease quantity"
            >
              <Minus size={16} />
            </button>
            <span className="w-6 text-center font-semibold text-sm">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Increase quantity"
            >
              <Plus size={16} />
            </button>
          </div>
          <Button
            fullWidth
            onClick={handleAdd}
            disabled={!item.available || requiredMissing}
          >
            Add · {formatCurrency(lineTotal, venue.currency)}
          </Button>
        </div>
      )}

      {requiredMissing && item.available && (
        <p className="text-xs text-red-500 mt-2 text-center">Please select all required options.</p>
      )}
    </Modal>
  )
}
