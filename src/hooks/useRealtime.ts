import { useEffect, useRef } from 'react'
import { getSupabase, isStaffSession } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

type Callback = (payload: {
  eventType: string
  new: Record<string, unknown>
  old: Record<string, unknown>
}) => void

interface RealtimeFilter {
  event?: string
  schema?: string
  table: string
  filter?: string
}

let _channelSeq = 0

export function useRealtimeSubscription(
  config: RealtimeFilter,
  callback: Callback,
  deps: unknown[] = []
) {
  // Keep the latest callback in a ref — avoids re-subscribing when only
  // the callback identity changes (inline arrows, etc.)
  const callbackRef = useRef<Callback>(callback)
  useEffect(() => { callbackRef.current = callback })

  // Stable unique ID for this hook instance (assigned once on mount)
  const instanceId = useRef<number | null>(null)
  if (instanceId.current === null) {
    instanceId.current = ++_channelSeq
  }

  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    // PIN sessions have no JWT → skip realtime, callers use polling
    if (isStaffSession()) return

    // Unique channel name: table + filter + instance id
    // Instance id ensures two hooks filtering the same table don't collide
    const channelName = [
      'rt',
      config.table,
      config.filter ?? 'all',
      config.event ?? '*',
      instanceId.current,
    ].join(':')

    // Tear down previous subscription before creating a new one
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
    }

    const channel = getSupabase().channel(channelName)

    channel
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: config.event ?? '*',
          schema: config.schema ?? 'public',
          table: config.table,
          filter: config.filter,
        },
        (payload: {
          eventType: string
          new: Record<string, unknown>
          old: Record<string, unknown>
        }) => {
          callbackRef.current(payload)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return channelRef
}

/**
 * Subscribe to a table filtered by a column value.
 * Only re-subscribes when table / column / value change.
 */
export function useTableRealtime(
  table: string,
  column: string,
  value: string | undefined,
  callback: Callback
) {
  useRealtimeSubscription(
    { table, filter: value ? `${column}=eq.${value}` : undefined },
    callback,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, column, value]
  )
}

/**
 * Polling fallback for PIN sessions.
 * No-op for regular auth sessions (realtime is used instead).
 */
export function usePolling(
  callback: () => void,
  deps: unknown[] = [],
  intervalMs = 5000
) {
  const callbackRef = useRef(callback)
  useEffect(() => { callbackRef.current = callback })

  useEffect(() => {
    if (!isStaffSession()) return
    callbackRef.current()
    const id = setInterval(() => callbackRef.current(), intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs])
}
