import { supabase, getSupabase } from '../supabase'
import { audit } from './_audit'
import type { Staff } from '../../types/database'

export async function getStaffByVenue(venueId: string): Promise<Staff[]> {
  const { data } = await supabase.from('staff').select('*').eq('venue_id', venueId).order('name')
  return data ?? []
}

export async function inviteStaff(venueId: string, email: string, name: string, role: Staff['role']) {
  const { data, error } = await supabase.from('staff')
    .insert({ venue_id: venueId, email, name, role }).select().single()
  if (error) throw error
  return data
}

export async function removeStaff(staffId: string) {
  await supabase.from('staff').update({ active: false }).eq('id', staffId)
}

export async function reactivateStaff(staffId: string) {
  await getSupabase().from('staff').update({ active: true }).eq('id', staffId)
}

export async function updateStaffRole(staffId: string, role: Staff['role'], _venueId: string) {
  await getSupabase().from('staff').update({ role }).eq('id', staffId)
}

export async function transferOwnership(venueId: string, newOwnerStaffId: string) {
  const { error } = await getSupabase().rpc('transfer_ownership', {
    p_venue_id: venueId, p_new_owner_staff_id: newOwnerStaffId,
  })
  if (error) throw error
}

export async function ownerSignup(restaurantName: string, ownerName: string, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(), password,
    options: { data: { restaurant_name: restaurantName.trim(), owner_name: ownerName.trim(), signup_type: 'owner' } },
  })
  if (error) throw error
  return data
}

export async function generatePairingCode(venueId: string, label?: string) {
  const { data, error } = await getSupabase().rpc('generate_pairing_code', { p_venue_id: venueId, p_label: label ?? null })
  if (error) throw error
  return data
}

export async function pairDevice(pairingCode: string, deviceLabel: string) {
  const { data, error } = await supabase.rpc('pair_device', { p_pairing_code: pairingCode, p_device_label: deviceLabel })
  if (error) throw error
  return data
}

export async function getPairedDevices(venueId: string) {
  const { data } = await getSupabase().from('paired_devices').select('*')
    .eq('venue_id', venueId).not('paired_at', 'is', null).order('paired_at', { ascending: false })
  return data ?? []
}

export async function lockDevice(deviceId: string) {
  await getSupabase().from('paired_devices')
    .update({ locked: true, locked_at: new Date().toISOString() }).eq('id', deviceId)
}

export async function unpairDevice(deviceId: string) {
  await getSupabase().from('paired_devices').delete().eq('id', deviceId)
}

export async function setStaffPin(staffId: string, pin: string) {
  const { error } = await getSupabase().rpc('set_staff_pin', { p_staff_id: staffId, p_pin: pin })
  if (error) throw error
}

export async function resetStaffPin(staffId: string) {
  const { error } = await getSupabase().rpc('reset_staff_pin', { p_staff_id: staffId })
  if (error) throw error
}

export async function getStaffForPin(deviceToken: string) {
  const { data } = await supabase.rpc('get_staff_for_pin', { p_device_token: deviceToken })
  return (data ?? []) as { id: string; name: string; role: string; has_pin: boolean }[]
}

export async function toggleDuty(staffId: string, onDuty: boolean, venueId: string) {
  await getSupabase().from('staff').update({ on_duty: onDuty }).eq('id', staffId)
  await audit(venueId, onDuty ? 'duty_on' : 'duty_off', 'waiter', staffId, 'staff', staffId)
}

export async function getAssignedTableIds(staffId: string): Promise<string[]> {
  const { data } = await getSupabase().from('staff_table_assignments').select('table_id').eq('staff_id', staffId)
  return (data ?? []).map((r: { table_id: string }) => r.table_id)
}

export async function assignTables(staffId: string, tableIds: string[], venueId: string) {
  const sb = getSupabase()
  await sb.from('staff_table_assignments').delete().eq('staff_id', staffId)
  if (tableIds.length > 0) {
    await sb.from('staff_table_assignments').insert(
      tableIds.map((tableId) => ({ staff_id: staffId, table_id: tableId, shift: 'all_day' as const }))
    )
  }
  await audit(venueId, 'table_assigned', 'admin', staffId, 'staff', staffId, { tableIds })
}
