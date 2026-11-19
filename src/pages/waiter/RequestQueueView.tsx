import { useState, useEffect, useCallback } from 'react'
import { Check, X, Clock, Bell, AlertTriangle, Users, UserPlus, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { approveRequest, denyRequest, getPendingHelpRequests, acknowledgeHelpRequest } from '../../lib/api'
import { getSupabase } from '../../lib/supabase'
import { elapsedMinutes, formatTime, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import type { TableRequest } from '../../types/database'

// ── Live MM:SS timer ──────────────────────────────────────────
function LiveTimer({ since }: { since: string }) {
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
  return <span className="font-mono tabular-nums">{m}:{String(s).padStart(2, '0')}</span>
}

interface Props {
  venueId: string | null
  staffId: string | null
  requests: TableRequest[]
}

type QueueTab = 'open' | 'done'

export function RequestQueueView({ venueId, staffId, requests }: Props) {
  const [handling, setHandling] = useState<Record<string, 'approve' | 'deny' | null>>({})
  const [tableData, setTableData] = useState<Record<string, { label: string; hasActiveSession: boolean; capacity?: number }>>({})
  const [tab, setTab] = useState<QueueTab>('open')
  const [doneToday, setDoneToday] = useState<TableRequest[]>([])

  // Load done-today requests
  const loadDoneToday = useCallback(async () => {
    if (!venueId) return
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const { data } = await getSupabase()
      .from('table_requests')
      .select('*')
      .eq('venue_id', venueId)
      .in('status', ['approved', 'denied'])
      .gte('handled_at', startOfDay.toISOString())
      .order('handled_at', { ascending: false })
      .limit(50)
    setDoneToday((data ?? []) as TableRequest[])
  }, [venueId])

  useEffect(() => { loadDoneToday() }, [loadDoneToday])

  // Load table metadata for each request
  const allIds = [...requests, ...doneToday].map(r => r.table_id).filter(id => !tableData[id])
  const missingTableIds = [...new Set(allIds)]

  if (missingTableIds.length > 0) {
    Promise.all([
      getSupabase().from('restaurant_tables').select('id, table_number, label, capacity').in('id', missingTableIds),
      getSupabase().from('table_sessions').select('table_id').in('table_id', missingTableIds).eq('is_active', true),
    ]).then(([tablesRes, sessionsRes]) => {
      const activeTables = new Set((sessionsRes.data ?? []).map(s => s.table_id))
      const map: typeof tableData = {}
      for (const t of tablesRes.data ?? []) {
        map[t.id] = {
          label: `Table ${t.table_number}${t.label ? ` (${t.label})` : ''}`,
          hasActiveSession: activeTables.has(t.id),
          capacity: t.capacity ?? undefined,
        }
      }
      setTableData(prev => ({ ...prev, ...map }))
    })
  }

  const handleApprove = async (request: TableRequest) => {
    if (!venueId || !staffId) return
    setHandling(h => ({ ...h, [request.id]: 'approve' }))
    try {
      const { data: venue } = await getSupabase().from('venues').select('code_length').eq('id', venueId).single()
      const { code, warning } = await approveRequest(request, staffId, venueId, venue?.code_length ?? 4)
      toast.success(`Approved ${tableData[request.table_id]?.label ?? 'table'}. Code: ${code.split('').join(' ')}`, { duration: 8000 })
      if (warning) {
        toast(warning, { icon: <AlertTriangle size={16} />, duration: 10000, style: { background: '#fef3c7', color: '#92400e', maxWidth: '380px' } })
      }
      loadDoneToday()
    } catch { toast.error('Failed to approve request.') }
    finally { setHandling(h => ({ ...h, [request.id]: null })) }
  }

  const handleDeny = async (request: TableRequest) => {
    if (!venueId || !staffId) return
    setHandling(h => ({ ...h, [request.id]: 'deny' }))
    try {
      await denyRequest(request.id, staffId, venueId, request.table_id)
      toast('Request denied.', { icon: <X size={16} /> })
      loadDoneToday()
    } catch { toast.error('Failed to deny request.') }
    finally { setHandling(h => ({ ...h, [request.id]: null })) }
  }

  const sorted = [...requests].sort((a, b) =>
    elapsedMinutes(b.requested_at) - elapsedMinutes(a.requested_at)
  )

  return (
    <div className="px-4 py-4 flex flex-col gap-3">

      {/* ── Open / Done today tab toggle ──────────────────── */}
      <div className="flex gap-2 mb-1">
        <button
          onClick={() => setTab('open')}
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors',
            tab === 'open'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          )}
        >
          Open
          {requests.length > 0 && (
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              tab === 'open' ? 'bg-[#e05c27] text-white' : 'bg-gray-100 text-gray-700'
            )}>
              {requests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('done')}
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors',
            tab === 'done'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          )}
        >
          Done today
          {doneToday.length > 0 && (
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              tab === 'done' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
            )}>
              {doneToday.length}
            </span>
          )}
        </button>
      </div>

      {/* ── OPEN REQUESTS ─────────────────────────────────── */}
      {tab === 'open' && (
        sorted.length === 0 ? (
          <EmptyState
            icon={<Bell size={48} />}
            title="No pending requests"
            description="When a customer taps 'Request to Order', it appears here."
            className="mt-4"
          />
        ) : (
          sorted.map(req => {
            const elapsed = elapsedMinutes(req.requested_at)
            const isEscalated = !!req.escalated_at || elapsed >= 1
            const isManagerLevel = elapsed >= 2
            const isLoading = !!handling[req.id]
            const table = tableData[req.table_id]
            const hasActiveSession = table?.hasActiveSession ?? false

            // Context line — shown under table name
            const contextLine = hasActiveSession
              ? `New group · verify group, then open session`
              : table?.capacity
              ? `Up to ${table.capacity} guests · verify in person`
              : `Verify in person before approving`

            return (
              <div
                key={req.id}
                className={cn(
                  'rounded-2xl border bg-white shadow-sm overflow-hidden',
                  hasActiveSession ? 'border-orange-300'
                  : isManagerLevel ? 'border-red-400'
                  : isEscalated ? 'border-yellow-300'
                  : 'border-gray-100'
                )}
              >
                {/* Escalation / warning banners */}
                {hasActiveSession && (
                  <div className="flex items-start gap-2 bg-orange-50 border-b border-orange-200 px-4 py-2.5">
                    <Users size={14} className="text-orange-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-orange-800 font-semibold">
                      Active session — new group requesting. Walk over and confirm.
                    </p>
                  </div>
                )}
                {!hasActiveSession && isManagerLevel && (
                  <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 px-4 py-2">
                    <AlertTriangle size={13} className="text-red-500 shrink-0" />
                    <p className="text-xs text-red-700 font-semibold">{elapsed}m — Escalated to manager</p>
                  </div>
                )}
                {!hasActiveSession && isEscalated && !isManagerLevel && (
                  <div className="flex items-center gap-2 bg-yellow-50 border-b border-yellow-200 px-4 py-2">
                    <AlertTriangle size={13} className="text-yellow-600 shrink-0" />
                    <p className="text-xs text-yellow-700 font-medium">{elapsed}m — All on-duty waiters notified</p>
                  </div>
                )}

                <div className="px-4 pt-3 pb-3">
                  {/* Header: table name + type badge + timer */}
                  <div className="flex items-start justify-between mb-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-base text-gray-900">{table?.label ?? 'Table…'}</p>
                      <span className={cn(
                        'inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5',
                        hasActiveSession ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                      )}>
                        {hasActiveSession ? <><UserPlus size={9} /> New group</> : <><Bell size={9} /> First order</>}
                      </span>
                    </div>
                    <span className={cn(
                      'h-2 w-2 rounded-full animate-pulse mt-1.5 shrink-0',
                      hasActiveSession ? 'bg-orange-500'
                      : isManagerLevel ? 'bg-red-500'
                      : isEscalated ? 'bg-yellow-500'
                      : 'bg-yellow-400'
                    )} />
                  </div>

                  {/* Context line */}
                  <p className="text-xs text-gray-400 mb-2">{contextLine}</p>

                  {/* Time */}
                  <p className="text-xs text-gray-400 flex items-center gap-1 mb-3">
                    <Clock size={11} />
                    {formatTime(req.requested_at)} · <LiveTimer since={req.requested_at} />
                  </p>

                  {/* Two-button action row — matches reference design exactly */}
                  <div className="flex gap-2">
                    {hasActiveSession ? (
                      <>
                        <button
                          onClick={() => handleDeny(req)}
                          disabled={isLoading}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          <X size={15} /> Decline
                        </button>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={isLoading}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#e05c27] hover:bg-[#c94f1f] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          {isLoading && handling[req.id] === 'approve'
                            ? <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            : <Check size={15} />
                          }
                          Verify &amp; open
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleDeny(req)}
                          disabled={isLoading}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          <X size={15} /> Decline
                        </button>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={isLoading}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#e05c27] hover:bg-[#c94f1f] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          {isLoading && handling[req.id] === 'approve'
                            ? <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            : <Check size={15} />
                          }
                          Approve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )
      )}

      {/* ── DONE TODAY ────────────────────────────────────── */}
      {tab === 'done' && (
        doneToday.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={48} />}
            title="Nothing handled yet today"
            description="Approved and declined requests will appear here."
            className="mt-4"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {doneToday.map(req => {
              const table = tableData[req.table_id]
              const isApproved = req.status === 'approved'
              return (
                <div key={req.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
                  <div className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
                    isApproved ? 'bg-emerald-100' : 'bg-red-100'
                  )}>
                    {isApproved
                      ? <Check size={14} className="text-emerald-600" />
                      : <X size={14} className="text-red-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{table?.label ?? 'Table…'}</p>
                    <p className="text-xs text-gray-400 capitalize">
                      {isApproved ? 'Approved' : 'Declined'} · {req.handled_at ? new Date(req.handled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
