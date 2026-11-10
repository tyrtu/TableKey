import { useState, useEffect } from 'react'
import {
  Plus, UserX, Mail, Shield, Copy, Check, Link as LinkIcon,
  KeyRound, Tablet, Power, LayoutGrid, RefreshCw, ChefHat,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getStaffByVenue, inviteStaff, removeStaff, getVenueById,
  generatePairingCode, setStaffPin, resetStaffPin, toggleDuty,
  assignTables, getAssignedTableIds, getTablesByVenue,
  reactivateStaff, updateStaffRole, transferOwnership,
  getStations, setMyStations, getMyStations,
} from '../../lib/api'
import { elapsedLabel, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Badge } from '../../components/ui/Badge'
import { Toggle } from '../../components/ui/Toggle'
import { Spinner } from '../../components/ui/Spinner'
import type { Staff, Venue, RestaurantTable, KitchenStation } from '../../types/database'

interface Props { venueId: string }

const ROLE_OPTIONS = [
  { value: 'waiter', label: 'Waiter' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
]

const roleBadge = (role: Staff['role']) => {
  if (role === 'owner') return <Badge variant="purple">Owner</Badge>
  if (role === 'admin') return <Badge variant="purple">Admin</Badge>
  if (role === 'manager') return <Badge variant="blue">Manager</Badge>
  if (role === 'kitchen') return <Badge variant="orange">Kitchen</Badge>
  return <Badge variant="gray">Waiter</Badge>
}

function buildInviteLink(email: string, venueName: string, name: string, role: string): string {
  const base = window.location.origin
  return `${base}/invite?email=${encodeURIComponent(email)}&venue=${encodeURIComponent(venueName)}&name=${encodeURIComponent(name)}&role=${encodeURIComponent(role)}`
}

export default function StaffManagement({ venueId }: Props) {
  const [staff, setStaff] = useState<Staff[]>([])
  const [venue, setVenue] = useState<Venue | null>(null)
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [inviteModal, setInviteModal] = useState(false)
  const [inviteResult, setInviteResult] = useState<Staff | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<Staff | null>(null)
  const [pinModal, setPinModal] = useState<Staff | null>(null)
  const [pairModal, setPairModal] = useState(false)
  const [pairResult, setPairResult] = useState<string | null>(null)
  const [assignModal, setAssignModal] = useState<Staff | null>(null)
  const [stationAssignModal, setStationAssignModal] = useState<Staff | null>(null)
  const [roleModal, setRoleModal] = useState<Staff | null>(null)
  const [stations, setStations] = useState<KitchenStation[]>([])
  const [assignedStationIds, setAssignedStationIds] = useState<Set<string>>(new Set())
  const [savingStationAssign, setSavingStationAssign] = useState(false)

  // Form state
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Staff['role']>('waiter')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pairing, setPairing] = useState(false)

  // PIN form
  const [pinValue, setPinValue] = useState('')
  const [settingPin, setSettingPin] = useState(false)

  // Assignment state
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [savingAssign, setSavingAssign] = useState(false)

  // Role change
  const [newRole, setNewRole] = useState<Staff['role']>('waiter')
  const [savingRole, setSavingRole] = useState(false)

  const load = async () => {
    setLoading(true)
    const [data, vn, tbls, stns] = await Promise.all([
      getStaffByVenue(venueId),
      getVenueById(venueId),
      getTablesByVenue(venueId),
      getStations(venueId),
    ])
    setStaff(data)
    setVenue(vn)
    setTables(tbls)
    setStations(stns)
    setLoading(false)
  }

  useEffect(() => { load() }, [venueId])

  const handleInvite = async () => {
    if (!name.trim() || !email.trim()) return
    setInviting(true)
    try {
      const s = await inviteStaff(venueId, email.trim().toLowerCase(), name.trim(), role)
      setStaff((prev) => [...prev, s])
      setInviteResult(s)
      setEmail(''); setName(''); setRole('waiter')
      toast.success(`${name} added. Share the invite link with them.`)
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.includes('unique') ? 'A staff member with that email already exists.' : 'Failed to invite.'
      toast.error(msg)
    } finally { setInviting(false) }
  }

  const handleCopyLink = async (member: Staff) => {
    if (!venue) return
    const link = buildInviteLink(member.email, venue.name, member.name, member.role)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(member.id)
      toast.success('Invite link copied!')
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = link
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopiedId(member.id)
      toast.success('Invite link copied!')
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const handleRemove = async () => {
    if (!removeConfirm) return
    setRemoving(true)
    try {
      await removeStaff(removeConfirm.id)
      setStaff((prev) => prev.map((s) => s.id === removeConfirm.id ? { ...s, active: false } : s))
      toast.success(`${removeConfirm.name} deactivated.`)
    } catch { toast.error('Failed to remove.') }
    finally { setRemoving(false); setRemoveConfirm(null) }
  }

  const handleReactivate = async (member: Staff) => {
    try {
      await reactivateStaff(member.id)
      setStaff((prev) => prev.map((s) => s.id === member.id ? { ...s, active: true } : s))
      toast.success(`${member.name} reactivated.`)
    } catch { toast.error('Failed to reactivate.') }
  }

  const handleToggleDuty = async (member: Staff) => {
    try {
      await toggleDuty(member.id, !member.on_duty, venueId)
      setStaff((prev) => prev.map((s) => s.id === member.id ? { ...s, on_duty: !member.on_duty } : s))
    } catch { toast.error('Failed to toggle duty.') }
  }

  const handleSetPin = async () => {
    if (!pinModal || pinValue.length < 4 || pinValue.length > 6) return
    setSettingPin(true)
    try {
      await setStaffPin(pinModal.id, pinValue)
      toast.success(`PIN set for ${pinModal.name}.`)
      setPinModal(null)
      setPinValue('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to set PIN.')
    } finally { setSettingPin(false) }
  }

  const handleResetPin = async (member: Staff) => {
    try {
      await resetStaffPin(member.id)
      toast.success(`PIN cleared for ${member.name}. They'll need a new one.`)
    } catch { toast.error('Failed to reset PIN.') }
  }

  const handlePair = async () => {
    setPairing(true)
    try {
      const data = await generatePairingCode(venueId)
      setPairResult(data.pairing_code)
    } catch { toast.error('Failed to generate pairing code.') }
    finally { setPairing(false) }
  }

  const handleOpenAssign = async (member: Staff) => {
    setAssignModal(member)
    const ids = await getAssignedTableIds(member.id)
    setAssignedIds(new Set(ids))
  }

  const handleOpenStationAssign = async (member: Staff) => {
    setStationAssignModal(member)
    const ids = await getMyStations(member.id)
    setAssignedStationIds(new Set(ids))
  }

  const handleSaveStationAssign = async () => {
    if (!stationAssignModal) return
    setSavingStationAssign(true)
    try {
      await setMyStations(stationAssignModal.id, Array.from(assignedStationIds))
      toast.success(`Stations assigned to ${stationAssignModal.name}.`)
      setStationAssignModal(null)
    } catch { toast.error('Failed to save station assignments.') }
    finally { setSavingStationAssign(false) }
  }

  const handleSaveAssign = async () => {
    if (!assignModal) return
    setSavingAssign(true)
    try {
      await assignTables(assignModal.id, Array.from(assignedIds), venueId)
      toast.success(`Tables assigned to ${assignModal.name}.`)
      setAssignModal(null)
    } catch { toast.error('Failed to save assignments.') }
    finally { setSavingAssign(false) }
  }

  const handleSaveRole = async () => {
    if (!roleModal) return
    setSavingRole(true)
    try {
      await updateStaffRole(roleModal.id, newRole, venueId)
      setStaff((prev) => prev.map((s) => s.id === roleModal.id ? { ...s, role: newRole } : s))
      toast.success(`Role updated to ${newRole}.`)
      setRoleModal(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role.')
    } finally { setSavingRole(false) }
  }

  const handleTransferOwnership = async (member: Staff) => {
    try {
      await transferOwnership(venueId, member.id)
      toast.success(`Ownership transferred to ${member.name}.`)
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to transfer ownership.')
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const active = staff.filter((s) => s.active)
  const inactive = staff.filter((s) => !s.active)
  const pendingCount = active.filter((s) => !s.joined_at).length
  const onDutyCount = active.filter((s) => s.on_duty).length

  return (
    <div className="pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 mb-1">Team management</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Staff</h2>
          <p className="text-sm text-gray-500 mt-1">Manage access, roles, and daily assignments.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" onClick={() => { setPairModal(true); setPairResult(null) }}>
            <Tablet size={16} /> Pair Device
          </Button>
          <Button onClick={() => setInviteModal(true)}>
            <Plus size={16} /> Invite Staff
          </Button>
        </div>
      </div>

      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 mb-2">Team overview</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 px-4 py-3">
            <p className="text-xs font-medium text-gray-500">Active staff</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{active.length}</p>
          </div>
          <div className="bg-white border border-gray-200 px-4 py-3">
            <p className="text-xs font-medium text-gray-500">On duty now</p>
            <p className="text-2xl font-semibold text-emerald-600 mt-1">{onDutyCount}</p>
          </div>
          <div className="bg-white border border-gray-200 px-4 py-3">
            <p className="text-xs font-medium text-gray-500">Awaiting setup</p>
            <p className="text-2xl font-semibold text-amber-600 mt-1">{pendingCount}</p>
          </div>
        </div>
      </section>

      {/* Pending banner */}
      {pendingCount > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
          <LinkIcon size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">{pendingCount} staff haven't set up their account yet</p>
            <p className="text-xs text-blue-600 mt-0.5">Copy their invite link and send it via WhatsApp, email, or SMS.</p>
          </div>
        </div>
      )}

      {/* Staff list */}
      <section>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Active team</p>
        <span className="text-xs text-gray-400">{active.length} member{active.length === 1 ? '' : 's'}</span>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-6">
        {active.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Shield size={36} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No staff yet. Tap "Invite Staff" to add your first team member.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {active.map((member) => (
              <div key={member.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 px-4 sm:px-5 py-3 hover:bg-gray-50/70 transition-colors">
                {/* Name + email */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="h-9 w-9 rounded-md bg-gray-100 text-gray-600 flex items-center justify-center shrink-0 text-sm font-semibold">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{member.name}</span>
                    {roleBadge(member.role)}
                    {member.on_duty && <Badge variant="green" dot>On duty</Badge>}
                    {!member.joined_at && <Badge variant="yellow" dot>Pending</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Mail size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-500 truncate">{member.email}</span>
                    {/* #9: last-seen indicator */}
                    {member.joined_at && (
                      <span className={cn(
                        'text-xs ml-2 flex items-center gap-1',
                        !member.last_active_at ? 'text-gray-300' :
                        (() => {
                          const mins = (Date.now() - new Date(member.last_active_at).getTime()) / 60000
                          return mins < 30 ? 'text-emerald-600' : mins < 1440 ? 'text-gray-400' : 'text-gray-300'
                        })()
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0',
                          !member.last_active_at ? 'bg-gray-200' :
                          (() => {
                            const mins = (Date.now() - new Date(member.last_active_at).getTime()) / 60000
                            return mins < 30 ? 'bg-emerald-400' : mins < 1440 ? 'bg-gray-300' : 'bg-gray-200'
                          })()
                        )} />
                        {member.last_active_at
                          ? `Seen ${elapsedLabel(member.last_active_at)}`
                          : 'Never signed in'}
                      </span>
                    )}
                  </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-wrap sm:pl-3 sm:border-l sm:border-gray-200 sm:min-w-[180px] sm:justify-end">
                  {/* Duty toggle (waiters only) */}
                  {(member.role === 'waiter' || member.role === 'manager') && member.joined_at && (
                    <button
                      onClick={() => handleToggleDuty(member)}
                      className={cn(
                        'p-1.5 rounded-md transition-colors',
                        member.on_duty ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'
                      )}
                      title={member.on_duty ? 'On duty — click to go off' : 'Off duty — click to go on'}
                    >
                      <Power size={15} />
                    </button>
                  )}

                  {/* Copy invite link (pending only) */}
                  {!member.joined_at && (
                    <Button variant="secondary" size="sm" onClick={() => handleCopyLink(member)}>
                      {copiedId === member.id ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Link</>}
                    </Button>
                  )}

                  {/* Set PIN */}
                  {member.joined_at && (
                    <button
                      onClick={() => { setPinModal(member); setPinValue('') }}
                      className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      title="Set PIN"
                    >
                      <KeyRound size={15} />
                    </button>
                  )}

                  {/* Assign tables (waiters only) */}
                  {(member.role === 'waiter') && member.joined_at && (
                    <button
                      onClick={() => handleOpenAssign(member)}
                      className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      title="Assign tables"
                    >
                      <LayoutGrid size={15} />
                    </button>
                  )}

                  {/* Assign stations (kitchen staff only) */}
                  {member.role === 'kitchen' && member.joined_at && stations.length > 0 && (
                    <button
                      onClick={() => handleOpenStationAssign(member)}
                      className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      title="Assign kitchen stations"
                    >
                      <ChefHat size={15} />
                    </button>
                  )}

                  {/* Change role */}
                  {member.role !== 'owner' && (
                    <button
                      onClick={() => { setRoleModal(member); setNewRole(member.role) }}
                      className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      title="Change role"
                    >
                      <Shield size={15} />
                    </button>
                  )}

                  {/* Remove */}
                  <button
                    onClick={() => setRemoveConfirm(member)}
                    className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    aria-label={`Remove ${member.name}`}
                  >
                    <UserX size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </section>

      {/* Inactive */}
      {inactive.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3">Deactivated ({inactive.length})</h3>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden opacity-70">
            <div className="divide-y divide-gray-50">
              {inactive.map((member) => (
                <div key={member.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-gray-500 line-through">{member.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{member.email}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleReactivate(member)}>
                    Reactivate
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Invite modal ── */}
      <Modal open={inviteModal && !inviteResult} onClose={() => { setInviteModal(false) }} title="Invite Staff Member" size="sm">
        <div className="space-y-4">
          <Input label="Full Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Smith" autoFocus />
          <Input label="Email *" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Staff['role'])} options={ROLE_OPTIONS.filter(r => r.value !== 'owner')} />
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs text-gray-600">After adding, you'll get a link to copy and share. They set their own password — no technical setup needed.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setInviteModal(false)}>Cancel</Button>
            <Button onClick={handleInvite} loading={inviting}>Add & Get Link</Button>
          </div>
        </div>
      </Modal>

      {/* ── Invite result modal ── */}
      <Modal open={!!inviteResult} onClose={() => setInviteResult(null)} title="Invite link ready!" size="sm">
        {inviteResult && venue && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-100 text-emerald-600 mb-3">
                <Check size={28} />
              </div>
              <p className="font-semibold text-gray-900">{inviteResult.name} added as {inviteResult.role}</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Share this link:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-gray-700 bg-white rounded-lg border border-gray-200 px-3 py-2 truncate">
                  {buildInviteLink(inviteResult.email, venue.name, inviteResult.name, inviteResult.role)}
                </code>
                <Button size="sm" onClick={() => handleCopyLink(inviteResult)}>
                  {copiedId === inviteResult.id ? <Check size={14} /> : <Copy size={14} />}
                </Button>
              </div>
            </div>
            <Button fullWidth onClick={() => setInviteResult(null)}>Done</Button>
          </div>
        )}
      </Modal>

      {/* ── PIN modal ── */}
      <Modal open={!!pinModal} onClose={() => setPinModal(null)} title={`Set PIN for ${pinModal?.name ?? ''}`} size="sm">
        <div className="space-y-4">
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs text-blue-700">This PIN lets them sign in on shared devices (kitchen tablets, shared phones). They'll use it instead of a password.</p>
          </div>
          <Input
            label="PIN (4-6 digits)"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={pinValue}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 1234"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setPinModal(null); setPinValue('') }}>Cancel</Button>
            <Button onClick={handleSetPin} loading={settingPin} disabled={pinValue.length < 4}>Set PIN</Button>
          </div>
          {pinModal?.pin_hash !== null && (
            <button
              onClick={() => { if (pinModal) handleResetPin(pinModal); setPinModal(null) }}
              className="w-full text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Or clear existing PIN
            </button>
          )}
        </div>
      </Modal>

      {/* ── Pair device modal ── */}
      <Modal open={pairModal} onClose={() => setPairModal(false)} title="Pair a shared device" size="sm">
        <div className="space-y-4">
          {!pairResult ? (
            <>
              <div className="text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gray-100 text-gray-500 mb-3">
                  <Tablet size={28} />
                </div>
                <p className="text-sm text-gray-500">Generate a one-time code to pair a kitchen tablet or shared waiter phone.</p>
              </div>
              <Button fullWidth onClick={handlePair} loading={pairing}>
                <Tablet size={16} /> Generate Pairing Code
              </Button>
            </>
          ) : (
            <>
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-3">Enter this code on the device:</p>
                <p className="text-5xl font-bold tracking-[0.3em] text-gray-900 font-mono py-4 rounded-xl bg-gray-50 border border-gray-200">
                  {pairResult}
                </p>
                <p className="text-xs text-gray-400 mt-2">Expires in 1 hour. The device must visit:<br /><code className="text-brand-600">{window.location.origin}/pair</code></p>
              </div>
              <Button fullWidth variant="secondary" onClick={() => { setPairModal(false); setPairResult(null) }}>Done</Button>
            </>
          )}
        </div>
      </Modal>

      {/* ── Assign tables modal ── */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Assign tables to ${assignModal?.name ?? ''}`} size="md">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Select which tables this waiter is responsible for.</p>
          {tables.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No tables created yet. Add tables first.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {tables.map((t) => {
                const checked = assignedIds.has(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setAssignedIds((prev) => {
                        const next = new Set(prev)
                        next.has(t.id) ? next.delete(t.id) : next.add(t.id)
                        return next
                      })
                    }}
                    className={cn(
                      'rounded-xl border py-3 px-2 text-center transition-colors',
                      checked
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    )}
                  >
                    <p className="font-bold text-sm">T{t.table_number}</p>
                    {t.label && <p className="text-[10px] text-gray-400 truncate">{t.label}</p>}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setAssignModal(null)}>Cancel</Button>
            <Button onClick={handleSaveAssign} loading={savingAssign}>Save Assignment</Button>
          </div>
        </div>
      </Modal>

      {/* ── Station assignment modal ── */}
      <Modal open={!!stationAssignModal} onClose={() => setStationAssignModal(null)}
        title={`Assign stations to ${stationAssignModal?.name ?? ''}`} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Select which kitchen stations this staff member can see on the kitchen display.
            Leaving all unselected means they see all stations.
          </p>
          {stations.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No stations created yet. Add stations in Settings → Kitchen Stations first.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {stations.map(s => {
                const checked = assignedStationIds.has(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => setAssignedStationIds(prev => {
                      const next = new Set(prev)
                      next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                      return next
                    })}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                      checked
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                  >
                    <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <div className="flex-1">
                      <p className={cn('text-sm font-medium', checked ? 'text-brand-700' : 'text-gray-800')}>
                        {s.name}
                      </p>
                      <p className="text-xs text-gray-400">Target: {s.target_prep_min} min</p>
                    </div>
                    <div className={cn(
                      'h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0',
                      checked ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                    )}>
                      {checked && <div className="h-2.5 w-2.5 rounded-sm bg-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setStationAssignModal(null)}>Cancel</Button>
            <Button onClick={handleSaveStationAssign} loading={savingStationAssign}>
              Save Stations
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Role change modal ── */}
      <Modal open={!!roleModal} onClose={() => setRoleModal(null)} title={`Change role for ${roleModal?.name ?? ''}`} size="sm">
        <div className="space-y-4">
          <Select label="New role" value={newRole} onChange={(e) => setNewRole(e.target.value as Staff['role'])} options={ROLE_OPTIONS.filter(r => r.value !== 'owner')} />
          {newRole === 'owner' && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
              <p className="text-xs text-amber-700">To transfer ownership, the current owner must initiate it. Use the transfer button instead.</p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setRoleModal(null)}>Cancel</Button>
            <Button onClick={handleSaveRole} loading={savingRole}>Save Role</Button>
          </div>
          {/* Transfer ownership */}
          {roleModal && roleModal.role !== 'owner' && newRole === 'owner' && (
            <button
              onClick={() => { handleTransferOwnership(roleModal); setRoleModal(null) }}
              className="w-full text-sm text-brand-600 font-medium hover:underline"
            >
              Transfer ownership to {roleModal.name}
            </button>
          )}
        </div>
      </Modal>

      {/* ── Remove confirm ── */}
      <ConfirmDialog
        open={!!removeConfirm}
        onClose={() => setRemoveConfirm(null)}
        onConfirm={handleRemove}
        title="Remove staff member?"
        message={`${removeConfirm?.name} will lose access immediately. Their sessions are revoked and they'll be logged out. You can reactivate them later.`}
        confirmLabel="Remove"
        loading={removing}
      />
    </div>
  )
}
