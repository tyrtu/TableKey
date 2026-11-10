import { useState, useEffect, useCallback } from 'react'
import { getOrdersBySession, getActiveOrdersByVenue } from '../lib/api'
import { useTableRealtime, usePolling } from './useRealtime'
import type { Order } from '../types/database'

function asOrder(v: Record<string, unknown>): Order {
  return v as unknown as Order
}

export function useSessionOrders(sessionId: string | null) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!sessionId) {
      setOrders([])
      setError(null)
      return
    }
    setLoading(true)
    try {
      const data = await getOrdersBySession(sessionId)
      setOrders(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load session orders'))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  // Realtime for auth sessions, polling for PIN sessions
  useTableRealtime('orders', 'session_id', sessionId ?? undefined, (payload) => {
    if (payload.eventType === 'INSERT') {
      setOrders((prev) => {
        const row = asOrder(payload.new)
        if (prev.find((o) => o.id === row.id)) return prev
        return [...prev, row]
      })
    } else if (payload.eventType === 'UPDATE') {
      const row = asOrder(payload.new)
      setOrders((prev) => prev.map((o) => (o.id === row.id ? { ...o, ...row } : o)))
    }
  })

  usePolling(load, [sessionId])

  return { orders, loading, error, reload: load }
}

export function useVenueOrders(venueId: string | null) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    const data = await getActiveOrdersByVenue(venueId)
    setOrders(data)
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  // Realtime (no-op for PIN sessions)
  useTableRealtime('orders', 'venue_id', venueId ?? undefined, (payload) => {
    const updated = asOrder(payload.new)
    if (payload.eventType === 'INSERT') {
      if (['served', 'cancelled'].includes(updated.status)) return
      setOrders((prev) => {
        if (prev.find((o) => o.id === updated.id)) return prev
        return [...prev, updated]
      })
    } else if (payload.eventType === 'UPDATE') {
      setOrders((prev) => {
        if (['served', 'cancelled'].includes(updated.status)) {
          return prev.filter((o) => o.id !== updated.id)
        }
        return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
      })
    }
  })

  // Polling for PIN sessions
  usePolling(load, [venueId])

  return { orders, loading, reload: load }
}
