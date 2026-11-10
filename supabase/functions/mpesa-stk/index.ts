// Supabase Edge Function: mpesa-stk
// Deploy: supabase functions deploy mpesa-stk --no-verify-jwt
// Secrets: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_SHORTCODE (fallback),
//          SUPABASE_SERVICE_ROLE_KEY (auto), SUPABASE_URL (auto)
//
// Body: { payment_id, phone, amount, shortcode? }
// Returns: { checkout_request_id }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-token, x-staff-token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { payment_id, phone, amount, shortcode } = await req.json()
    if (!payment_id || !phone || amount == null) {
      return json({ error: 'payment_id, phone, and amount are required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: payment, error: payErr } = await supabase
      .from('payments_v2')
      .select('id, venue_id, state, total')
      .eq('id', payment_id)
      .maybeSingle()

    if (payErr || !payment) return json({ error: 'payment not found' }, 404)
    if (payment.state !== 'pending') return json({ error: `payment is ${payment.state}` }, 409)

    const { data: secrets } = await supabase
      .from('venue_secrets')
      .select('mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey')
      .eq('venue_id', payment.venue_id)
      .maybeSingle()

    const consumerKey = secrets?.mpesa_consumer_key ?? Deno.env.get('MPESA_CONSUMER_KEY')
    const consumerSecret = secrets?.mpesa_consumer_secret ?? Deno.env.get('MPESA_CONSUMER_SECRET')
    const passkey = secrets?.mpesa_passkey ?? Deno.env.get('MPESA_PASSKEY')
    const businessShortcode = shortcode ?? Deno.env.get('MPESA_SHORTCODE')

    if (!consumerKey || !consumerSecret || !passkey || !businessShortcode) {
      return json({
        error: 'M-Pesa credentials not configured',
        hint: 'Set venue_secrets or function env MPESA_*',
      }, 503)
    }

    // ── Daraja OAuth + STK Push ──────────────────────────────
    // Replace sandbox URL with production when ready.
    const base = Deno.env.get('MPESA_API_BASE') ?? 'https://sandbox.safaricom.co.ke'
    const basic = btoa(`${consumerKey}:${consumerSecret}`)
    const tokenRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}` },
    })
    if (!tokenRes.ok) return json({ error: 'failed to get M-Pesa token' }, 502)
    const { access_token } = await tokenRes.json()

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const password = btoa(`${businessShortcode}${passkey}${timestamp}`)
    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook?provider=mpesa`

    const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: businessShortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(Number(amount)),
        PartyA: String(phone).replace(/\D/g, ''),
        PartyB: businessShortcode,
        PhoneNumber: String(phone).replace(/\D/g, ''),
        CallBackURL: callbackUrl,
        AccountReference: payment_id.slice(0, 12),
        TransactionDesc: 'TableKey bill',
      }),
    })

    const stk = await stkRes.json()
    const checkoutId = stk.CheckoutRequestID as string | undefined
    if (!checkoutId) {
      return json({ error: 'STK push failed', provider: stk }, 502)
    }

    await supabase
      .from('payments_v2')
      .update({
        state: 'processing',
        provider_ref: checkoutId,
        provider_payload: stk,
      })
      .eq('id', payment_id)

    return json({ checkout_request_id: checkoutId })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
