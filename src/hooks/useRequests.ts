import { useState, useEffect, useCallback } from 'react'
import { getPendingRequests } from '../lib/api'
import { useTableRealtime, usePolling } from './useRealtime'
import type { TableRequest } from '../types/database'

function asRequest(v: Record<string, unknown>): TableRequest {
  return v as unknown as TableRequest
}

export function usePendingRequests(venueId: string | null) {
  const [requests, setRequests] = useState<TableRequest[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    const data = await getPendingRequests(venueId)
    setRequests(data)
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  // Realtime (no-op for PIN sessions)
  useTableRealtime('table_requests', 'venue_id', venueId ?? undefined, (payload) => {
    if (payload.eventType === 'INSERT') {
      const req = asRequest(payload.new)
      if (req.status === 'pending') {
        setRequests((prev) => {
          if (prev.find((r) => r.id === req.id)) return prev
          return [...prev, req]
        })
      }
    } else if (payload.eventType === 'UPDATE') {
      const req = asRequest(payload.new)
      if (req.status !== 'pending') {
        setRequests((prev) => prev.filter((r) => r.id !== req.id))
      }
    }
  })

  // Polling for PIN sessions
  usePolling(load, [venueId])

  return { requests, loading, reload: load }
}
