import { supabase, getSupabase } from '../supabase'
import { getDeviceToken } from '../device'
import { audit } from './_audit'
import type { HelpRequest } from '../../types/database'

export async function createHelpRequest(
  venueId: string, sessionId: string, tableId: string,
  requestType: HelpRequest['request_type'],
  opts?: { orderId?: string; orderItemId?: string; problemType?: HelpRequest['problem_type']; note?: string }
): Promise<HelpRequest> {
  const deviceToken = getDeviceToken()
  const { data, error } = await supabase.from('help_requests').insert({
    venue_id: venueId, session_id: sessionId, table_id: tableId,
    device_token: deviceToken, request_type: requestType,
    order_id: opts?.orderId ?? null, order_item_id: opts?.orderItemId ?? null,
    problem_type: opts?.problemType ?? null, note: opts?.note ?? null,
  }).select().single()
  if (error) throw error
  await audit(venueId, 'help_request_created', 'customer', deviceToken, 'help_request', data.id, { type: requestType })
  return data as HelpRequest
}

export async function cancelHelpRequest(requestId: string) {
  await supabase.from('help_requests')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', requestId)
}

export async function getPendingHelpRequests(venueId: string): Promise<HelpRequest[]> {
  const { data } = await getSupabase().from('help_requests').select('*')
    .eq('venue_id', venueId).in('status', ['open', 'acknowledged'])
    .order('created_at', { ascending: true })
  return (data ?? []) as HelpRequest[]
}

export async function acknowledgeHelpRequest(requestId: string, staffId: string) {
  await getSupabase().rpc('acknowledge_help_request', { p_request_id: requestId, p_staff_id: staffId })
}

export async function resolveHelpRequest(
  requestId: string, staffId: string,
  resolution?: HelpRequest['resolution'], note?: string
) {
  await getSupabase().rpc('resolve_help_request', {
    p_request_id: requestId, p_staff_id: staffId,
    p_resolution: resolution ?? null, p_resolution_note: note ?? null,
  })
}

export async function getSessionHelpRequests(sessionId: string): Promise<HelpRequest[]> {
  const { data } = await supabase.from('help_requests').select('*')
    .eq('session_id', sessionId).order('created_at', { ascending: false })
  return (data ?? []) as HelpRequest[]
}
