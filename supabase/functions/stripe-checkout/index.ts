// Supabase Edge Function: stripe-checkout
// Deploy: supabase functions deploy stripe-checkout --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, APP_URL (optional fallback)
//
// Body: { payment_id, amount_cents, return_url }
// Returns: { url }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-token, x-staff-token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { payment_id, amount_cents, return_url } = await req.json()
    if (!payment_id || amount_cents == null) {
      return json({ error: 'payment_id and amount_cents are required' }, 400)
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY not configured' }, 503)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: payment, error } = await supabase
      .from('payments_v2')
      .select('id, venue_id, state, total, currency:venues(currency)')
      .eq('id', payment_id)
      .maybeSingle()

    if (error || !payment) return json({ error: 'payment not found' }, 404)
    if (payment.state !== 'pending') return json({ error: `payment is ${payment.state}` }, 409)

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })
    const success = return_url ?? `${Deno.env.get('APP_URL')}/payment-complete?payment_id=${payment_id}`
    const cancel = success.includes('?') ? `${success}&cancelled=1` : `${success}?cancelled=1`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: success,
      cancel_url: cancel,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(Number(amount_cents)),
          product_data: { name: 'TableKey bill' },
        },
      }],
      metadata: { payment_id },
    })

    await supabase
      .from('payments_v2')
      .update({
        state: 'processing',
        provider_ref: session.id,
        provider_payload: { checkout_session_id: session.id },
      })
      .eq('id', payment_id)

    return json({ url: session.url })
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
