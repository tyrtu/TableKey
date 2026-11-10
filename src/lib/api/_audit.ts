// ── Internal audit helper ─────────────────────────────────────
// Not exported publicly. Import from here within the api/ modules.
// Routes through insert_audit_record() SECURITY DEFINER RPC so
// anon clients no longer need direct INSERT on audit_log.

import { getSupabase } from '../supabase'

export type AuditAction =
  | 'table_request' | 'request_approved' | 'request_denied'
  | 'code_generated' | 'code_entered' | 'code_failed'
  | 'session_opened' | 'session_closed' | 'device_joined' | 'device_revoked'
  | 'order_placed' | 'order_status_changed' | 'order_cancelled'
  | 'payment_initiated' | 'payment_completed' | 'payment_failed'
  | 'item_86ed' | 'item_restored'
  | 'staff_invited' | 'staff_removed'
  | 'settings_changed'
  | 'owner_signup' | 'pin_set' | 'pin_reset' | 'pin_login_success' | 'pin_login_failed'
  | 'device_paired' | 'device_unpaired' | 'device_locked'
  | 'role_changed' | 'staff_deactivated' | 'staff_activated'
  | 'table_assigned' | 'table_unassigned'
  | 'duty_on' | 'duty_off'
  | 'ownership_transferred'
  | 'session_settled' | 'session_parked' | 'session_unparked' | 'session_turned_over'
  | 'presence_confirmed'
  | 'session_close_override'
  | 'cart_conflict' | 'order_held' | 'order_hold_released'
  | 'table_slug_rotated'
  | 'payment_processing' | 'payment_succeeded' | 'payment_cancelled' | 'payment_refunded'
  | 'item_voided' | 'item_comped' | 'item_reserved' | 'item_reservation_released'
  | 'cash_payment_recorded' | 'receipt_generated'
  | 'table_opened_by_waiter' | 'waiter_order_placed' | 'line_status_changed'
  | 'help_request_created' | 'help_request_acknowledged' | 'help_request_resolved'
  | 'station_created' | 'station_rerouted'

export async function audit(
  venueId: string,
  action: AuditAction,
  actorType: 'customer' | 'waiter' | 'kitchen' | 'admin' | 'system',
  actorId: string,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) {
  // Use SECURITY DEFINER RPC instead of direct insert —
  // anon clients no longer have INSERT on audit_log directly.
  await getSupabase().rpc('insert_audit_record', {
    p_venue_id:    venueId,
    p_action:      action,
    p_actor_type:  actorType,
    p_actor_id:    actorId,
    p_target_type: targetType ?? null,
    p_target_id:   targetId ?? null,
    p_metadata:    metadata ?? null,
  })
  // Failures are intentionally swallowed — audit must never
  // break the main flow. The RPC itself also swallows exceptions.
}
