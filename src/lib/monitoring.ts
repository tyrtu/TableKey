/**
 * Thin wrapper around Sentry so the rest of the app doesn't need to import
 * @sentry/react directly. All calls are no-ops when Sentry isn't initialised
 * (i.e. VITE_SENTRY_DSN is not set).
 */
import * as Sentry from '@sentry/react'

/**
 * Report a caught error with optional extra context.
 *
 * Usage:
 *   try { ... }
 *   catch (err) { captureError(err, { context: 'placeOrder', sessionId }) }
 */
export function captureError(
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return

  Sentry.withScope((scope) => {
    if (extra) scope.setExtras(extra)
    Sentry.captureException(err)
  })
}

/**
 * Report a non-fatal message (warning / unexpected state).
 *
 * Usage:
 *   captureMessage('computeBill returned null for active session', { sessionId })
 */
export function captureMessage(
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return

  Sentry.withScope((scope) => {
    if (extra) scope.setExtras(extra)
    Sentry.captureMessage(message, 'warning')
  })
}

/**
 * Attach the current authenticated user to all subsequent Sentry events.
 * Call this after staff/auth sign-in. Pass null to clear on sign-out.
 */
export function identifyUser(user: { id: string; role: string; venueId: string } | null): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return

  if (user) {
    Sentry.setUser({ id: user.id, role: user.role, venue_id: user.venueId })
  } else {
    Sentry.setUser(null)
  }
}
