import { useEffect, useRef } from 'react'
import { getSupabase } from '../lib/supabase'

/**
 * Polls the run_session_timeouts() RPC every 2 minutes
 * while the app is open. This is a fallback for when pg_cron
 * is not available (Supabase free plan).
 *
 * Only runs when the user is authenticated (staff/owner).
 * Safe to run multiple times — the RPC is idempotent.
 */
export function useSessionTimeouts(enabled: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const run = async () => {
      try {
        await getSupabase().rpc('run_session_timeouts')
      } catch {
        // Silently ignore — function may not exist yet (migration not run)
      }
    }

    // Run once on mount, then every 2 minutes
    run()
    intervalRef.current = setInterval(run, 2 * 60 * 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled])
}
