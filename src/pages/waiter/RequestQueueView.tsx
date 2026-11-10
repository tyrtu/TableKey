import { useState, useEffect } from 'react'
import { Check, X, Clock, Bell, AlertTriangle, Users, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { approveRequest, denyRequest } from '../../lib/api'
import { getSupabase } from '../../lib/supabase'
import { elapsedMinutes, formatTime } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import type { TableRequest } from '../../types/database'

// #2: MM:SS live timer
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
  return (
    <span className="font-mono tabular-nums">
      {m}:{String(s).padStart(2, '0')}
    </span>
  )
}

interface Props {
  venueId: string | null
  staffId: string | null
  requests: TableRequest[]
}

export function RequestQueueView({ venueId, staffId, requests }: Props) {
  const [handling, setHandling] = useState<Record<string, 'approve' | 'deny' | null>>({})
  const [tableData, setTableData] = useState<Record<string, { label: string; hasActiveSession: boolean }>>({})

  // Load table metadata for each request
  const missingTableIds = requests.map(r => r.table_id).filter(id => !tableData[id])

  if (missingTableIds.length > 0) {
    // Load table info + check for active sessions in one shot
    Promise.all([
      getSupabase()
        .from('restaurant_tables')
        .select('id, table_number, label')
        .in('id', missingTableIds),
      getSupabase()
        .from('table_sessions')
        .select('table_id')
        .in('table_id', missingTableIds)
        .eq('is_active', true),
    ]).then(([tablesRes, sessionsRes]) => {
      const activeTables = new Set((sessionsRes.data ?? []).map(s => s.table_id))
      const map: typeof tableData = {}
      for (const t of tablesRes.data ?? []) {
        map[t.id] = {
          label: `Table ${t.table_number}${t.label ? ` (${t.label})` : ''}`,
          hasActiveSession: activeTables.has(t.id),
        }
      }
      setTableData(prev => ({ ...prev, ...map }))
    })
  }

  const handleApprove = async (request: TableRequest) => {
    if (!venueId || !staffId) return
    setHandling(h => ({ ...h, [request.id]: 'approve' }))
    try {
      const { data: venue } = await getSupabase()
        .from('venues').select('code_length').eq('id', venueId).single()
      const { code, warning } = await approveRequest(request, staffId, venueId, venue?.code_length ?? 4)
      toast.success(
        `Approved ${tableData[request.table_id]?.label ?? 'table'}. Code: ${code.split('').join(' ')}`,
        { duration: 8000 }
      )
      if (warning) {
        toast(warning, {
          icon: <AlertTriangle size={16} />,
          duration: 10000,
          style: { background: '#fef3c7', color: '#92400e', maxWidth: '380px' },
        })
      }
    } catch {
      toast.error('Failed to approve request.')
    } finally {
      setHandling(h => ({ ...h, [request.id]: null }))
    }
  }

  const handleDeny = async (request: TableRequest) => {
    if (!venueId || !staffId) return
    setHandling(h => ({ ...h, [request.id]: 'deny' }))
    try {
      await denyRequest(request.id, staffId, venueId, request.table_id)
      toast('Request denied.', { icon: <X size={16} /> })
    } catch {
      toast.error('Failed to deny request.')
    } finally {
      setHandling(h => ({ ...h, [request.id]: null }))
    }
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<Bell size={48} />}
        title="No pending requests"
        description="When a customer taps 'Request to Order', it appears here."
        className="mt-8"
      />
    )
  }

  const sorted = [...requests].sort((a, b) =>
    elapsedMinutes(b.requested_at) - elapsedMinutes(a.requested_at)
  )

  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        {requests.length} pending request{requests.length !== 1 ? 's' : ''} —
        verify presence at the table before approving.
      </p>

      {sorted.map(req => {
        const elapsed = elapsedMinutes(req.requested_at)
        // Escalation stages based on venue settings (default: 1min→waiters, 2min→manager)
        const isEscalated = !!req.escalated_at || elapsed >= 1
        const isManagerLevel = elapsed >= 2
        const isLoading = !!handling[req.id]
        const table = tableData[req.table_id]
        const hasActiveSession = table?.hasActiveSession ?? false

        // Escalation label
        const escalationLabel = isManagerLevel
          ? 'Escalated to manager'
          : isEscalated
            ? 'All on-duty waiters notified'
            : null

        return (
          <div
            key={req.id}
            className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${
              hasActiveSession ? 'border-orange-300'
              : isManagerLevel ? 'border-red-400'
              : isEscalated ? 'border-yellow-300'
              : 'border-gray-100'
            }`}
          >
            {/* Active session warning */}
            {hasActiveSession && (
              <div className="flex items-start gap-2 bg-orange-50 border-b border-orange-200 px-4 py-2.5">
                <Users size={15} className="text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-orange-800 font-semibold">This table already has an active session</p>
                  <p className="text-xs text-orange-600 mt-0.5">
                    Customer identified as a <strong>new group</strong>. Walk over and confirm before approving.
                  </p>
                </div>
              </div>
            )}

            {/* Escalation banners */}
            {!hasActiveSession && isManagerLevel && (
              <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 px-4 py-2">
                <AlertTriangle size={14} className="text-red-500 shrink-0" />
                <p className="text-xs text-red-700 font-semibold">
                  {elapsed}m — Escalated to manager. Customer still waiting.
                </p>
              </div>
            )}
            {!hasActiveSession && isEscalated && !isManagerLevel && (
              <div className="flex items-center gap-2 bg-yellow-50 border-b border-yellow-200 px-4 py-2">
                <AlertTriangle size={14} className="text-yellow-600 shrink-0" />
                <p className="text-xs text-yellow-700 font-medium">
                  {elapsed}m — All on-duty waiters notified.
                </p>
              </div>
            )}

            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-lg text-gray-900">
                      {table?.label ?? 'Table…'}
                    </p>
                    {/* Show which type of request this is */}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                      hasActiveSession
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {hasActiveSession
                        ? <><UserPlus size={10} /> New group</>
                        : <><Bell size={10} /> First order</>
                      }
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock size={11} />
                    {formatTime(req.requested_at)} · <LiveTimer since={req.requested_at} />
                  </p>
                </div>
                <span className={`h-2.5 w-2.5 rounded-full animate-pulse mt-1.5 ${
                  hasActiveSession ? 'bg-orange-500'
                  : isManagerLevel ? 'bg-red-500'
                  : isEscalated ? 'bg-yellow-500'
                  : 'bg-yellow-400'
                }`} />
              </div>

              <div className={`rounded-xl border px-3 py-2 mb-4 ${
                hasActiveSession
                  ? 'bg-orange-50 border-orange-100'
                  : 'bg-gray-50 border-gray-100'
              }`}>
                <p className="text-xs text-gray-600">
                  {hasActiveSession ? (
                    <><strong>Action needed:</strong> Go to the table. If the previous group has left,
                    approve to start a new session and the old session's bill will be handled.
                    If they're still there, deny — the scanner should tap "I'm with the group" instead.</>
                  ) : (
                    <><strong>Verify in person:</strong> Check that guests are physically at this table
                    before approving. Approving generates a one-time code shown to their device.</>
                  )}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="md"
                  fullWidth
                  onClick={() => handleDeny(req)}
                  loading={isLoading && handling[req.id] === 'deny'}
                  disabled={isLoading}
                >
                  <X size={16} />
                  Deny
                </Button>
                <Button
                  variant="success"
                  size="md"
                  fullWidth
                  onClick={() => handleApprove(req)}
                  loading={isLoading && handling[req.id] === 'approve'}
                  disabled={isLoading}
                >
                  <Check size={16} />
                  Approve
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
