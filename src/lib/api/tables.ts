import { supabase } from '../supabase'
import type { RestaurantTable } from '../../types/database'

export async function getTableByQrToken(qrToken: string): Promise<RestaurantTable | null> {
  const { data } = await supabase
    .from('restaurant_tables').select('*').eq('qr_token', qrToken).maybeSingle()
  return data
}

export async function getTableById(id: string): Promise<RestaurantTable | null> {
  const { data } = await supabase
    .from('restaurant_tables').select('*').eq('id', id).maybeSingle()
  return data
}

export async function getTablesByVenue(venueId: string): Promise<RestaurantTable[]> {
  const { data } = await supabase
    .from('restaurant_tables').select('*').eq('venue_id', venueId).order('table_number')
  return data ?? []
}

export async function createTable(
  venueId: string, tableNumber: string, label: string, capacity: number | null
) {
  const { data, error } = await supabase.from('restaurant_tables').insert({
    venue_id: venueId, table_number: tableNumber, label, capacity,
  }).select().single()
  if (error) throw error
  return data
}

export async function deleteTable(id: string) {
  const { error } = await supabase.from('restaurant_tables').delete().eq('id', id)
  if (error) throw error
}
