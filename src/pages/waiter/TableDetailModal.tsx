import { useState, useEffect } from 'react'
import { RefreshCw, Smartphone, ShieldOff, UtensilsCrossed, Plus, Minus, Trash2, AlertTriangle, Lock, X, CheckCircle2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { TableStatusBadge } from '../../components/ui/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { Tabs, TabPanel } from '../../components/ui/Tabs'
import { Badge } from '../../components/ui/Badge'
import { supabase } from '../../lib/supabase'
import { getSupabase } from '../../lib/supabase'
import { revokeDevice, regenerateCode, confirmPresence, getMenu, placeOrderAsWaiter } from '../../lib/api'
import { formatCurrency, formatTime, elapsedLabel, cn } from '../../lib/utils'
import { getIdempotencyKey } from '../../lib/device'
import { BillView } from './BillView'
import toast from 'react-hot-toast'
import type { TableWithSession } from '../../hooks/useTables'
import type { SessionDevice, MenuItem, WaiterOrderItem } from '../../types/database'

interface Props {
  table: TableWithSession
  onClose: () => void
  onCloseSession: () => void
  onRegenCode: () => void
  venueId: string | null
  staffId: string | null
  currency?: string
}

export function TableDetailModal({ table, onClose, onCloseSession, onRegenCode, venueId, staffId, currency = 'USD' }: Props) {
  const [tab, setTab] = useState('code')
  const [devices, setDevices] = useState<SessionDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [confirmingPresence, setConfirmingPresence] = useState(false)

  const session = table.active_session
  const [presenceConfirmedUntil, setPresenceConfirmedUntil] = useState<string | null>(
    session?.presence_confirmed_until ?? null
  )

  useEffect(() => {
    setPresenceConfirmedUntil(session?.presence_confirmed_until ?? null)
  }, [session?.id, session?.presence_confirmed_until])

  useEffect(() => {
    if (!session) return
    setLoadingDevices(true)
    supabase
      .from('session_devices')
      .select('*')
      .eq('session_id', session.id)
      .eq('is_active', true)
      .order('joined_at')
      .then(({ data }) => {
        setDevices(data ?? [])
        setLoadingDevices(false)
      })
  }, [session])

  const handleRevokeDevice = async (device: SessionDevice) => {
    if (!venueId || !staffId || !session) return
    setRevokingId(device.id)
    try {
      await revokeDevice(device.id, session.id, venueId, staffId)
      setDevices(prev => prev.filter(d => d.id !== device.id))
      toast.success('Device removed from session.')
    } catch { toast.error('Failed to revoke device.') }
    finally { setRevokingId(null) }
  }

  const handleRegenCode = async () => {
    if (!session || !venueId || !staffId) return
    try {
      const { data: venue } = await getSupabase().from('venues').select('code_length').eq('id', venueId).single()
      const newCode = await regenerateCode(session.id, venueId, staffId, venue?.code_length ?? 4)
      toast.success(`New code: ${newCode.split('').join(' ')}`, { duration: 8000 })
    } catch { toast.error('Failed to regenerate code.') }
  }

  const handleConfirmPresence = async () => {
    if (!session || !venueId || !staffId) return
    setConfirmingPresence(true)
    try {
      const confirmedUntil = await confirmPresence(session.id, venueId, staffId)
      setPresenceConfirmedUntil(confirmedUntil)
      toast.success(`Presence confirmed until ${formatTime(confirmedUntil)}.`)
    } catch {
      toast.error('Could not confirm presence. Please try again.')
    } finally {
      setConfirmingPresence(false)
    }
  }

  const TABS = [
    { id: 'order', label: '+ Order' },
    { id: 'code', label: 'Code' },
    { id: 'bill', label: 'Bill' },
    { id: 'devices', label: `Devices${devices.length ? ` (${devices.length})` : ''}` },
  ]

  return (
    <Modal open onClose={onClose} title={`Table ${table.table_number}${table.label ? ` — ${table.label}` : ''}`} size="md">
      {/* Header row — status + elapsed */}
      <div className="flex items-center gap-2 mb-4">
        <TableStatusBadge status={table.status} />
        {session && (
          <span className="text-xs text-gray-500">
            Opened {elapsedLabel(session.opened_at)}
          </span>
        )}
      </div>

      {!session ? (
        <div className="text-center py-6 text-gray-400">
          <p className="text-sm">No active session. The table is available.</p>
        </div>
      ) : (
        <>
          {/* ── Presence banner ─────────────────────────────── */}
          {(() => {
            const isConfirmed = !!presenceConfirmedUntil && new Date(presenceConfirmedUntil) > new Date()
            return (
              <div className={cn(
                'flex items-center justify-between gap-3 rounded-2xl px-4 py-3 mb-4 border',
                isConfirmed
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              )}>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-xs font-bold', isConfirmed ? 'text-emerald-800' : 'text-amber-900')}>
                    {isConfirmed ? 'Presence confirmed' : 'Waiter presence'}
                  </p>
                  <p className={cn('text-xs mt-0.5', isConfirmed ? 'text-emerald-700' : 'text-amber-700')}>
                    {isConfirmed
                      ? `Valid until ${formatTime(presenceConfirmedUntil!)}`
                      : 'Not confirmed for this session'}
                  </p>
                </div>
                {!isConfirmed && (
                  <button
                    onClick={handleConfirmPresence}
                    disabled={confirmingPresence}
                    className="shrink-0 flex items-center gap-1.5 bg-[#E8590C] hover:bg-[#c94f1f] text-white text-xs font-bold rounded-xl px-3 py-2 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {confirmingPresence
                      ? <span className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <CheckCircle2 size={13} />
                    }
                    Confirm presence
                  </button>
                )}
                {isConfirmed && (
                  <button
                    onClick={handleConfirmPresence}
                    disabled={confirmingPresence}
                    className="shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
                  >
                    Extend
                  </button>
                )}
              </div>
            )
          })()}

          <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-4 -mx-5 px-5" />

          {/* ── Order tab ────────────────────────────────── */}
          <TabPanel active={tab} id="order">
            <WaiterOrderEntry
              session={session}
              venueId={venueId ?? ''}
              staffId={staffId ?? ''}
              currency={currency}
            />
          </TabPanel>

          {/* ── Code tab ─────────────────────────────────── */}
          <TabPanel active={tab} id="code">
            <div className="rounded-2xl bg-gray-950 px-5 py-5 mb-4">
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">Session Code</p>
                <button
                  onClick={handleRegenCode}
                  className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-xl px-3 py-1.5 transition-colors"
                >
                  <RefreshCw size={12} />
                  New Code
                </button>
              </div>
              {session.code_locked ? (
                <p className="text-red-400 font-semibold flex items-center gap-2">
                  <Lock size={14} /> Locked — too many wrong attempts
                </p>
              ) : session.current_code ? (
                <div className="flex items-center gap-3 mt-1">
                  {session.current_code.split('').map((digit, i) => (
                    <div key={i} className="flex items-center justify-center w-12 h-14 rounded-xl bg-gray-800 text-white text-4xl font-black font-mono">
                      {digit}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Code cleared</p>
              )}
              {session.code_expires_at && !session.code_locked && (
                <p className="text-xs text-gray-500 mt-2">Expires {formatTime(session.code_expires_at)}</p>
              )}
            </div>
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              Share this code with the requesting device so tablemates can join.
            </p>
          </TabPanel>

          {/* ── Bill tab ─────────────────────────────────── */}
          <TabPanel active={tab} id="bill">
            <BillView
              sessionId={session.id}
              tableNumber={table.table_number}
              venueId={venueId ?? ''}
              staffId={staffId ?? ''}
              currency={currency}
              onClose={onClose}
            />
          </TabPanel>

          {/* ── Devices tab ──────────────────────────────── */}
          <TabPanel active={tab} id="devices">
            {loadingDevices ? (
              <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            ) : devices.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No devices verified yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {devices.map(device => (
                  <div key={device.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Smartphone size={13} className="text-gray-400" />
                        <p className="text-sm font-medium text-gray-800">{device.device_label ?? 'Unknown'}</p>
                      </div>
                      <p className="text-xs text-gray-400 ml-5">Joined {elapsedLabel(device.joined_at)}</p>
                    </div>
                    <button
                      onClick={() => handleRevokeDevice(device)}
                      disabled={revokingId === device.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      aria-label="Revoke device"
                    >
                      {revokingId === device.id ? <Spinner size="sm" /> : <ShieldOff size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabPanel>

          {/* ── End party ────────────────────────────────── */}
          <div className="mt-5 border-t border-gray-100 pt-4">
            <button
              onClick={onCloseSession}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900 text-sm font-semibold py-3 transition-colors"
            >
              <CheckCircle2 size={16} className="text-gray-400" />
              End current party and reset table
            </button>
            <p className="mt-2 text-center text-xs text-gray-400 leading-relaxed">
              Use after payment is settled. Ends access for all current devices so a new party can start cleanly.
            </p>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── Waiter Order Entry ─────────────────────────────────────────

interface WaiterOrderEntryProps {
  session: { id: string; venue_id: string; table_id: string }
  venueId: string
  staffId: string
  currency: string
}

function WaiterOrderEntry({ session, venueId, staffId, currency }: WaiterOrderEntryProps) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<WaiterOrderItem[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [placing, setPlacing] = useState(false)

  // #5: config sheet for an item needing notes/allergy
  const [configItem, setConfigItem] = useState<MenuItem | null>(null)
  const [configQty, setConfigQty] = useState(1)
  const [configNote, setConfigNote] = useState('')
  const [allergyFlag, setAllergyFlag] = useState(false)
  const [allergyNote, setAllergyNote] = useState('')

  useEffect(() => {
    getMenu(venueId).then(data => {
      setMenuItems(data.items.filter(i => i.available))
      setLoading(false)
    })
  }, [venueId])

  const filtered = search
    ? menuItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : menuItems

  // #5: get current qty of an item already in draft
  const draftQty = (itemId: string) =>
    draft.filter(d => d.item_id === itemId).reduce((s, d) => s + d.quantity, 0)

  // #5: quick-add one unit of an item (no notes/allergy)
  const quickAdd = (item: MenuItem) => {
    setDraft(prev => {
      const idx = prev.findIndex(d => d.item_id === item.id && !d.notes && !d.allergy_flag)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
        return next
      }
      return [...prev, {
        item_id: item.id, item_name: item.name, item_price: item.price,
        quantity: 1, notes: '', options: {}, options_delta: 0,
        allergy_flag: false, allergy_note: '',
      }]
    })
  }

  // #5: decrement one unit
  const quickRemove = (item: MenuItem) => {
    setDraft(prev => {
      const idx = prev.findIndex(d => d.item_id === item.id && !d.notes && !d.allergy_flag)
      if (idx < 0) return prev
      const next = [...prev]
      if (next[idx].quantity <= 1) next.splice(idx, 1)
      else next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 }
      return next
    })
  }

  // Config sheet submit (notes / allergy)
  const addFromConfig = () => {
    if (!configItem) return
    setDraft(prev => {
      const draftItem: WaiterOrderItem = {
        item_id: configItem.id, item_name: configItem.name, item_price: configItem.price,
        quantity: configQty, notes: configNote, options: {}, options_delta: 0,
        allergy_flag: allergyFlag, allergy_note: allergyNote,
      }
      const idx = prev.findIndex(
        d => d.item_id === draftItem.item_id && d.notes === draftItem.notes &&
          d.allergy_flag === draftItem.allergy_flag
      )
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + configQty }
        return next
      }
      return [...prev, draftItem]
    })
    toast.success(`${configItem.name} added`)
    setConfigItem(null); setConfigNote(''); setAllergyFlag(false); setAllergyNote(''); setConfigQty(1)
  }

  const removeDraft = (idx: number) => setDraft(prev => prev.filter((_, i) => i !== idx))
  const draftTotal = draft.reduce((s, d) => s + d.item_price * d.quantity, 0)

  const handlePlaceOrder = async () => {
    if (draft.length === 0) return
    setPlacing(true)
    try {
      const result = await placeOrderAsWaiter(
        session.id, staffId, draft, orderNotes, getIdempotencyKey()
      )
      if (!result.success) { toast.error(result.message ?? 'Failed.'); return }
      toast.success(`Order ${result.order_number} sent to kitchen!`)
      setDraft([])
      setOrderNotes('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to place order.')
    } finally { setPlacing(false) }
  }

  if (loading) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>

  // #5: config sheet shown when user opens the settings control
  if (configItem) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-900">{configItem.name}</p>
            <p className="text-sm text-gray-500">{formatCurrency(configItem.price, currency)}</p>
          </div>
          <button onClick={() => setConfigItem(null)} className="text-gray-400 hover:text-gray-600 text-xs"><X size={13} className="inline mr-1" />Cancel</button>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-gray-700">Qty</p>
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-2 py-1">
            <button onClick={() => setConfigQty(q => Math.max(1, q - 1))} className="h-7 w-7 flex items-center justify-center hover:bg-gray-100 rounded"><Minus size={13} /></button>
            <span className="w-5 text-center text-sm font-medium">{configQty}</span>
            <button onClick={() => setConfigQty(q => q + 1)} className="h-7 w-7 flex items-center justify-center hover:bg-gray-100 rounded"><Plus size={13} /></button>
          </div>
        </div>
        <Input label="Item note" value={configNote} onChange={e => setConfigNote(e.target.value)} placeholder="e.g. no onions" />
        <div className="flex items-center gap-2">
          <input type="checkbox" id="af" checked={allergyFlag} onChange={e => setAllergyFlag(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400" />
          <label htmlFor="af" className="text-sm text-gray-700">Allergy flag</label>
        </div>
        {allergyFlag && (
          <Input label="Allergy note" value={allergyNote} onChange={e => setAllergyNote(e.target.value)} placeholder="e.g. nut allergy" />
        )}
        <Button fullWidth onClick={addFromConfig}>
          <Plus size={15} /> Add to Order
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Draft */}
      {draft.length > 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Order draft</p>
          {draft.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{item.quantity}× {item.item_name}</p>
                {item.notes && <p className="text-xs text-gray-400 italic">"{item.notes}"</p>}
                {item.allergy_flag && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle size={11} /> {item.allergy_note || 'Allergy flag'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium">{formatCurrency(item.item_price * item.quantity, currency)}</span>
                <button onClick={() => removeDraft(idx)} className="p-1 rounded text-gray-400 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-2">
            <Textarea label="Order notes" value={orderNotes}
              onChange={e => setOrderNotes(e.target.value)} rows={1} placeholder="Notes for the whole order…" />
          </div>
          <Button fullWidth onClick={handlePlaceOrder} loading={placing}>
            <UtensilsCrossed size={15} />
            Send to Kitchen · {formatCurrency(draftTotal, currency)}
          </Button>
        </div>
      )}

      {/* Search */}
      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…" />

      {/* #5: inline quick-add list */}
      <div className="max-h-72 overflow-y-auto space-y-1">
        {filtered.map(item => {
          const qty = draftQty(item.id)
          return (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 bg-white">
              {/* Item info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                <p className="text-xs text-gray-400">{formatCurrency(item.price, currency)}</p>
              </div>

              {/* Config button */}
              <button
                onClick={() => { setConfigItem(item); setConfigQty(1) }}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
                title="Add with notes / allergy"
              >
                <AlertTriangle size={13} />
              </button>

              {/* Inline stepper */}
              <div className="flex items-center gap-1 shrink-0">
                {qty > 0 ? (
                  <>
                    <button
                      onClick={() => quickRemove(item)}
                      className="h-7 w-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-5 text-center text-sm font-bold text-brand-600">{qty}</span>
                  </>
                ) : null}
                <button
                  onClick={() => quickAdd(item)}
                  className="h-7 w-7 rounded-lg bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center transition-colors"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No items found</p>}
      </div>
    </div>
  )
}
