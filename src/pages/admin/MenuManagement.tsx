import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, EyeOff, Eye, GripVertical, X, Copy, ChevronDown, ChevronRight, Search, UtensilsCrossed } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getMenu, upsertMenuItem, deleteMenuItem,
  upsertCategory, deleteCategory, toggleItemAvailability, getStations,
} from '../../lib/api'
import { getSupabase } from '../../lib/supabase'
import { formatCurrency, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Badge } from '../../components/ui/Badge'
import { Toggle } from '../../components/ui/Toggle'
import { Spinner } from '../../components/ui/Spinner'
import { Tabs, TabPanel } from '../../components/ui/Tabs'
import type { MenuItem, MenuCategory, ItemOption, ItemOptionChoice, KitchenStation } from '../../types/database'

interface Props { venueId: string }

export default function MenuManagement({ venueId }: Props) {
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [stations, setStations] = useState<KitchenStation[]>([])
  const [loading, setLoading] = useState(true)
  // Two-level layout: selected category drives the item panel
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [itemSearch, setItemSearch] = useState('')

  // Modals
  const [catModal, setCatModal] = useState<{ open: boolean; editing?: MenuCategory }>({ open: false })
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: MenuItem; categoryId?: string }>({ open: false })
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<MenuItem | null>(null)
  const [deleteCatConfirm, setDeleteCatConfirm] = useState<MenuCategory | null>(null)
  const [deletingItem, setDeletingItem] = useState(false)
  const [deletingCat, setDeletingCat] = useState(false)

  const load = async () => {
    setLoading(true)
    const [data, stns] = await Promise.all([getMenu(venueId), getStations(venueId)])
    setCategories(data.categories)
    setItems(data.items)
    setStations(stns)
    // Auto-select first category
    if (data.categories.length > 0) setSelectedCatId(prev => prev ?? data.categories[0].id)
    setLoading(false)
  }

  useEffect(() => { load() }, [venueId])

  const handleToggleAvailability = async (item: MenuItem) => {
    await toggleItemAvailability(item.id, !item.available)
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, available: !item.available } : i))
    )
    toast.success(item.available ? `"${item.name}" marked as unavailable` : `"${item.name}" is available again`)
  }

  // #5: 86-all items in a category
  const handleToggleAllAvailability = async (cat: MenuCategory, makeAvailable: boolean) => {
    const catItems = items.filter(i => i.category_id === cat.id)
    await Promise.all(catItems.map(i => toggleItemAvailability(i.id, makeAvailable)))
    setItems(prev => prev.map(i => i.category_id === cat.id ? { ...i, available: makeAvailable } : i))
    toast.success(makeAvailable ? `All items in "${cat.name}" available` : `All items in "${cat.name}" 86'd`)
  }

  const handleDeleteItem = async () => {
    if (!deleteItemConfirm) return
    setDeletingItem(true)
    try {
      await deleteMenuItem(deleteItemConfirm.id)
      setItems((prev) => prev.filter((i) => i.id !== deleteItemConfirm.id))
      toast.success('Item deleted.')
    } catch { toast.error('Failed to delete item.') }
    finally { setDeletingItem(false); setDeleteItemConfirm(null) }
  }

  const handleDeleteCat = async () => {
    if (!deleteCatConfirm) return
    setDeletingCat(true)
    try {
      await deleteCategory(deleteCatConfirm.id)
      setCategories((prev) => prev.filter((c) => c.id !== deleteCatConfirm.id))
      setItems((prev) => prev.filter((i) => i.category_id !== deleteCatConfirm.id))
      if (selectedCatId === deleteCatConfirm.id) { setSelectedCatId(categories[0]?.id ?? null); setItemSearch('') }
      toast.success('Category deleted.')
    } catch { toast.error('Failed to delete category.') }
    finally { setDeletingCat(false); setDeleteCatConfirm(null) }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const selectedCat = categories.find(c => c.id === selectedCatId) ?? null
  const selectedItems = items.filter(i => i.category_id === selectedCatId)
  const allUnavailable = selectedItems.length > 0 && selectedItems.every(i => !i.available)

  // Filter items within selected category by search query
  const filteredItems = itemSearch.trim()
    ? selectedItems.filter(i =>
        i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        i.description?.toLowerCase().includes(itemSearch.toLowerCase())
      )
    : selectedItems

  return (
    <div className="pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Menu management</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 mt-1">Menu</h2>
          <p className="text-sm text-gray-500 mt-1">{categories.length} categories · {items.length} items. Organize what guests can order.</p>
        </div>
        <Button onClick={() => setCatModal({ open: true })}>
          <Plus size={16} /> Add Category
        </Button>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No menu categories yet. Add one to get started.</p>
        </div>
      ) : (
        /* Two-panel layout: category list left, items right */
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-start">

          {/* Category list panel — scrollable when many categories */}
          <div className="w-full lg:w-52 shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden lg:sticky lg:top-4">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/70">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Categories</p>
            </div>
            <div className="overflow-y-auto max-h-52 lg:max-h-[calc(100vh-15rem)]">
              {categories.map((cat) => {
                const count = items.filter(i => i.category_id === cat.id).length
                const active = selectedCatId === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setSelectedCatId(cat.id); setItemSearch('') }}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-3 text-sm text-left transition-colors border-b border-gray-100 last:border-b-0 border-l-2',
                      active
                        ? 'bg-brand-50 text-brand-700 font-semibold border-l-brand-500'
                        : 'text-gray-700 hover:bg-gray-50 border-l-transparent'
                    )}
                  >
                    <span className="truncate">{cat.name}</span>
                    <span className={cn(
                      'text-[10px] font-bold rounded-full px-1.5 py-0.5 ml-1 shrink-0',
                      active ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500'
                    )}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Item panel — fixed height, scrolls independently */}
          <div className="flex-1 min-w-0">
            {selectedCat && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 11rem)' }}>

                {/* Category header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-gray-50/70 border-b border-gray-200 shrink-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{selectedCat.name}</p>
                    {selectedCat.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{selectedCat.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {selectedItems.length > 0 && (
                      <button
                        onClick={() => handleToggleAllAvailability(selectedCat, allUnavailable)}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-md border transition-colors border-gray-200 text-gray-500 hover:bg-yellow-50 hover:border-yellow-200 hover:text-yellow-700"
                        title={allUnavailable ? 'Mark all available' : '86 all items'}
                      >
                        {allUnavailable ? <Eye size={11} /> : <EyeOff size={11} />}
                        {allUnavailable ? 'Restore all' : '86 all'}
                      </button>
                    )}
                    <button
                      onClick={() => setCatModal({ open: true, editing: selectedCat })}
                      className="p-1.5 rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteCatConfirm(selectedCat)}
                      className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setItemModal({ open: true, categoryId: selectedCat.id })}
                    >
                      <Plus size={13} /> Item
                    </Button>
                  </div>
                </div>

                {/* Search bar — only shown when category has enough items to warrant it */}
                {selectedItems.length > 0 && (
                  <div className="px-4 py-2 border-b border-gray-100 shrink-0">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="search"
                        value={itemSearch}
                        onChange={e => setItemSearch(e.target.value)}
                        placeholder={`Search ${selectedItems.length} items…`}
                        className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {itemSearch && (
                        <button
                          onClick={() => setItemSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Scrollable item list */}
                <div className="overflow-y-auto flex-1">
                  {filteredItems.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                      {itemSearch ? `No items match "${itemSearch}"` : 'No items in this category.'}
                    </p>
                  ) : (
                    filteredItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-gray-50/70 transition-colors ${idx < filteredItems.length - 1 ? 'border-b border-gray-100' : ''}`}
                      >
                        <GripVertical size={15} className="text-gray-300 shrink-0 cursor-grab" />
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="h-12 w-12 rounded-md object-cover shrink-0" />
                        ) : (
                          <div className="h-12 w-12 rounded-md bg-gray-100 text-gray-400 flex items-center justify-center shrink-0">
                            <UtensilsCrossed size={20} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 text-sm">{item.name}</span>
                            {!item.available && <Badge variant="red" className="text-[10px]">86'd</Badge>}
                          </div>
                          {item.description && (
                            <p className="text-xs text-gray-500 truncate">{item.description}</p>
                          )}
                          {(item as MenuItem & { station_id?: string }).station_id && (
                            <p className="text-[10px] text-blue-500">
                              {stations.find(s => s.id === (item as MenuItem & { station_id?: string }).station_id)?.name ?? 'Station'}
                            </p>
                          )}
                        </div>
                        <span className="font-semibold text-sm text-gray-900 shrink-0 min-w-[4.5rem] text-right">
                          {formatCurrency(item.price)}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0 pl-2 sm:pl-3 sm:border-l sm:border-gray-200">
                          <button
                            onClick={() => handleToggleAvailability(item)}
                            className={`p-1.5 rounded-md transition-colors ${item.available ? 'text-gray-400 hover:bg-yellow-50 hover:text-yellow-600' : 'text-emerald-500 hover:bg-emerald-50'}`}
                            title={item.available ? 'Mark as unavailable (86)' : 'Mark as available'}
                          >
                            {item.available ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button
                            onClick={() => setItemModal({
                              open: true,
                              categoryId: item.category_id,
                              editing: { ...item, id: '', name: `${item.name} (copy)` } as MenuItem,
                            })}
                            className="p-1.5 rounded-md text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                            title="Duplicate item"
                          >
                            <Copy size={15} />
                          </button>
                          <button
                            onClick={() => setItemModal({ open: true, editing: item, categoryId: item.category_id })}
                            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                            aria-label="Edit item"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteItemConfirm(item)}
                            className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                            aria-label="Delete item"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer: item count / search result count */}
                <div className="shrink-0 px-5 py-2.5 border-t border-gray-200 bg-gray-50/70 flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {itemSearch
                      ? `${filteredItems.length} of ${selectedItems.length} items`
                      : `${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}`}
                  </span>
                  {itemSearch && (
                    <button onClick={() => setItemSearch('')} className="text-xs text-brand-600 hover:text-brand-700">
                      Clear search
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category modal */}
      <CategoryModal
        open={catModal.open}
        editing={catModal.editing}
        venueId={venueId}
        stations={stations}
        onClose={() => setCatModal({ open: false })}
        onSaved={(cat) => {
          setCategories((prev) => {
            const idx = prev.findIndex((c) => c.id === cat.id)
            return idx >= 0 ? prev.map((c) => c.id === cat.id ? cat : c) : [...prev, cat]
          })
          setCatModal({ open: false })
        }}
      />

      {/* Item modal */}
      <ItemModal
        open={itemModal.open}
        editing={itemModal.editing}
        categoryId={itemModal.categoryId ?? ''}
        venueId={venueId}
        stations={stations}
        onClose={() => setItemModal({ open: false })}
        onSaved={(item) => {
          setItems((prev) => {
            const idx = prev.findIndex((i) => i.id === item.id)
            return idx >= 0 ? prev.map((i) => i.id === item.id ? item : i) : [...prev, item]
          })
          setItemModal({ open: false })
        }}
      />

      {/* Delete confirmations */}
      <ConfirmDialog
        open={!!deleteItemConfirm}
        onClose={() => setDeleteItemConfirm(null)}
        onConfirm={handleDeleteItem}
        title="Delete item?"
        message={`"${deleteItemConfirm?.name}" will be permanently removed from the menu.`}
        confirmLabel="Delete"
        loading={deletingItem}
      />
      <ConfirmDialog
        open={!!deleteCatConfirm}
        onClose={() => setDeleteCatConfirm(null)}
        onConfirm={handleDeleteCat}
        title="Delete category?"
        message={`"${deleteCatConfirm?.name}" and all its items will be permanently deleted.`}
        confirmLabel="Delete Category"
        loading={deletingCat}
      />
    </div>
  )
}

// ── Category Modal ────────────────────────────────────────────

function CategoryModal({ open, editing, venueId, stations, onClose, onSaved }: {
  open: boolean
  editing?: MenuCategory
  venueId: string
  stations: KitchenStation[]
  onClose: () => void
  onSaved: (cat: MenuCategory) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [stationId, setStationId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setDescription(editing?.description ?? '')
      setStationId((editing as MenuCategory & { station_id?: string })?.station_id ?? '')
    }
  }, [open, editing])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const saved = await upsertCategory({
        ...(editing ?? {}),
        venue_id: venueId,
        name: name.trim(),
        description: description.trim() || null,
        station_id: stationId || null,
      } as Parameters<typeof upsertCategory>[0])
      onSaved(saved as MenuCategory)
      toast.success(editing ? 'Category updated.' : 'Category created.')
    } catch { toast.error('Failed to save category.') }
    finally { setSaving(false) }
  }

  const stationOptions = [
    { value: '', label: 'Default station' },
    ...stations.map(s => ({ value: s.id, label: s.name })),
  ]

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Category' : 'New Category'} size="sm">
      <div className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Starters" autoFocus />
        <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
        {stations.length > 0 && (
          <Select
            label="Default kitchen station"
            value={stationId}
            onChange={e => setStationId(e.target.value)}
            options={stationOptions}
          />
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!name.trim()}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Item Modal (with Options tab) ────────────────────────────

function ItemModal({ open, editing, categoryId, venueId, stations, onClose, onSaved }: {
  open: boolean
  editing?: MenuItem
  categoryId: string
  venueId: string
  stations: KitchenStation[]
  onClose: () => void
  onSaved: (item: MenuItem) => void
}) {
  const [tab, setTab] = useState('details')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [prepTime, setPrepTime] = useState('')
  const [allergens, setAllergens] = useState('')
  const [stationId, setStationId] = useState<string>('')
  const [available, setAvailable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [savedItemId, setSavedItemId] = useState<string | null>(null)

  // Options state — loaded after item is saved/editing
  const [options, setOptions] = useState<(ItemOption & { choices: ItemOptionChoice[] })[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)

  const itemId = editing?.id ?? savedItemId

  useEffect(() => {
    if (open) {
      setTab('details')
      setName(editing?.name ?? '')
      setDescription(editing?.description ?? '')
      setPrice(editing?.price != null ? String(editing.price) : '')
      setImageUrl(editing?.image_url ?? '')
      setPrepTime(editing?.prep_time_min != null ? String(editing.prep_time_min) : '')
      setAllergens(editing?.allergens?.join(', ') ?? '')
      setStationId((editing as MenuItem & { station_id?: string })?.station_id ?? '')
      setAvailable(editing?.available ?? true)
      setErrors({})
      setSavedItemId(null)
    }
  }, [open, editing])

  // Load options when we have an item id and switch to options tab
  useEffect(() => {
    if (!itemId || tab !== 'options') return
    setLoadingOptions(true)
    getSupabase()
      .from('item_options')
      .select('*, choices:item_option_choices(*)')
      .eq('item_id', itemId)
      .order('sort_order')
      .then(({ data }) => {
        setOptions((data ?? []) as (ItemOption & { choices: ItemOptionChoice[] })[])
        setLoadingOptions(false)
      })
  }, [itemId, tab])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required.'
    const p = parseFloat(price)
    if (isNaN(p) || p < 0) errs.price = 'Enter a valid price.'
    return errs
  }

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const saved = await upsertMenuItem({
        ...(editing ?? {}),
        venue_id: venueId,
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || null,
        price: parseFloat(price),
        image_url: imageUrl.trim() || null,
        prep_time_min: prepTime ? parseInt(prepTime) : null,
        allergens: allergens ? allergens.split(',').map((a) => a.trim()).filter(Boolean) : null,
        station_id: stationId || null,
        available,
      } as Parameters<typeof upsertMenuItem>[0])
      setSavedItemId((saved as MenuItem).id)
      onSaved(saved as MenuItem)
      toast.success(editing ? 'Item updated.' : 'Item created.')
      // Switch to options tab after saving a new item
      if (!editing) setTab('options')
    } catch { toast.error('Failed to save item.') }
    finally { setSaving(false) }
  }

  const handleAddOptionGroup = async () => {
    if (!itemId) return
    const { data, error } = await getSupabase()
      .from('item_options')
      .insert({
        item_id: itemId,
        group_name: 'New option group',
        required: false,
        multi_select: false,
        min_selections: 0,
        max_selections: null,
        sort_order: options.length,
      })
      .select()
      .single()
    if (!error && data) {
      setOptions(prev => [...prev, { ...data, choices: [] } as ItemOption & { choices: ItemOptionChoice[] }])
    }
  }

  const handleUpdateGroup = async (
    groupId: string,
    updates: Partial<Pick<ItemOption, 'group_name' | 'required' | 'multi_select' | 'min_selections' | 'max_selections'>>
  ) => {
    await getSupabase().from('item_options').update(updates).eq('id', groupId)
    setOptions(prev => prev.map(o => o.id === groupId ? { ...o, ...updates } : o))
  }

  const handleDeleteGroup = async (groupId: string) => {
    await getSupabase().from('item_options').delete().eq('id', groupId)
    setOptions(prev => prev.filter(o => o.id !== groupId))
  }

  const handleAddChoice = async (groupId: string) => {
    const { data, error } = await getSupabase()
      .from('item_option_choices')
      .insert({ option_id: groupId, label: 'New choice', price_delta: 0, available: true, sort_order: 0 })
      .select()
      .single()
    if (!error && data) {
      setOptions(prev => prev.map(o => o.id === groupId
        ? { ...o, choices: [...(o.choices ?? []), data as ItemOptionChoice] }
        : o
      ))
    }
  }

  const handleUpdateChoice = async (
    groupId: string,
    choiceId: string,
    updates: Partial<Pick<ItemOptionChoice, 'label' | 'price_delta' | 'available' | 'is_default'>>
  ) => {
    await getSupabase().from('item_option_choices').update(updates).eq('id', choiceId)
    setOptions(prev => prev.map(o => o.id === groupId
      ? { ...o, choices: (o.choices ?? []).map(c => c.id === choiceId ? { ...c, ...updates } : c) }
      : o
    ))
  }

  const handleDeleteChoice = async (groupId: string, choiceId: string) => {
    await getSupabase().from('item_option_choices').delete().eq('id', choiceId)
    setOptions(prev => prev.map(o => o.id === groupId
      ? { ...o, choices: (o.choices ?? []).filter(c => c.id !== choiceId) }
      : o
    ))
  }

  const TABS = [
    { id: 'details', label: 'Details' },
    { id: 'options', label: `Options${options.length ? ` (${options.length})` : ''}` },
  ]

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Item' : 'New Item'} size="lg">
      {/* Only show tabs if item already exists or was just saved */}
      {itemId ? (
        <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-4 -mx-5 px-5" />
      ) : null}

      <TabPanel active={tab} id="details">
        <div className="space-y-4">
          <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price *" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} placeholder="0.00" />
            <Input label="Prep time (min)" type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} placeholder="e.g. 15" />
          </div>
          <Input label="Image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" type="url" />
          <Input label="Allergens (comma-separated)" value={allergens} onChange={(e) => setAllergens(e.target.value)} placeholder="gluten, dairy, nuts" />
          {stations.length > 0 && (
            <Select
              label="Kitchen station (override)"
              value={stationId}
              onChange={e => setStationId(e.target.value)}
              options={[
                { value: '', label: 'Use category default' },
                ...stations.map(s => ({ value: s.id, label: s.name })),
              ]}
            />
          )}
          <Toggle label="Available to order" checked={available} onChange={setAvailable} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>
              {editing ? 'Save Changes' : 'Create Item'}
            </Button>
          </div>
        </div>
      </TabPanel>

      <TabPanel active={tab} id="options">
        {!itemId ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-sm">Save the item first, then add option groups.</p>
          </div>
        ) : loadingOptions ? (
          <div className="flex justify-center py-6"><Spinner size="sm" /></div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Option groups let customers customise items — sizes, extras, preparation style, etc.
            </p>

            {options.map(group => (
              <OptionGroupEditor
                key={group.id}
                group={group}
                onUpdateGroup={(u) => handleUpdateGroup(group.id, u)}
                onDeleteGroup={() => handleDeleteGroup(group.id)}
                onAddChoice={() => handleAddChoice(group.id)}
                onUpdateChoice={(cid, u) => handleUpdateChoice(group.id, cid, u)}
                onDeleteChoice={(cid) => handleDeleteChoice(group.id, cid)}
              />
            ))}

            <Button variant="secondary" fullWidth onClick={handleAddOptionGroup}>
              <Plus size={14} /> Add Option Group
            </Button>
          </div>
        )}
      </TabPanel>
    </Modal>
  )
}

// ── Option Group Editor ───────────────────────────────────────

function OptionGroupEditor({
  group, onUpdateGroup, onDeleteGroup, onAddChoice, onUpdateChoice, onDeleteChoice,
}: {
  group: ItemOption & { choices: ItemOptionChoice[] }
  onUpdateGroup: (u: Partial<Pick<ItemOption, 'group_name' | 'required' | 'multi_select' | 'min_selections' | 'max_selections'>>) => void
  onDeleteGroup: () => void
  onAddChoice: () => void
  onUpdateChoice: (choiceId: string, u: Partial<Pick<ItemOptionChoice, 'label' | 'price_delta' | 'available' | 'is_default'>>) => void
  onDeleteChoice: (choiceId: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [nameVal, setNameVal] = useState(group.group_name)

  const commitName = () => {
    if (nameVal.trim() && nameVal !== group.group_name) {
      onUpdateGroup({ group_name: nameVal.trim() })
    }
  }

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
        <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 shrink-0">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <input
          className="flex-1 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none"
          value={nameVal}
          onChange={e => setNameVal(e.target.value)}
          onBlur={commitName}
        />
        <div className="flex items-center gap-3 shrink-0">
          <Toggle
            label="Required"
            checked={group.required}
            onChange={v => onUpdateGroup({ required: v })}
          />
          <Toggle
            label="Multi-select"
            checked={group.multi_select}
            onChange={v => onUpdateGroup({ multi_select: v })}
          />
        </div>
        <button onClick={onDeleteGroup} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors ml-1">
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Min / Max selections */}
          {group.multi_select && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">Min selections</label>
                <input
                  type="number" min="0" max="99"
                  value={group.min_selections ?? 0}
                  onChange={e => onUpdateGroup({ min_selections: parseInt(e.target.value) || 0 })}
                  className="w-full h-8 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">Max selections (blank = unlimited)</label>
                <input
                  type="number" min="1" max="99"
                  value={group.max_selections ?? ''}
                  onChange={e => onUpdateGroup({ max_selections: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="∞"
                  className="w-full h-8 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          )}

          {/* Choices */}
          <div className="space-y-2">
            {(group.choices ?? []).map(choice => (
              <div key={choice.id} className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2',
                choice.available ? 'border-gray-100 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
              )}>
                <input
                  className="flex-1 text-sm text-gray-900 focus:outline-none bg-transparent"
                  value={choice.label}
                  onChange={e => onUpdateChoice(choice.id, { label: e.target.value })}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-400">+</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={choice.price_delta}
                    onChange={e => onUpdateChoice(choice.id, { price_delta: parseFloat(e.target.value) || 0 })}
                    className="w-16 h-7 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 text-right"
                  />
                  <Toggle
                    checked={choice.available}
                    onChange={v => onUpdateChoice(choice.id, { available: v })}
                  />
                  <button
                    onClick={() => onUpdateChoice(choice.id, { is_default: !choice.is_default })}
                    title="Set as default"
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors',
                      choice.is_default ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    )}
                  >
                    {choice.is_default ? 'Default' : 'Set default'}
                  </button>
                  <button onClick={() => onDeleteChoice(choice.id)}
                    className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors">
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onAddChoice}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            <Plus size={13} /> Add choice
          </button>
        </div>
      )}
    </div>
  )
}
