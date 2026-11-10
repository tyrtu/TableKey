import { supabase, getSupabase } from '../supabase'
import type { Venue } from '../../types/database'

export async function getVenueBySlug(slug: string): Promise<Venue | null> {
  const { data } = await supabase.from('venues').select('*').eq('slug', slug).maybeSingle()
  return data
}

export async function getVenueById(id: string): Promise<Venue | null> {
  const { data } = await supabase.from('venues').select('*').eq('id', id).maybeSingle()
  return data
}

export async function updateVenue(id: string, updates: Partial<Venue>): Promise<void> {
  await supabase.from('venues').update(updates).eq('id', id)
}

export async function updateSetupProgress(venueId: string, step: string, value: boolean) {
  const { data: venue } = await getSupabase()
    .from('venues')
    .select('setup_progress')
    .eq('id', venueId)
    .maybeSingle()
  const progress = venue?.setup_progress ?? {}
  progress[step] = value
  await getSupabase().from('venues').update({ setup_progress: progress }).eq('id', venueId)
}

export async function checkRateLimit(
  venueId: string,
  deviceToken: string,
  limit: number
): Promise<boolean> {
  // 2-minute rolling window
  const windowMs = 2 * 60 * 1000
  const windowStart = new Date(Date.now() - windowMs).toISOString()
  const key = `req:device:${deviceToken}`

  const { data: existing } = await supabase
    .from('rate_limit_buckets')
    .select('id, count, window_start')
    .eq('venue_id', venueId)
    .eq('bucket_key', key)
    .maybeSingle()

  if (!existing) {
    await supabase.from('rate_limit_buckets').insert({
      venue_id: venueId, bucket_key: key, count: 1,
      window_start: new Date().toISOString(),
    })
    return true
  }

  if (existing.window_start < windowStart) {
    await supabase.from('rate_limit_buckets')
      .update({ count: 1, window_start: new Date().toISOString() })
      .eq('id', existing.id)
    return true
  }

  if (existing.count >= limit) return false

  await supabase.from('rate_limit_buckets')
    .update({ count: existing.count + 1 })
    .eq('id', existing.id)
  return true
}
