import { getSupabase, supabase } from '../supabase'
import { getDeviceToken, getIdempotencyKey } from '../device'
import { audit } from './_audit'
import { assertOnline } from '../network'
import type { Order, OrderItem, CartItem } from '../../types/database'
import type { LineStatus } from '../../types/database'

export class PresenceConfirmationRequiredError extends Error {
  constructor() {
    super('Your waiter needs to confirm that the table is still occupied before this order is sent.')
    this.name = 'PresenceConfirmationRequiredError'
  }
}

export async function placeOrder(
  venueId: string, tableId: string, sessionId: string,
  cartItems: CartItem[], notes: string, idempotencyKey: string
): Promise<Order> {
  assertOnline('place an order')
  const deviceToken = getDeviceToken()

  const { data: sessionPresence, error: presenceError } = await supabase
    .from('table_sessions')
    .select('presence_confirmed_until')
    .eq('id', sessionId)
    .eq('is_active', true)
    .maybeSingle()
  if (presenceError) throw presenceError
  if (
    !sessionPresence?.presence_confirmed_until ||
    new Date(sessionPresence.presence_confirmed_until) <= new Date()
  ) {
    throw new PresenceConfirmationRequiredError()
  }

  const { data: orderNum } = await supabase.rpc('next_order_number', { p_venue_id: venueId })
  const subtotal = cartItems.reduce((sum, i) => sum + i.lineTotal, 0)

  const { data: order, error } = await supabase.from('orders').insert({
    venue_id: venueId, table_id: tableId, session_id: sessionId,
    device_token: deviceToken, order_number: orderNum, status: 'new',
    notes, subtotal, idempotency_key: idempotencyKey,
  }).select().single()

  // If duplicate key — order was already placed (double-tap / retry), fetch and return it
  if (error?.code === '23505') {
    const { data: existing } = await supabase
      .from('orders').select('*, items:order_items(*)')
      .eq('session_id', sessionId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existing) return existing
  }

  if (error?.message === 'PRESENCE_CONFIRMATION_REQUIRED') {
    throw new PresenceConfirmationRequiredError()
  }
  if (error || !order) throw error ?? new Error('Failed to place order')

  const rows = cartItems.map((ci) => ({
    order_id: order.id, item_id: ci.id, item_name: ci.name, item_price: ci.price,
    quantity: ci.quantity, notes: ci.notes || null,
    options: Object.keys(ci.options).length > 0 ? ci.options : null, line_total: ci.lineTotal,
  }))

  const { error: itemsError } = await supabase.from('order_items').insert(rows)
  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id)
    throw new Error(`Failed to save order items: ${itemsError.message}`)
  }

  await supabase.from('table_sessions')
    .update({ last_activity: new Date().toISOString() }).eq('id', sessionId)
  await supabase.from('restaurant_tables').update({ status: 'active' }).eq('id', tableId)
    .in('status', ['active', 'awaiting_payment'])

  await audit(venueId, 'order_placed', 'customer', deviceToken, 'order', order.id, {
    order_number: orderNum, table_id: tableId, items: cartItems.length, subtotal,
  })
  return order
}

export async function getOrdersBySession(
  sessionId: string
): Promise<Order[]> {
  const { data, error } = await supabase.rpc('get_customer_orders', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return (data ?? []) as Order[]
}

export async function getStaffOrdersBySession(sessionId: string): Promise<Order[]> {
  const { data, error } = await getSupabase().rpc('get_customer_orders', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return (data ?? []) as Order[]
}

export async function getActiveOrdersByVenue(venueId: string): Promise<Order[]> {
  const { data } = await getSupabase().from('orders')
    .select('*, items:order_items(*)')
    .eq('venue_id', venueId)
    .not('status', 'in', '("served","cancelled")')
    .order('placed_at', { ascending: true })
  return data ?? []
}

export async function updateOrderStatus(orderId: string, status: Order['status'], staffId: string, venueId: string) {
  await supabase.from('orders').update({ status }).eq('id', orderId)
  await audit(venueId, 'order_status_changed', 'kitchen', staffId, 'order', orderId, { status })
}

export async function cancelOrder(orderId: string, venueId: string, actorId: string) {
  await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
  await audit(venueId, 'order_cancelled', 'waiter', actorId, 'order', orderId)
}

export async function updateLineStatus(
  orderItemId: string, status: LineStatus, staffId: string, venueId: string
) {
  await supabase.from('order_items').update({ line_status: status }).eq('id', orderItemId)
  await audit(venueId, 'line_status_changed', 'kitchen', staffId, 'order_item', orderItemId, { status })
}

export async function openTableAsWaiter(
  tableId: string, staffId: string, codeLength = 4
): Promise<{ success: boolean; session_id?: string; code?: string; message?: string }> {
  const { data, error } = await getSupabase().rpc('open_table_as_waiter', {
    p_table_id: tableId, p_staff_id: staffId, p_code_length: codeLength,
  })
  if (error) throw error
  return data
}

export async function placeOrderAsWaiter(
  sessionId: string, staffId: string,
  items: import('../../types/database').WaiterOrderItem[],
  notes: string, idempotencyKey: string
): Promise<{ success: boolean; order_id?: string; order_number?: string; subtotal?: number; message?: string }> {
  const payload = items.map(i => ({
    item_id: i.item_id, quantity: i.quantity, notes: i.notes || null,
    options: Object.keys(i.options).length > 0 ? i.options : null,
    options_delta: i.options_delta, allergy_flag: i.allergy_flag,
    allergy_note: i.allergy_note || null,
  }))
  const { data, error } = await getSupabase().rpc('place_waiter_order', {
    p_session_id: sessionId, p_staff_id: staffId,
    p_items: JSON.stringify(payload), p_notes: notes || null,
    p_idempotency_key: idempotencyKey,
  })
  if (error) throw error
  return data
}
