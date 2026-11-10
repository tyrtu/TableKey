import { supabase } from '../supabase'
import type { MenuCategory, MenuItem, ItemOption } from '../../types/database'

export async function getMenu(venueId: string): Promise<{
  categories: MenuCategory[]
  items: MenuItem[]
  options: ItemOption[]
}> {
  const itemIds = (await supabase.from('menu_items').select('id').eq('venue_id', venueId))
    .data?.map((i) => i.id) ?? []

  const [catRes, itemRes, optRes] = await Promise.all([
    supabase.from('menu_categories').select('*').eq('venue_id', venueId).eq('active', true).order('sort_order'),
    supabase.from('menu_items').select('*').eq('venue_id', venueId).order('sort_order'),
    supabase.from('item_options').select('*, choices:item_option_choices(*)').in('item_id', itemIds),
  ])
  return {
    categories: catRes.data ?? [],
    items: itemRes.data ?? [],
    options: optRes.data ?? [],
  }
}

export async function toggleItemAvailability(itemId: string, available: boolean) {
  await supabase.from('menu_items').update({ available }).eq('id', itemId)
}

export async function upsertMenuItem(item: Partial<MenuItem> & {
  venue_id: string; category_id: string; name: string; price: number
}) {
  const { data, error } = await supabase.from('menu_items').upsert(item).select().single()
  if (error) throw error
  return data
}

export async function deleteMenuItem(id: string) {
  await supabase.from('menu_items').delete().eq('id', id)
}

export async function upsertCategory(cat: Partial<MenuCategory> & { venue_id: string; name: string }) {
  const { data, error } = await supabase.from('menu_categories').upsert(cat).select().single()
  if (error) throw error
  return data
}

export async function deleteCategory(id: string) {
  await supabase.from('menu_categories').delete().eq('id', id)
}
