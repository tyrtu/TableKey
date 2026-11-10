import { getSupabase } from '../supabase'
import type { KitchenStation } from '../../types/database'

export async function getStations(venueId: string): Promise<KitchenStation[]> {
  const { data } = await getSupabase().from('kitchen_stations')
    .select('*').eq('venue_id', venueId).eq('active', true).order('sort_order')
  return (data ?? []) as KitchenStation[]
}

export async function upsertStation(
  station: Partial<KitchenStation> & { venue_id: string; name: string }
) {
  const { data, error } = await getSupabase().from('kitchen_stations').upsert(station).select().single()
  if (error) throw error
  return data as KitchenStation
}

export async function deleteStation(id: string) {
  await getSupabase().from('kitchen_stations').delete().eq('id', id)
}

export async function getMyStations(staffId: string): Promise<string[]> {
  const { data } = await getSupabase().from('staff_station_assignments')
    .select('station_id').eq('staff_id', staffId)
  return (data ?? []).map((r: { station_id: string }) => r.station_id)
}

export async function setMyStations(staffId: string, stationIds: string[]) {
  const sb = getSupabase()
  await sb.from('staff_station_assignments').delete().eq('staff_id', staffId)
  if (stationIds.length > 0) {
    await sb.from('staff_station_assignments').insert(
      stationIds.map(s => ({ staff_id: staffId, station_id: s }))
    )
  }
}
