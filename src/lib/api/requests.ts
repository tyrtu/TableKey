import { getSupabase, supabase } from '../supabase'
import { getDeviceToken } from '../device'
import { audit, type AuditAction } from './_audit'
import type { TableRequest, TableSession } from '../../types/database'

export class AlreadySeatedError extends Error {
  constructor(public readonly sessionId: string) {
    super('You are already seated at this table.')
    this.name = 'AlreadySeatedError'
  }
}

export async function createTableRequest(
  venueId: string,
  tableId: string
): Promise<TableRequest | null> {
  const deviceToken = getDeviceToken()
  const { data: activeSession } = await supabase
    .from('table_sessions')
    .select('id')
    .eq('table_id', tableId)
    .eq('is_active', true)
    .maybeSingle()

  if (activeSession) {
    const { data: activeDevice } = await supabase
      .from('session_devices')
      .select('id')
      .eq('session_id', activeSession.id)
      .eq('device_token', deviceToken)
      .eq('is_active', true)
      .maybeSingle()

    if (activeDevice) throw new AlreadySeatedError(activeSession.id)
  }

  // Check for an existing pending request from this device (avoids 409 on retry)
  const { data: existingRequest } = await supabase
    .from('table_requests')
    .select('*')
    .eq('table_id', tableId)
    .eq('device_token', deviceToken)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingRequest) return existingRequest

  const { data, error } = await supabase
    .from('table_requests')
    .insert({ venue_id: venueId, table_id: tableId, device_token: deviceToken, status: 'pending' })
    .select()
    .single()

  if (error) {
    // 409 = unique constraint — a pending request already exists for this device+table
    if (error.code === '23505' || error.code === '409') {
      const { data: existing } = await supabase
        .from('table_requests')
        .select('*')
        .eq('table_id', tableId)
        .eq('device_token', deviceToken)
        .eq('status', 'pending')
        .maybeSingle()
      if (existing) return existing
    }
    throw error
  }
  await audit(venueId, 'table_request', 'customer', deviceToken, 'table', tableId, { request_id: data.id })
  return data
}

export async function getPendingRequests(venueId: string): Promise<TableRequest[]> {
  const { data } = await getSupabase()
    .from('table_requests')
    .select('*')
    .eq('venue_id', venueId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
  return data ?? []
}

export async function approveRequest(
  request: TableRequest,
  staffId: string,
  venueId: string,
  codeLength: number
): Promise<{ session: TableSession; code: string; warning?: string }> {
  let warning: string | undefined
  const staffClient = getSupabase()

  const { data: existingSession } = await staffClient
    .from('table_sessions').select('id')
    .eq('table_id', request.table_id).eq('is_active', true).maybeSingle()

  if (existingSession) {
    try {
      const { data: existingDevice } = await staffClient
        .from('session_devices').select('id')
        .eq('session_id', existingSession.id)
        .eq('device_token', request.device_token)
        .eq('is_active', true).maybeSingle()

      if (existingDevice) {
        await staffClient.from('table_requests').update({
          status: 'approved', handled_by: staffId,
          handled_at: new Date().toISOString(), session_id: existingSession.id,
        }).eq('id', request.id)

        await audit(venueId, 'request_approved', 'waiter', staffId, 'session', existingSession.id, {
          request_id: request.id, reused_session: true,
        })

        const { data: reusedSession } = await staffClient
          .from('table_sessions').select('*').eq('id', existingSession.id).single()
        return {
          session: reusedSession as TableSession,
          code: reusedSession?.current_code ?? '',
          warning,
        }
      } else {
        const { data: billData } = await staffClient.rpc('compute_bill', { p_session_id: existingSession.id })
        const outstanding = billData ? Number(billData.outstanding ?? 0) : 0
        if (outstanding > 0) {
          warning = `Previous session had an outstanding balance of ${outstanding}. Logged as an override — check reconciliation.`
          await staffClient.from('table_sessions')
            .update({ is_active: false, closed_at: new Date().toISOString() })
            .eq('id', existingSession.id)
          await staffClient.from('session_close_overrides').insert({
            session_id: existingSession.id, venue_id: venueId, outstanding,
            reason: 'other', note: 'Auto-closed when waiter approved new session for same table',
            created_by: staffId,
          })
          await audit(venueId, 'session_close_override' as AuditAction, 'waiter', staffId,
            'session', existingSession.id, { reason: 'new_group_seated', outstanding })
        } else {
          await staffClient.from('table_sessions')
            .update({ is_active: false, closed_at: new Date().toISOString() })
            .eq('id', existingSession.id)
        }
      }
    } catch {
      await staffClient.from('table_sessions')
        .update({ is_active: false, closed_at: new Date().toISOString() })
        .eq('table_id', request.table_id).eq('is_active', true)
    }
  }

  const { data: session, error: sErr } = await staffClient
    .from('table_sessions').insert({
      venue_id: venueId, table_id: request.table_id, opened_by: staffId,
      current_code: Array.from({ length: codeLength }, () => Math.floor(Math.random() * 10)).join(''),
      code_expires_at: null,
      is_active: true, last_activity: new Date().toISOString(),
    }).select().single()
  if (sErr || !session) throw sErr ?? new Error('Failed to create session')

  await staffClient.from('table_requests').update({
    status: 'approved', handled_by: staffId,
    handled_at: new Date().toISOString(), session_id: session.id,
  }).eq('id', request.id)

  await staffClient.from('restaurant_tables').update({ status: 'active' }).eq('id', request.table_id)

  await audit(venueId, 'request_approved', 'waiter', staffId, 'session', session.id, {
    request_id: request.id, table_id: request.table_id,
  })
  await audit(venueId, 'code_generated', 'waiter', staffId, 'session', session.id)
  await audit(venueId, 'session_opened', 'waiter', staffId, 'session', session.id, { table_id: request.table_id })

  await staffClient.from('session_devices').upsert(
    { session_id: session.id, device_token: request.device_token, device_label: 'Requester', is_active: true },
    { onConflict: 'device_token,session_id' }
  )

  await audit(venueId, 'device_joined', 'customer', request.device_token, 'session', session.id, { auto_approved: true })

  await staffClient.from('rate_limit_buckets')
    .update({ count: 0 })
    .eq('bucket_key', `req:device:${request.device_token}`)
    .eq('venue_id', venueId)

  return { session: session as TableSession, code: session.current_code ?? '', warning }
}

export async function denyRequest(
  requestId: string, staffId: string, venueId: string, tableId: string
) {
  await getSupabase().from('table_requests')
    .update({ status: 'denied', handled_by: staffId, handled_at: new Date().toISOString() })
    .eq('id', requestId)
  await audit(venueId, 'request_denied', 'waiter', staffId, 'table', tableId, { request_id: requestId })
}
