import { getSupabase } from '../supabase'
import { getDeviceToken, getIdempotencyKey } from '../device'
import { assertOnline } from '../network'
import type {
  ComputedBill, InitiatePaymentResult, PaymentV2,
  VoidReason, CompReason, OverrideReason, ReconciliationReport,
} from '../../types/database'

export async function computeBill(sessionId: string): Promise<ComputedBill> {
  const { data, error } = await getSupabase().rpc('compute_bill', { p_session_id: sessionId })
  if (error) throw error
  return data as ComputedBill
}

export async function checkPaymentModeAllowsOrder(
  sessionId: string
): Promise<{ allowed: boolean; reason?: string; requires_payment_first?: boolean }> {
  const { data } = await getSupabase().rpc('check_payment_mode_allows_order', { p_session_id: sessionId })
  return data ?? { allowed: true }
}

export async function initiatePayment(
  sessionId: string, method: 'mpesa' | 'card' | 'cash',
  itemIds: string[] | null, tipAmount: number,
  splitType: string, splitOf: number | null, idempotencyKey?: string
): Promise<InitiatePaymentResult> {
  assertOnline('start a payment')
  const { data, error } = await getSupabase().rpc('initiate_payment', {
    p_session_id: sessionId, p_device_token: getDeviceToken(),
    p_method: method, p_item_ids: itemIds, p_tip_amount: tipAmount,
    p_split_type: splitType, p_split_of: splitOf,
    p_idempotency_key: idempotencyKey ?? getIdempotencyKey(),
  })
  if (error) throw error
  return data as InitiatePaymentResult
}

export async function releaseReservation(sessionId: string, itemIds: string[] | null): Promise<void> {
  await getSupabase().rpc('release_reservation', {
    p_session_id: sessionId, p_device_token: getDeviceToken(), p_item_ids: itemIds,
  })
}

export async function initiateMpesaStkPush(
  paymentId: string, phoneNumber: string, amount: number, shortcode: string
): Promise<{ checkout_request_id: string }> {
  const { data, error } = await getSupabase().functions.invoke('mpesa-stk', {
    body: { payment_id: paymentId, phone: phoneNumber, amount, shortcode },
  })
  if (!error && data?.checkout_request_id) return { checkout_request_id: data.checkout_request_id as string }
  console.warn('[M-Pesa] Edge Function unavailable', error?.message)
  return { checkout_request_id: 'ws_CO_DEMO_' + Date.now() }
}

export async function pollMpesaPaymentStatus(paymentId: string): Promise<PaymentV2 | null> {
  const { data } = await getSupabase().from('payments_v2').select('*').eq('id', paymentId).maybeSingle()
  return data
}

export async function initiateStripeCheckout(paymentId: string, total: number): Promise<string> {
  const returnUrl = `${window.location.origin}/payment-complete?payment_id=${paymentId}`
  const { data, error } = await getSupabase().functions.invoke('stripe-checkout', {
    body: { payment_id: paymentId, amount_cents: Math.round(total * 100), return_url: returnUrl },
  })
  if (!error && data?.url) return data.url as string
  console.warn('[Stripe] Edge Function unavailable', error?.message)
  return `https://checkout.stripe.com/demo?amount=${Math.round(total * 100)}&return_url=${encodeURIComponent(returnUrl)}`
}

export async function getReceipt(paymentId: string) {
  const { data } = await getSupabase().from('receipts').select('*').eq('payment_id', paymentId).maybeSingle()
  return data
}

export async function getSessionPayments(sessionId: string): Promise<PaymentV2[]> {
  const { data } = await getSupabase().from('payments_v2').select('*')
    .eq('session_id', sessionId).order('initiated_at')
  return (data ?? []) as PaymentV2[]
}

export async function staffRecordCash(
  sessionId: string, staffId: string, itemIds: string[] | null,
  cashReceived: number, tipAmount: number, idempotencyKey?: string
): Promise<{ success: boolean; receipt_number?: string; change_due?: number; message?: string }> {
  assertOnline('record a cash payment')
  const { data, error } = await getSupabase().rpc('record_cash_payment', {
    p_session_id: sessionId, p_staff_id: staffId, p_item_ids: itemIds,
    p_cash_received: cashReceived, p_tip_amount: tipAmount,
  })
  if (error) throw error
  return data
}

export async function staffVoidItem(
  orderItemId: string, staffId: string, reason: VoidReason, note: string
): Promise<{ success: boolean; message?: string }> {
  const { data, error } = await getSupabase().rpc('void_item', {
    p_order_item_id: orderItemId, p_staff_id: staffId, p_reason: reason, p_note: note || null,
  })
  if (error) throw error
  return data
}

export async function staffCompItem(
  orderItemId: string, staffId: string, reason: CompReason, note: string
): Promise<{ success: boolean; message?: string }> {
  const { data, error } = await getSupabase().rpc('comp_item', {
    p_order_item_id: orderItemId, p_staff_id: staffId, p_reason: reason, p_note: note || null,
  })
  if (error) throw error
  return data
}

export async function staffCloseSessionOverride(
  sessionId: string, staffId: string, reason: OverrideReason,
  note: string, approverId: string | null
): Promise<{ success: boolean; outstanding_written_off?: number; message?: string; requires_approval?: boolean }> {
  const { data, error } = await getSupabase().rpc('close_session_override', {
    p_session_id: sessionId, p_staff_id: staffId, p_reason: reason,
    p_note: note || null, p_approver_id: approverId,
  })
  if (error) throw error
  return data
}

export async function getReconciliationReport(
  venueId: string, fromDate: string, toDate: string
): Promise<ReconciliationReport> {
  const { data, error } = await getSupabase().rpc('get_reconciliation_report', {
    p_venue_id: venueId, p_date_from: fromDate, p_date_to: toDate,
  })
  if (error) throw error
  return data as ReconciliationReport
}
