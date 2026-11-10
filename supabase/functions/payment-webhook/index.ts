// Supabase Edge Function: payment-webhook
// Deploy: supabase functions deploy payment-webhook --no-verify-jwt
// Handles M-Pesa STK callbacks (?provider=mpesa) and Stripe webhooks (?provider=stripe)
// Secrets: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const provider = url.searchParams.get('provider') ?? 'mpesa'
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    if (provider === 'stripe') {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
      const whSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
      if (!stripeKey || !whSecret) {
        return new Response('Stripe not configured', { status: 503 })
      }
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })
      const sig = req.headers.get('stripe-signature')
      const body = await req.text()
      const event = await stripe.webhooks.constructEventAsync(body, sig!, whSecret)

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as { id: string; metadata?: { payment_id?: string } }
        const paymentId = session.metadata?.payment_id
        if (paymentId) {
          await supabase.rpc('confirm_payment', {
            p_payment_id: paymentId,
            p_provider_ref: session.id,
            p_provider_payload: event.data.object,
          })
        }
      }
      return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // M-Pesa STK callback
    const payload = await req.json()
    const result = payload?.Body?.stkCallback
    const checkoutId = result?.CheckoutRequestID as string | undefined
    const resultCode = result?.ResultCode

    if (!checkoutId) {
      return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: 'missing CheckoutRequestID' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: payment } = await supabase
      .from('payments_v2')
      .select('id')
      .eq('provider_ref', checkoutId)
      .maybeSingle()

    if (payment) {
      if (resultCode === 0) {
        await supabase.rpc('confirm_payment', {
          p_payment_id: payment.id,
          p_provider_ref: checkoutId,
          p_provider_payload: payload,
        })
      } else {
        await supabase.rpc('fail_payment', {
          p_payment_id: payment.id,
          p_provider_payload: payload,
        })
      }
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
