import { supabase, getSupabase } from '../supabase'
import { computeBill } from './payments'
import type { ReconciliationReport } from '../../types/database'

// ── Exported interfaces ────────────────────────────────────────

export interface RightNow {
  activeTables: number
  ordersInKitchen: number
  outstandingBalance: number
  pendingRequests: number
  unpaidParkedCount: number
  unpaidParkedBalance: number
}

export interface NetSalesSummary {
  grossSales: number; voids: number; comps: number; refunds: number
  netSales: number; taxCollected: number; serviceCharge: number; tips: number
  moneyReceived: number; sessions: number; orders: number
  avgBill: number; avgOrder: number
}

export interface SalesTarget {
  id: string; venue_id: string; period: 'daily' | 'weekly' | 'monthly'
  amount: number; starts_on: string
}

export interface ExpenseCategory { id: string; name: string; color: string; sort_order: number }

export interface Expense {
  id: string; venue_id: string; category_id: string | null
  description: string; amount: number; is_recurring: boolean
  recur_period: string | null; expense_date: string
  budget: number | null; notes: string | null
}

export interface ItemCost { id: string; venue_id: string; item_id: string; cost: number }

export interface PurchasingItem {
  item_id: string; item_name: string; category: string
  avgUnitsPerWeek: number; peakUnitsPerWeek: number; suggestedOrderQty: number
}

// ── Functions ──────────────────────────────────────────────────

export async function getRightNow(venueId: string): Promise<RightNow> {
  const sb = getSupabase()
  const [tablesRes, ordersRes, requestsRes, billsRes, parkedRes] = await Promise.all([
    sb.from('restaurant_tables').select('id, status').eq('venue_id', venueId)
      .in('status', ['active', 'settling', 'awaiting_payment']),
    sb.from('orders').select('id').eq('venue_id', venueId).in('status', ['new', 'preparing']),
    sb.from('table_requests').select('id').eq('venue_id', venueId).eq('status', 'pending'),
    sb.from('table_sessions').select('id').eq('venue_id', venueId).eq('is_active', true),
    sb.from('table_sessions').select('id').eq('venue_id', venueId).eq('is_active', false)
      .not('parked_at', 'is', null),
  ])

  let outstandingBalance = 0
  for (const sess of billsRes.data ?? []) {
    try { const { data } = await sb.rpc('compute_bill', { p_session_id: sess.id }); outstandingBalance += Number(data?.outstanding ?? 0) } catch { /* ignore */ }
  }

  let unpaidParkedBalance = 0, unpaidParkedCount = 0
  for (const sess of parkedRes.data ?? []) {
    try {
      const { data } = await sb.rpc('compute_bill', { p_session_id: sess.id })
      const o = Number(data?.outstanding ?? 0)
      if (o > 0) { unpaidParkedBalance += o; unpaidParkedCount++ }
    } catch { /* ignore */ }
  }

  return {
    activeTables: (tablesRes.data ?? []).length,
    ordersInKitchen: (ordersRes.data ?? []).length,
    outstandingBalance,
    pendingRequests: (requestsRes.data ?? []).length,
    unpaidParkedCount,
    unpaidParkedBalance,
  }
}

export async function getNetSalesSummary(venueId: string, fromDate: string, toDate: string): Promise<NetSalesSummary> {
  const sb = getSupabase()
  const [itemsRes, paymentsRes, ordersRes, sessionsRes] = await Promise.all([
    sb.from('order_items')
      .select('line_total, quantity, payment_status, orders!inner(venue_id, placed_at, status)')
      .eq('orders.venue_id', venueId).gte('orders.placed_at', fromDate).lte('orders.placed_at', toDate)
      .neq('orders.status', 'cancelled'),
    sb.from('payments_v2').select('total, tip_amount, tax_amount, service_charge_amount, state, method')
      .eq('venue_id', venueId).eq('state', 'succeeded').gte('initiated_at', fromDate).lte('initiated_at', toDate),
    sb.from('orders').select('id, subtotal').eq('venue_id', venueId)
      .gte('placed_at', fromDate).lte('placed_at', toDate).neq('status', 'cancelled'),
    sb.from('table_sessions').select('id').eq('venue_id', venueId)
      .gte('opened_at', fromDate).lte('opened_at', toDate),
  ])

  const items = itemsRes.data ?? []
  let grossSales = 0, voids = 0, comps = 0
  for (const item of items) {
    const lt = Number(item.line_total)
    if (item.payment_status === 'voided') voids += lt
    else if (item.payment_status === 'comped') comps += lt
    else grossSales += lt
  }

  const payments = paymentsRes.data ?? []
  const taxCollected = payments.reduce((s, p) => s + Number(p.tax_amount ?? 0), 0)
  const serviceCharge = payments.reduce((s, p) => s + Number(p.service_charge_amount ?? 0), 0)
  const tips = payments.reduce((s, p) => s + Number(p.tip_amount ?? 0), 0)
  const moneyReceived = payments.reduce((s, p) => s + Number(p.total ?? 0), 0)

  const { data: refundPayments } = await sb.from('payments_v2').select('total')
    .eq('venue_id', venueId).eq('state', 'refunded').gte('initiated_at', fromDate).lte('initiated_at', toDate)
  const refunds = (refundPayments ?? []).reduce((s, p) => s + Number(p.total ?? 0), 0)
  const netSales = grossSales - voids - comps - refunds
  const orderCount = (ordersRes.data ?? []).length
  const sessionCount = (sessionsRes.data ?? []).length

  return {
    grossSales, voids, comps, refunds, netSales, taxCollected, serviceCharge, tips, moneyReceived,
    sessions: sessionCount, orders: orderCount,
    avgBill: sessionCount > 0 ? netSales / sessionCount : 0,
    avgOrder: orderCount > 0 ? netSales / orderCount : 0,
  }
}

export async function getTargets(venueId: string): Promise<SalesTarget[]> {
  const { data } = await getSupabase().from('sales_targets').select('*').eq('venue_id', venueId).order('starts_on', { ascending: false })
  return (data ?? []) as SalesTarget[]
}

export async function upsertTarget(target: Omit<SalesTarget, 'id'>) {
  const { data, error } = await getSupabase().from('sales_targets')
    .upsert(target, { onConflict: 'venue_id,period,starts_on' }).select().single()
  if (error) throw error
  return data
}

export async function deleteTarget(id: string) {
  await getSupabase().from('sales_targets').delete().eq('id', id)
}

export async function getExpenseCategories(venueId: string): Promise<ExpenseCategory[]> {
  const { data } = await getSupabase().from('expense_categories').select('*').eq('venue_id', venueId).order('sort_order')
  return (data ?? []) as ExpenseCategory[]
}

export async function getExpenses(venueId: string, fromDate: string, toDate: string): Promise<Expense[]> {
  const { data } = await getSupabase().from('expenses').select('*').eq('venue_id', venueId)
    .gte('expense_date', fromDate).lte('expense_date', toDate).order('expense_date', { ascending: false })
  return (data ?? []) as Expense[]
}

export async function upsertExpense(expense: Partial<Expense> & { venue_id: string; description: string; amount: number; expense_date: string }) {
  const { data, error } = await getSupabase().from('expenses').upsert(expense).select().single()
  if (error) throw error
  return data
}

export async function deleteExpense(id: string) {
  await getSupabase().from('expenses').delete().eq('id', id)
}

export async function getItemCosts(venueId: string): Promise<ItemCost[]> {
  const { data } = await getSupabase().from('item_costs').select('*').eq('venue_id', venueId)
  return (data ?? []) as ItemCost[]
}

export async function upsertItemCost(venueId: string, itemId: string, cost: number) {
  const { error } = await getSupabase().from('item_costs')
    .upsert({ venue_id: venueId, item_id: itemId, cost, updated_at: new Date().toISOString() }, { onConflict: 'item_id' })
  if (error) throw error
}

export async function getPurchasingGuide(venueId: string): Promise<PurchasingItem[]> {
  const from = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await getSupabase().from('order_items')
    .select('item_id, item_name, quantity, orders!inner(placed_at, venue_id, status)')
    .eq('orders.venue_id', venueId).gte('orders.placed_at', from)
    .neq('orders.status', 'cancelled').not('payment_status', 'in', '("voided","comped")')
  if (!data || data.length === 0) return []

  const itemWeeks = new Map<string, { name: string; weekCounts: Map<string, number> }>()
  for (const row of data) {
    const orderArr = row.orders as unknown as { placed_at: string }[]
    const ord = Array.isArray(orderArr) ? orderArr[0] : (row.orders as unknown as { placed_at: string })
    const weekKey = new Date(ord.placed_at).toISOString().slice(0, 10).replace(/-\d{2}$/, '-01')
    const entry = itemWeeks.get(row.item_id) ?? { name: row.item_name, weekCounts: new Map() }
    entry.weekCounts.set(weekKey, (entry.weekCounts.get(weekKey) ?? 0) + row.quantity)
    itemWeeks.set(row.item_id, entry)
  }

  return Array.from(itemWeeks.entries()).map(([item_id, { name, weekCounts }]) => {
    const counts = Array.from(weekCounts.values())
    const avg = counts.reduce((s, n) => s + n, 0) / Math.max(counts.length, 1)
    const peak = Math.max(...counts)
    return { item_id, item_name: name, category: '', avgUnitsPerWeek: Math.round(avg * 10) / 10, peakUnitsPerWeek: peak, suggestedOrderQty: Math.ceil(avg * 1.2) }
  }).sort((a, b) => b.avgUnitsPerWeek - a.avgUnitsPerWeek)
}

export async function getAnalytics(venueId: string, fromDate: string, toDate?: string) {
  const [ordersRes, requestsRes, paymentsRes, itemsRes] = await Promise.all([
    supabase.from('orders').select('placed_at, subtotal, status, table_id').eq('venue_id', venueId).gte('placed_at', fromDate).lte('placed_at', toDate ?? new Date().toISOString()).order('placed_at'),
    supabase.from('table_requests').select('requested_at, status, handled_at').eq('venue_id', venueId).gte('requested_at', fromDate).lte('requested_at', toDate ?? new Date().toISOString()),
    supabase.from('payments_v2').select('initiated_at, total, state, method, tip_amount').eq('venue_id', venueId).eq('state', 'succeeded').gte('initiated_at', fromDate).lte('initiated_at', toDate ?? new Date().toISOString()),
    supabase.from('order_items').select('item_name, item_price, quantity, line_total, payment_status, order_id, orders!inner(venue_id, placed_at, status)').eq('orders.venue_id', venueId).gte('orders.placed_at', fromDate).lte('orders.placed_at', toDate ?? new Date().toISOString()).neq('orders.status', 'cancelled'),
  ])
  return { orders: ordersRes.data ?? [], requests: requestsRes.data ?? [], payments: paymentsRes.data ?? [], orderItems: itemsRes.data ?? [] }
}

export async function getAuditLog(venueId: string, limit = 100) {
  const { data } = await supabase.from('audit_log').select('*').eq('venue_id', venueId)
    .order('created_at', { ascending: false }).limit(limit)
  return data ?? []
}

export function getPreviousPeriod(fromDate: string, toDate: string): { from: string; to: string } {
  const from = new Date(fromDate), to = new Date(toDate)
  const diff = to.getTime() - from.getTime()
  return { from: new Date(from.getTime() - diff).toISOString(), to: fromDate }
}
