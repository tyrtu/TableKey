import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell, Clock, CheckCircle2, MessageCircle, CreditCard,
  AlertTriangle, HelpCircle, ChevronRight, User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getPendingHelpRequests, acknowledgeHelpRequest, resolveHelpRequest,
} from '../../lib/api'
import { getSupabase } from '../../lib/supabase'
import { useTableRealtime } from '../../hooks/useRealtime'
import { elapsedMinutes, formatTime, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import type { HelpRequest, HelpResolution } from '../../types/database'

// #3: live "acknowledged X ago" timer
function AcknowledgedTimer({ since }: { since: string }) {
  const [secs, setSecs] = useState(() =>
    Math.floor((Date.now() - new Date(since).getTime()) / 1000)
  )
  useEffect(() => {
    const id = setInterval(() =>
      setSecs(Math.floor((Date.now() - new Date(since).getTime()) / 1000))
    , 1000)
    return () => clearInterval(id)
  }, [since])
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return (
    <span className="font-mono tabular-nums text-xs text-emerald-600 font-medium">
      {m}:{String(s).padStart(2, '0')} ago
    </span>
  )
}

// #9: swipeable card wrapper — swipe right triggers onSwipe
function SwipeToAck({
  children,
  onSwipe,
  disabled,
}: {
  children: React.ReactNode
  onSwipe: () => void
  disabled: boolean
}) {
  const startX = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)
  const THRESHOLD = 80

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return
    startX.current = e.touches[0].clientX
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || disabled) return
    const dx = e.touches[0].clientX - startX.current
    if (dx > 0) setOffset(Math.min(dx, THRESHOLD + 20))
  }
  const handleTouchEnd = () => {
    if (offset >= THRESHOLD && !disabled) onSwipe()
    setOffset(0)
    startX.current = null
  }

  const progress = Math.min(offset / THRESHOLD, 1)

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe hint layer */}
      <div
        className="absolute inset-0 flex items-center px-4 rounded-2xl transition-opacity"
        style={{
          background: `rgba(16,185,129,${progress * 0.15})`,
          opacity: progress,
        }}
      >
        <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
          <User size={16} />
          On my way
        </div>
      </div>
      <div
        style={{ transform: `translateX(${offset}px)`, transition: offset === 0 ? 'transform 0.2s' : 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}

interface Props {
  venueId: string | null
  staffId: string | null
}

const TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  call_waiter:     { label: 'Call waiter',         icon: <Bell size={14} />,          color: 'text-blue-600 bg-blue-50 border-blue-200' },
  ask_for_bill:    { label: 'Asking for bill',      icon: <CreditCard size={14} />,    color: 'text-purple-600 bg-purple-50 border-purple-200' },
  order_problem:   { label: 'Order problem',        icon: <AlertTriangle size={14} />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  payment_problem: { label: 'Payment problem',      icon: <CreditCard size={14} />,    color: 'text-red-600 bg-red-50 border-red-200' },
  other:           { label: 'Help needed',          icon: <HelpCircle size={14} />,    color: 'text-gray-600 bg-gray-50 border-gray-200' },
}

const PROBLEM_LABELS: Record<string, string> = {
  wrong_item:       'Wrong item brought',
  missing_item:     'Item is missing',
  cold:             'Food is cold',
  not_as_expected:  'Not as expected',
  taking_too_long:  'Taking too long',
  other:            'Other issue',
}

const RESOLUTION_OPTIONS: { value: HelpResolution; label: string }[] = [
  { value: 'no_action',  label: 'No action needed' },
  { value: 'comp',       label: 'Comped the item' },
  { value: 'void',       label: 'Voided the item' },
  { value: 'remake',     label: 'Sent for remake' },
]

export function HelpQueueView({ venueId, staffId }: Props) {
  const [requests, setRequests] = useState<HelpRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [tableNames, setTableNames] = useState<Record<string, string>>({})
  const [resolveModal, setResolveModal] = useState<HelpRequest | null>(null)
  const [resolution, setResolution] = useState<HelpResolution>('no_action')
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolving, setResolving] = useState(false)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    const data = await getPendingHelpRequests(venueId)
    setRequests(data)
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  // Load table names for requests
  useEffect(() => {
    const missingTableIds = requests
      .map(r => r.table_id)
      .filter(id => id && !tableNames[id])
    if (missingTableIds.length === 0) return

    getSupabase()
      .from('restaurant_tables')
      .select('id, table_number, label')
      .in('id', missingTableIds)
      .then(({ data }) => {
        const map: Record<string, string> = {}
        for (const t of data ?? []) {
          map[t.id] = `Table ${t.table_number}${t.label ? ` · ${t.label}` : ''}`
        }
        setTableNames(prev => ({ ...prev, ...map }))
      })
  }, [requests])

  // Realtime updates
  useTableRealtime('help_requests', 'venue_id', venueId ?? undefined, () => load())

  const handleAcknowledge = async (req: HelpRequest) => {
    if (!staffId) return
    setAcknowledging(req.id)
    try {
      await acknowledgeHelpRequest(req.id, staffId)
      setRequests(prev => prev.map(r =>
        r.id === req.id ? { ...r, status: 'acknowledged', acknowledged_by: staffId, acknowledged_at: new Date().toISOString() } : r
      ))
      toast.success('Marked as on the way.')
    } catch { toast.error('Failed to acknowledge.') }
    finally { setAcknowledging(null) }
  }

  const handleResolve = async () => {
    if (!resolveModal || !staffId) return
    setResolving(true)
    try {
      await resolveHelpRequest(
        resolveModal.id, staffId,
        resolveModal.request_type === 'order_problem' ? resolution : undefined,
        resolutionNote.trim() || undefined
      )
      setRequests(prev => prev.filter(r => r.id !== resolveModal.id))
      setResolveModal(null)
      setResolutionNote('')
      toast.success('Help request resolved.')
    } catch { toast.error('Failed to resolve.') }
    finally { setResolving(false) }
  }

  const sorted = [...requests].sort((a, b) => {
    // Acknowledged first (waiter is already dealing with them), then by age
    if (a.status === 'acknowledged' && b.status !== 'acknowledged') return -1
    if (b.status === 'acknowledged' && a.status !== 'acknowledged') return 1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  if (requests.length === 0 && !loading) {
    return (
      <EmptyState
        icon={<MessageCircle size={48} />}
        title="No help requests"
        description="Customer help requests appear here in real time."
        className="mt-8"
      />
    )
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        {requests.length} open request{requests.length !== 1 ? 's' : ''}
        <span className="ml-2 text-gray-400">· swipe right to acknowledge</span>
      </p>

      {sorted.map(req => {
        const typeInfo = TYPE_LABELS[req.request_type] ?? TYPE_LABELS.other
        const elapsed = elapsedMinutes(req.created_at)
        const isAcknowledged = req.status === 'acknowledged'
        const isEscalated = elapsed >= 1 && !isAcknowledged
        const isManagerLevel = elapsed >= 2 && !isAcknowledged
        const isUrgent = elapsed >= 2 && !isAcknowledged

        return (
          <SwipeToAck
            key={req.id}
            onSwipe={() => !isAcknowledged && handleAcknowledge(req)}
            disabled={isAcknowledged || acknowledging === req.id}
          >
          <div
            className={cn(
              'rounded-2xl border bg-white shadow-sm overflow-hidden',
              isAcknowledged ? 'border-emerald-200' :
              isManagerLevel ? 'border-red-300' :
              isUrgent ? 'border-red-200' :
              isEscalated ? 'border-yellow-200' :
              'border-gray-100'
            )}
          >
            {/* Status banner */}
            {isAcknowledged && (
              <div className="flex items-center justify-between bg-emerald-50 border-b border-emerald-100 px-4 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <p className="text-xs text-emerald-700 font-medium">On the way</p>
                </div>
                {/* #3: acknowledged-ago timer */}
                {req.acknowledged_at && (
                  <AcknowledgedTimer since={req.acknowledged_at} />
                )}
              </div>
            )}
            {isManagerLevel && (
              <div className="flex items-center gap-2 bg-red-50 border-b border-red-100 px-4 py-2">
                <AlertTriangle size={13} className="text-red-500" />
                <p className="text-xs text-red-600 font-semibold">
                  {elapsed}m — Escalated to manager
                </p>
              </div>
            )}
            {isEscalated && !isManagerLevel && (
              <div className="flex items-center gap-2 bg-yellow-50 border-b border-yellow-100 px-4 py-2">
                <AlertTriangle size={13} className="text-yellow-600" />
                <p className="text-xs text-yellow-700 font-medium">
                  {elapsed}m — All on-duty waiters notified
                </p>
              </div>
            )}
            {isUrgent && !isEscalated && (
              <div className="flex items-center gap-2 bg-red-50 border-b border-red-100 px-4 py-2">
                <AlertTriangle size={13} className="text-red-500" />
                <p className="text-xs text-red-600 font-medium">Waiting {elapsed} min</p>
              </div>
            )}

            <div className="p-4">
              {/* Header row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">
                      {tableNames[req.table_id] ?? 'Table…'}
                    </span>
                    <span className={cn(
                      'inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border',
                      typeInfo.color
                    )}>
                      {typeInfo.icon}
                      {typeInfo.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {formatTime(req.created_at)} · {elapsed === 0 ? 'just now' : `${elapsed}m ago`}
                  </p>
                </div>
                <span className={cn(
                  'h-2.5 w-2.5 rounded-full mt-1 shrink-0',
                  isAcknowledged ? 'bg-emerald-400' : 'bg-yellow-500 animate-pulse'
                )} />
              </div>

              {/* Detail: order problem */}
              {req.request_type === 'order_problem' && (
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 mb-3">
                  {req.problem_type && (
                    <p className="text-xs font-semibold text-amber-800">
                      {PROBLEM_LABELS[req.problem_type] ?? req.problem_type}
                    </p>
                  )}
                  {req.note && (
                    <p className="text-xs text-amber-600 mt-0.5">"{req.note}"</p>
                  )}
                </div>
              )}

              {/* Detail: note for other types */}
              {req.request_type !== 'order_problem' && req.note && (
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 mb-3">
                  <p className="text-xs text-gray-600">"{req.note}"</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {!isAcknowledged && (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => handleAcknowledge(req)}
                    loading={acknowledging === req.id}
                  >
                    <User size={14} />
                    On my way
                  </Button>
                )}
                <Button
                  variant={isAcknowledged ? 'primary' : 'ghost'}
                  size="sm"
                  fullWidth
                  onClick={() => {
                    setResolveModal(req)
                    setResolution('no_action')
                    setResolutionNote('')
                  }}
                >
                  <CheckCircle2 size={14} />
                  Resolve
                </Button>
              </div>
            </div>
          </div>
          </SwipeToAck>
        )
      })}

      {/* Resolve modal */}
      <Modal
        open={!!resolveModal}
        onClose={() => setResolveModal(null)}
        title="Resolve help request"
        size="sm"
      >
        {resolveModal && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">
                {tableNames[resolveModal.table_id] ?? 'Table'} ·{' '}
                {TYPE_LABELS[resolveModal.request_type]?.label}
              </p>
              {resolveModal.problem_type && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {PROBLEM_LABELS[resolveModal.problem_type]}
                </p>
              )}
              {resolveModal.note && (
                <p className="text-xs text-gray-400 mt-0.5 italic">"{resolveModal.note}"</p>
              )}
            </div>

            {/* Resolution options only for order problems */}
            {resolveModal.request_type === 'order_problem' && (
              <Select
                label="What did you do?"
                value={resolution}
                onChange={e => setResolution(e.target.value as HelpResolution)}
                options={RESOLUTION_OPTIONS}
              />
            )}

            <Input
              label="Note (optional)"
              value={resolutionNote}
              onChange={e => setResolutionNote(e.target.value)}
              placeholder="Any extra context…"
            />

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setResolveModal(null)}>
                Cancel
              </Button>
              <Button onClick={handleResolve} loading={resolving}>
                <CheckCircle2 size={14} />
                Mark Resolved
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
