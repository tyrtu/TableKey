import { useState, useEffect, useCallback } from 'react'
import { getTablesByVenue } from '../lib/api'
import { getSupabase } from '../lib/supabase'
import { useTableRealtime, usePolling } from './useRealtime'
import type { RestaurantTable, TableSession } from '../types/database'

export interface TableWithSession extends RestaurantTable {
  active_session: TableSession | null
}

function asTable(v: Record<string, unknown>): RestaurantTable {
  return v as unknown as RestaurantTable
}
function asSession(v: Record<string, unknown>): TableSession {
  return v as unknown as TableSession
}

export function useFloorTables(venueId: string | null) {
  const [tables, setTables] = useState<TableWithSession[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)

    const sb = getSupabase()
    const [tableData, sessionData] = await Promise.all([
      getTablesByVenue(venueId),
      sb.from('table_sessions')
        .select('*')
        .eq('venue_id', venueId)
        .eq('is_active', true),
    ])

    const sessions: TableSession[] = sessionData.data ?? []
    const sessionMap = new Map(sessions.map((s) => [s.table_id, s]))

    setTables(
      (tableData ?? []).map((t) => ({
        ...t,
        active_session: sessionMap.get(t.id) ?? null,
      }))
    )
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  // Realtime (no-op for PIN sessions)
  useTableRealtime('restaurant_tables', 'venue_id', venueId ?? undefined, (payload) => {
    const updated = asTable(payload.new)
    setTables((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))
  })

  useTableRealtime('table_sessions', 'venue_id', venueId ?? undefined, (payload) => {
    const sess = asSession(payload.new)
    setTables((prev) =>
      prev.map((t) =>
        t.id === sess.table_id
          ? { ...t, active_session: sess.is_active ? sess : null }
          : t
      )
    )
  })

  // Polling for PIN sessions
  usePolling(load, [venueId])

  return { tables, loading, reload: load }
}
