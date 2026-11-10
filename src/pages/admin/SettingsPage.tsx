import { useState, useEffect } from 'react'
import { Save, Building2, ShieldCheck, Clock, CreditCard, Utensils, Plus, Pencil, Trash2, ChefHat, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { getVenueById, updateVenue, getStations, upsertStation, deleteStation } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Toggle } from '../../components/ui/Toggle'
import { Spinner } from '../../components/ui/Spinner'
import { cn } from '../../lib/utils'
import type { Venue, KitchenStation } from '../../types/database'

interface Props { venueId: string }

export default function SettingsPage({ venueId }: Props) {
  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  // #1: track which sections have unsaved changes
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  // Local form state
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [currency, setCurrency] = useState('USD')

  const [codeLength, setCodeLength] = useState(4)
  const [sessionTimeout, setSessionTimeout] = useState(120)
  const [inactivityTimeout, setInactivityTimeout] = useState(30)
  const [maxAttempts, setMaxAttempts] = useState(5)
  const [escalateMin, setEscalateMin] = useState(3)
  const [rateLimitRequests, setRateLimitRequests] = useState(3)

  const [kitchenOpen, setKitchenOpen] = useState(true)
  const [allowCash, setAllowCash] = useState(true)
  const [allowCard, setAllowCard] = useState(true)

  // #8: kitchen toggle confirmation
  const [kitchenConfirm, setKitchenConfirm] = useState(false)

  useEffect(() => {
    getVenueById(venueId).then((v) => {
      if (!v) return
      setVenue(v)
      setName(v.name)
      setAddress(v.address ?? '')
      setPhone(v.phone ?? '')
      setCurrency(v.currency)
      setCodeLength(v.code_length)
      setSessionTimeout(v.session_timeout_min)
      setInactivityTimeout(v.inactivity_timeout_min)
      setMaxAttempts(v.max_code_attempts)
      setEscalateMin(v.request_escalate_min)
      setRateLimitRequests(v.rate_limit_requests)
      setKitchenOpen(v.kitchen_open)
      setAllowCash(v.allow_cash)
      setAllowCard(v.allow_card)
      setLoading(false)
    })
  }, [venueId])

  // #1: mark section dirty when field differs from saved value
  const markDirty = (section: string) =>
    setDirty(prev => { const n = new Set(prev); n.add(section); return n })
  const clearDirty = (section: string) =>
    setDirty(prev => { const n = new Set(prev); n.delete(section); return n })

  const handleSave = async (section: string, updates: Partial<Venue>) => {
    setSaving(section)
    try {
      await updateVenue(venueId, updates)
      setVenue((v) => (v ? { ...v, ...updates } : v))
      clearDirty(section)
      toast.success('Settings saved.')
    } catch {
      toast.error('Failed to save settings.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!venue) return null

  return (
    <div className="space-y-7 pb-8">
      <div className="border-b border-gray-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Venue configuration</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 mt-1">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Control how your venue operates, accepts payments, and protects customer sessions.</p>
      </div>

      {/* ── Venue Profile ── */}
      <SettingsSection
        title="Venue Profile"
        icon={<Building2 size={18} className="text-gray-500" />}
        description="Basic details shown to your team and customers."
        unsaved={dirty.has('profile')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Venue Name" value={name} onChange={(e) => { setName(e.target.value); markDirty('profile') }} />
          <Input label="Address" value={address} onChange={(e) => { setAddress(e.target.value); markDirty('profile') }} />
          <Input label="Phone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); markDirty('profile') }} />
          <Input label="Currency Code" value={currency} onChange={(e) => { setCurrency(e.target.value.toUpperCase()); markDirty('profile') }} placeholder="USD" maxLength={3} hint="ISO 4217 currency code, e.g. USD, EUR, GBP" />
          <div className="sm:col-span-2">
            <Button
            loading={saving === 'profile'}
            onClick={() => handleSave('profile', { name, address: address || null, phone: phone || null, currency })}
            >
              <Save size={15} /> Save Profile
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* ── Kitchen ── */}
      <SettingsSection
        title="Kitchen"
        icon={<Utensils size={18} className="text-gray-500" />}
        description="Control whether customers can place new orders."
      >
        <div className="space-y-4">
          <Toggle
            label="Kitchen is open (customers can order)"
            checked={kitchenOpen}
            onChange={(v) => {
              // #8: confirm before closing kitchen
              if (!v) { setKitchenConfirm(true) }
              else { setKitchenOpen(true); handleSave('kitchen', { kitchen_open: true }) }
            }}
          />
          {/* #8: kitchen close confirmation */}
          <ConfirmDialog
            open={kitchenConfirm}
            onClose={() => setKitchenConfirm(false)}
            onConfirm={() => { setKitchenOpen(false); handleSave('kitchen', { kitchen_open: false }); setKitchenConfirm(false) }}
            title="Close the kitchen?"
            message="Customers won't be able to place new orders until the kitchen is reopened. Existing orders are not affected."
            confirmLabel="Close Kitchen"
          />
        </div>
      </SettingsSection>

      {/* ── Kitchen Stations ── */}
      <SettingsSection
        title="Kitchen Stations"
        icon={<ChefHat size={18} className="text-gray-500" />}
        description="Route orders to the right kitchen screens and teams."
      >
        <StationsManager venueId={venueId} />
      </SettingsSection>

      {/* ── Security ── */}
      <SettingsSection
        title="Security & Verification"
        icon={<ShieldCheck size={18} className="text-gray-500" />}
        description="Set the rules for table access codes and waiter requests."
        unsaved={dirty.has('security')}
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Code Length (digits)
            </label>
            <div className="flex gap-2">
              {[4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => { setCodeLength(n); markDirty('security') }}
                  className={`h-10 w-14 rounded-xl border text-sm font-bold transition-colors ${
                    codeLength === n
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Max code attempts before lockout"
              type="number" min={3} max={10}
              value={maxAttempts}
              onChange={(e) => { setMaxAttempts(parseInt(e.target.value) || 5); markDirty('security') }}
              hint="Session locks after this many wrong entries"
            />
            <Input
              label="Request escalation time (minutes)"
              type="number" min={1} max={15}
              value={escalateMin}
              onChange={(e) => { setEscalateMin(parseInt(e.target.value) || 3); markDirty('security') }}
              hint="Alert waiter again after this many minutes"
            />
            <Input
              label="Max requests per device per 2 minutes"
              type="number" min={1} max={20}
              value={rateLimitRequests}
              onChange={(e) => { setRateLimitRequests(parseInt(e.target.value) || 10); markDirty('security') }}
              hint="Prevents request spam — window resets after 2 minutes"
            />
          </div>
          <Button
            loading={saving === 'security'}
            onClick={() => handleSave('security', {
              code_length: codeLength,
              max_code_attempts: maxAttempts,
              request_escalate_min: escalateMin,
              rate_limit_requests: rateLimitRequests,
            })}
          >
            <Save size={15} /> Save Security Settings
          </Button>
        </div>
      </SettingsSection>

      {/* ── Timeouts ── */}
      <SettingsSection
        title="Session Timeouts"
        icon={<Clock size={18} className="text-gray-500" />}
        description="Automatically close or expire inactive table sessions."
        unsaved={dirty.has('timeouts')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Session timeout (minutes)"
            type="number" min={30} max={480}
            value={sessionTimeout}
            onChange={(e) => { setSessionTimeout(parseInt(e.target.value) || 120); markDirty('timeouts') }}
            hint="Auto-close session after this period"
          />
          <Input
            label="Inactivity timeout (minutes)"
            type="number" min={10} max={120}
            value={inactivityTimeout}
            onChange={(e) => { setInactivityTimeout(parseInt(e.target.value) || 30); markDirty('timeouts') }}
            hint="Code expires if no activity for this long"
          />
          <div className="sm:col-span-2">
            <Button
            loading={saving === 'timeouts'}
            onClick={() => handleSave('timeouts', {
              session_timeout_min: sessionTimeout,
              inactivity_timeout_min: inactivityTimeout,
            })}
            >
              <Save size={15} /> Save Timeouts
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* ── Payments ── */}
      <SettingsSection
        title="Payments"
        icon={<CreditCard size={18} className="text-gray-500" />}
        description="Choose which payment methods your venue accepts."
      >
        <div className="space-y-4">
          <Toggle
            label="Accept cash payments"
            checked={allowCash}
            onChange={(v) => { setAllowCash(v); handleSave('payments', { allow_cash: v }) }}
          />
          <Toggle
            label="Accept card payments (Stripe)"
            checked={allowCard}
            onChange={(v) => { setAllowCard(v); handleSave('payments', { allow_card: v }) }}
          />
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs text-gray-600">
              Card payments use Stripe hosted checkout. Card details go directly to Stripe — TableKey never stores them.
              Configure your Stripe account ID in the environment variables (<code className="font-mono bg-gray-100 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code>).
            </p>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}

function SettingsSection({
  title, icon, children, unsaved, description,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  unsaved?: boolean
  description?: string
}) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-200 bg-gray-50/70">
        {icon}
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        {unsaved && (
          <span className="ml-auto flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 font-medium shrink-0">
            <AlertCircle size={11} />
            Unsaved changes
          </span>
        )}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

// ── Stations Manager ──────────────────────────────────────────

const STATION_COLORS = [
  '#f59e0b', // amber  – Kitchen
  '#3b82f6', // blue   – Bar
  '#10b981', // green  – Grill
  '#8b5cf6', // purple – Dessert
  '#ef4444', // red
  '#ec4899', // pink
  '#6b7280', // gray
]

function StationsManager({ venueId }: { venueId: string }) {
  const [stations, setStations] = useState<KitchenStation[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Partial<KitchenStation> | null>(null)
  const [delConfirm, setDelConfirm] = useState<KitchenStation | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)
    const data = await getStations(venueId)
    setStations(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [venueId])

  const handleSave = async () => {
    if (!modal?.name?.trim()) return
    setSaving(true)
    try {
      const saved = await upsertStation({
        ...(modal.id ? { id: modal.id } : {}),
        venue_id: venueId,
        name: modal.name.trim(),
        color: modal.color ?? '#f59e0b',
        target_prep_min: modal.target_prep_min ?? 15,
        is_default: modal.is_default ?? false,
        sort_order: modal.sort_order ?? stations.length,
      })
      // If marking as default, clear default on others
      if (saved.is_default) {
        setStations(prev => prev.map(s =>
          s.id === saved.id ? saved : { ...s, is_default: false }
        ).filter(s => s.id !== saved.id).concat([saved])
          .sort((a, b) => a.sort_order - b.sort_order))
      } else {
        setStations(prev => {
          const idx = prev.findIndex(s => s.id === saved.id)
          return idx >= 0
            ? prev.map(s => s.id === saved.id ? saved : s)
            : [...prev, saved]
        })
      }
      setModal(null)
      toast.success(modal.id ? 'Station updated.' : 'Station created.')
    } catch { toast.error('Failed to save station.') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!delConfirm) return
    setDeleting(true)
    try {
      await deleteStation(delConfirm.id)
      setStations(prev => prev.filter(s => s.id !== delConfirm.id))
      toast.success('Station deleted.')
    } catch { toast.error('Cannot delete — items may be assigned to this station.') }
    finally { setDeleting(false); setDelConfirm(null) }
  }

  if (loading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Stations route orders to the right screen — Kitchen, Bar, Grill, etc.
        Assign a default station to each menu category, then override per item if needed.
        Kitchen staff see only their assigned stations.
      </p>

      {/* Station list */}
      <div className="space-y-2">
        {stations.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            No stations yet. Create at least one — a "Kitchen" default is recommended.
          </p>
        )}
        {stations.map(station => (
          <div
            key={station.id}
            className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50/70 px-4 py-3"
          >
            {/* Color dot */}
            <div
              className="h-4 w-4 rounded-full shrink-0 ring-2 ring-white ring-offset-1"
              style={{ backgroundColor: station.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{station.name}</span>
                {station.is_default && (
                  <span className="text-[10px] bg-brand-100 text-brand-700 rounded-full px-2 py-0.5 font-medium">
                    Default
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                Target: {station.target_prep_min} min prep
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => setModal({ ...station })}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-gray-700 transition-colors"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => setDelConfirm(station)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                disabled={station.is_default}
                title={station.is_default ? "Can't delete the default station" : 'Delete'}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="secondary"
        onClick={() => setModal({
          name: '',
          color: STATION_COLORS[stations.length % STATION_COLORS.length],
          target_prep_min: 15,
          is_default: stations.length === 0,
          sort_order: stations.length,
        })}
      >
        <Plus size={15} /> Add Station
      </Button>

      {/* Station modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.id ? 'Edit Station' : 'New Station'}
        size="sm"
      >
        {modal && (
          <div className="space-y-4">
            <Input
              label="Station name *"
              value={modal.name ?? ''}
              onChange={e => setModal(m => ({ ...m, name: e.target.value }))}
              placeholder="e.g. Kitchen, Bar, Grill"
              autoFocus
            />

            {/* Target prep time */}
            <Input
              label="Target prep time (minutes)"
              type="number"
              min={1}
              max={120}
              value={modal.target_prep_min ?? 15}
              onChange={e => setModal(m => ({ ...m, target_prep_min: parseInt(e.target.value) || 15 }))}
              hint="Orders taking longer than this will be flagged as late"
            />

            {/* Color picker */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {STATION_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setModal(m => ({ ...m, color }))}
                    className={cn(
                      'h-8 w-8 rounded-full transition-all',
                      modal.color === color
                        ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                        : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>

            {/* Default toggle */}
            <Toggle
              label="Set as default station"
              checked={modal.is_default ?? false}
              onChange={v => setModal(m => ({ ...m, is_default: v }))}
            />
            <p className="text-xs text-gray-400 -mt-2">
              The default station receives orders from items that haven't been assigned to a specific station.
            </p>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
              <Button
                onClick={handleSave}
                loading={saving}
                disabled={!modal.name?.trim()}
              >
                {modal.id ? 'Save' : 'Create Station'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!delConfirm}
        onClose={() => setDelConfirm(null)}
        onConfirm={handleDelete}
        title="Delete station?"
        message={`"${delConfirm?.name}" will be deleted. Any items assigned to it will fall back to the default station.`}
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  )
}
