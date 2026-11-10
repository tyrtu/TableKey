import { supabase, getSupabase } from '../supabase'
import { getDeviceToken, getDeviceLabel } from '../device'
import { audit } from './_audit'
import { computeBill } from './payments'
import type { TableSession } from '../../types/database'

export async function getActiveSession(tableId: string): Promise<TableSession | null> {
  const { data } = await supabase
    .from('table_sessions').select('*')
    .eq('table_id', tableId).eq('is_active', true)
    .order('opened_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

export async function verifyCode(
  session: TableSession,
  enteredCode: string,
  venueId: string,
  maxAttempts: number,
  lockoutMinutes = 5
): Promise<{ success: boolean; locked: boolean; lockedUntil?: string; message: string }> {
  const deviceToken = getDeviceToken()
  const lockedUntil = (session as TableSession & { code_locked_until?: string }).code_locked_until

  if (lockedUntil && new Date(lockedUntil) > new Date()) {
    const minsLeft = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000)
    return { success: false, locked: true, lockedUntil,
      message: `Too many wrong attempts. Try again in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}, or ask your waiter.` }
  }
  if (session.code_locked && !lockedUntil) {
    return { success: false, locked: true, message: 'Too many wrong attempts. Ask your waiter for a new code.' }
  }
  if (session.current_code !== enteredCode) {
    const newAttempts = session.code_attempts + 1
    const shouldLock = newAttempts >= maxAttempts
    const newLockedUntil = shouldLock
      ? new Date(Date.now() + lockoutMinutes * 60 * 1000).toISOString() : null

    await supabase.from('table_sessions').update({
      code_attempts: newAttempts, code_locked: shouldLock,
      ...(newLockedUntil ? { code_locked_until: newLockedUntil } : {}),
    }).eq('id', session.id)
    await audit(venueId, 'code_failed', 'customer', deviceToken, 'session', session.id, { attempts: newAttempts, locked: shouldLock })

    if (shouldLock) return { success: false, locked: true, lockedUntil: newLockedUntil ?? undefined,
      message: `Too many wrong attempts. Try again in ${lockoutMinutes} minutes, or ask your waiter.` }
    return { success: false, locked: false,
      message: `Incorrect code. ${maxAttempts - newAttempts} attempt${maxAttempts - newAttempts !== 1 ? 's' : ''} remaining.` }
  }

  const { error } = await supabase.from('session_devices').upsert(
    { session_id: session.id, device_token: deviceToken, device_label: getDeviceLabel(), is_active: true },
    { onConflict: 'device_token,session_id' }
  )
  if (!error) {
    await supabase.from('table_sessions')
      .update({ code_attempts: 0, last_activity: new Date().toISOString() })
      .eq('id', session.id)
    await audit(venueId, 'code_entered', 'customer', deviceToken, 'session', session.id)
    await audit(venueId, 'device_joined', 'customer', deviceToken, 'session', session.id)
  }
  return { success: true, locked: false, message: 'Verified!' }
}

export async function closeSession(
  sessionId: string, tableId: string, venueId: string, staffId: string
) {
  await getSupabase().from('table_sessions')
    .update({ is_active: false, closed_at: new Date().toISOString(), closed_by: staffId, current_code: null })
    .eq('id', sessionId)
  await getSupabase().from('restaurant_tables').update({ status: 'idle' }).eq('id', tableId)
  await audit(venueId, 'session_closed', 'waiter', staffId, 'session', sessionId)
}

export async function closeSessionNormal(
  sessionId: string, tableId: string, venueId: string, staffId: string
) {
  const bill = await computeBill(sessionId)
  if (!bill.is_settled) {
    throw new Error(`Outstanding balance of ${bill.outstanding}. Use override to force close.`)
  }
  await getSupabase().from('table_sessions')
    .update({ is_active: false, closed_at: new Date().toISOString(), current_code: null, closed_by: staffId })
    .eq('id', sessionId)
  await getSupabase().from('restaurant_tables').update({ status: 'idle' }).eq('id', tableId)
  await audit(venueId, 'session_closed', 'waiter', staffId, 'session', sessionId)
}

export async function regenerateCode(
  sessionId: string, venueId: string, staffId: string, codeLength: number
): Promise<string> {
  const code = Array.from({ length: codeLength }, () => Math.floor(Math.random() * 10)).join('')
  await supabase.from('table_sessions')
    .update({ current_code: code, code_expires_at: null, code_attempts: 0, code_locked: false })
    .eq('id', sessionId)
  await audit(venueId, 'code_generated', 'waiter', staffId, 'session', sessionId, { regenerated: true })
  return code
}

export async function confirmPresence(
  sessionId: string,
  venueId: string,
  staffId: string,
  durationMinutes = 30
): Promise<string> {
  const confirmedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
  const { data, error } = await getSupabase()
    .from('table_sessions')
    .update({
      presence_confirmed_until: confirmedUntil,
      last_activity: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('is_active', true)
    .select('presence_confirmed_until')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Active session not found.')
  await audit(venueId, 'presence_confirmed', 'waiter', staffId, 'session', sessionId, {
    duration_minutes: durationMinutes,
    confirmed_until: confirmedUntil,
  })
  return confirmedUntil
}

export async function revokeDevice(deviceId: string, sessionId: string, venueId: string, staffId: string) {
  await supabase.from('session_devices')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', deviceId)
  await audit(venueId, 'device_revoked', 'waiter', staffId, 'session', sessionId)
}

export async function isDeviceVerified(sessionId: string): Promise<boolean> {
  const deviceToken = getDeviceToken()
  const { data } = await supabase.from('session_devices').select('id')
    .eq('session_id', sessionId).eq('device_token', deviceToken).eq('is_active', true).maybeSingle()
  return !!data
}

/** @deprecated Use computeBill() instead */
export async function getSessionBill(sessionId: string) {
  const bill = await computeBill(sessionId)
  return { orders: [] as import('../../types/database').Order[], total: bill.total, paid: bill.paid, outstanding: bill.outstanding, bill }
}
