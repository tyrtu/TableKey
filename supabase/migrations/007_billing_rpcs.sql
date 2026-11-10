-- ============================================================
-- TableKey – Server-Side Billing RPCs
-- Run AFTER 006_payments_schema.sql
-- All money calculations happen here, never on the client.
-- ============================================================

-- ====================
========================================
-- HELPER: next receipt number
-- ============================================================

create or replace function next_receipt_number(p_venue_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_seq int;
begin
  insert into receipt_number_seq (venue_id, last_seq) values (p_venue_id, 1)
  on conflict (venue_id) do update set last_seq = receipt_number_seq.last_seq + 1
  returning last_seq into v_seq;
  return 'RCP-' || lpad(v_seq::text, 6, '0');
end;
$$;

-- ============================================================
-- RPC: compute_bill
-- Returns the full bill for a session: items with payment
-- status, subtotal, tax, service charge, and outstanding.
-- Called by both customer checkout and waiter bill view.
-- ============================================================

create or replace function compute_bill(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_venue     record;
  v_session   record;
  v_items     jsonb;
  v_subtotal  numeric(10,2);
  v_paid      numeric(10,2);
  v_voided    numeric(10,2);
  v_comped    numeric(10,2);
  v_tax       numeric(10,2);
  v_svc       numeric(10,2);
  v_total     numeric(10,2);
  v_outstanding numeric(10,2);
begin
  select * into v_session from table_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('error', 'Session not found');
  end if;

  select * into v_venue from venues where id = v_session.venue_id;

  -- Aggregate order items with their payment status
  select
    jsonb_agg(
      jsonb_build_object(
        'order_item_id',   oi.id,
        'order_id',        oi.order_id,
        'order_number',    o.order_number,
        'item_name',       oi.item_name,
        'quantity',        oi.quantity,
        'unit_price',      oi.item_price,
        'line_total',      oi.line_total,
        'notes',           oi.notes,
        'options',         oi.options,
        'payment_status',  oi.payment_status,
        'paid_by',         oi.paid_by_payment_id,
        'void_reason',     oi.void_reason,
        'comp_reason',     oi.comp_reason
      ) order by o.placed_at, oi.id
    ),
    coalesce(sum(case when oi.payment_status not in ('voided','comped') then oi.line_total else 0 end), 0),
    coalesce(sum(case when oi.payment_status = 'paid' then oi.line_total else 0 end), 0),
    coalesce(sum(case when oi.payment_status = 'voided' then oi.line_total else 0 end), 0),
    coalesce(sum(case when oi.payment_status = 'comped' then oi.line_total else 0 end), 0)
  into v_items, v_subtotal, v_paid, v_voided, v_comped
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.session_id = p_session_id
    and o.status != 'cancelled';

  v_tax  := round(v_subtotal * v_venue.tax_rate, 2);
  v_svc  := round(v_subtotal * v_venue.service_charge_rate, 2);
  v_total := v_subtotal + v_tax + v_svc;
  v_outstanding := greatest(0, v_total - v_paid);

  return jsonb_build_object(
    'session_id',        p_session_id,
    'venue_id',          v_session.venue_id,
    'items',             coalesce(v_items, '[]'::jsonb),
    'subtotal',          v_subtotal,
    'tax_rate',          v_venue.tax_rate,
    'tax_amount',        v_tax,
    'service_charge_rate', v_venue.service_charge_rate,
    'service_charge_amount', v_svc,
    'total',             v_total,
    'paid',              v_paid,
    'voided',            v_voided,
    'comped',            v_comped,
    'outstanding',       v_outstanding,
    'payment_mode',      v_venue.payment_mode,
    'tip_enabled',       v_venue.tip_enabled,
    'tip_presets',       v_venue.tip_presets,
    'is_settled',        v_outstanding = 0
  );
end;
$$;

-- ============================================================
-- RPC: check_payment_mode_allows_order
-- Called before placing an order in pay_per_order / hybrid mode.
-- Returns {allowed: bool, reason: text}
-- ============================================================

create or replace function check_payment_mode_allows_order(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bill   jsonb;
  v_venue  record;
  v_session record;
begin
  select * into v_session from table_sessions where id = p_session_id;
  select * into v_venue from venues where id = v_session.venue_id;

  if v_venue.payment_mode = 'pay_at_end' then
    return jsonb_build_object('allowed', true);
  end if;

  v_bill := compute_bill(p_session_id);

  if v_venue.payment_mode = 'pay_per_order' then
    -- In pay_per_order, allow placing but order won't go to kitchen until paid
    return jsonb_build_object('allowed', true, 'requires_payment_first', true);
  end if;

  if v_venue.payment_mode = 'hybrid' then
    if (v_bill->>'outstanding')::numeric >= v_venue.hybrid_max_unpaid then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'Outstanding balance of ' || (v_bill->>'outstanding') || ' has reached the limit. Please pay before adding more items.'
      );
    end if;
    return jsonb_build_object('allowed', true);
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

-- ============================================================
-- RPC: reserve_items
-- Locks selected order items for checkout by this device.
-- Prevents another device paying for the same items.
-- Returns {success, reserved_item_ids, subtotal, tax, svc, tip, total}
-- ============================================================

create or replace function reserve_items(
  p_session_id   uuid,
  p_device_token text,
  p_item_ids     uuid[],   -- order_item ids to reserve
  p_tip_amount   numeric   -- client-requested tip (validated against presets)
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_venue       record;
  v_session     record;
  v_items       record;
  v_subtotal    numeric(10,2) := 0;
  v_tax         numeric(10,2);
  v_svc         numeric(10,2);
  v_tip         numeric(10,2);
  v_total       numeric(10,2);
  v_item_id     uuid;
  v_conflict    uuid[];
  v_idempkey    text;
begin
  select * into v_session from table_sessions where id = p_session_id and is_active = true;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Session is not active');
  end if;

  select * into v_venue from venues where id = v_session.venue_id;

  -- Clean up expired reservations first
  delete from item_reservations where expires_at < now();

  -- Check for conflicts (items already reserved by another device)
  select array_agg(order_item_id) into v_conflict
  from item_reservations
  where order_item_id = any(p_item_ids)
    and device_token != p_device_token;

  if array_length(v_conflict, 1) > 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Some items are already being checked out by another device. Please wait a moment.',
      'conflicting_items', v_conflict
    );
  end if;

  -- Verify all items are unpaid and belong to this session
  if exists (
    select 1 from order_items oi
    join orders o on o.id = oi.order_id
    where oi.id = any(p_item_ids)
      and (o.session_id != p_session_id or oi.payment_status != 'unpaid')
  ) then
    return jsonb_build_object('success', false, 'message', 'Some items are not available for payment');
  end if;

  -- Calculate subtotal from server-stored prices (never trust client amounts)
  select coalesce(sum(line_total), 0) into v_subtotal
  from order_items where id = any(p_item_ids);

  v_tax  := round(v_subtotal * v_venue.tax_rate, 2);
  v_svc  := round(v_subtotal * v_venue.service_charge_rate, 2);

  -- Validate tip: must be >= 0 and reasonable (max 100% of subtotal)
  v_tip := greatest(0, least(coalesce(p_tip_amount, 0), v_subtotal));
  if not v_venue.tip_enabled then v_tip := 0; end if;

  v_total := v_subtotal + v_tax + v_svc + v_tip;

  -- Create reservations
  foreach v_item_id in array p_item_ids loop
    insert into item_reservations (session_id, order_item_id, device_token, expires_at)
    values (p_session_id, v_item_id, p_device_token, now() + interval '10 minutes')
    on conflict (order_item_id) do update
      set device_token = p_device_token, expires_at = now() + interval '10 minutes';
  end loop;

  -- Mark items as reserved
  update order_items set payment_status = 'reserved'
  where id = any(p_item_ids);

  -- Generate idempotency key for the payment
  v_idempkey := encode(gen_random_bytes(16), 'hex');

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_session.venue_id, 'item_reserved', 'customer', p_device_token, 'session', p_session_id::text,
    jsonb_build_object('item_count', array_length(p_item_ids, 1), 'subtotal', v_subtotal));

  return jsonb_build_object(
    'success',        true,
    'item_ids',       p_item_ids,
    'subtotal',       v_subtotal,
    'tax_amount',     v_tax,
    'service_charge_amount', v_svc,
    'tip_amount',     v_tip,
    'total',          v_total,
    'idempotency_key', v_idempkey,
    'expires_at',     (now() + interval '10 minutes')
  );
end;
$$;

-- ============================================================
-- RPC: release_reservation
-- Called when payment fails, cancels, or times out.
-- Sets reserved items back to unpaid.
-- ============================================================

create or replace function release_reservation(
  p_session_id   uuid,
  p_device_token text,
  p_item_ids     uuid[]  -- null means release all for this device
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if p_item_ids is null then
    select array_agg(order_item_id) into v_ids
    from item_reservations
    where session_id = p_session_id and device_token = p_device_token;
  else
    v_ids := p_item_ids;
  end if;

  if v_ids is null or array_length(v_ids, 1) = 0 then return; end if;

  delete from item_reservations
  where order_item_id = any(v_ids)
    and device_token = p_device_token;

  update order_items set payment_status = 'unpaid'
  where id = any(v_ids) and payment_status = 'reserved';

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  select v.venue_id, 'item_reservation_released', 'customer', p_device_token, 'session', p_session_id::text,
    jsonb_build_object('item_count', array_length(v_ids, 1))
  from table_sessions ts join venues v on v.id = ts.venue_id
  where ts.id = p_session_id;
end;
$$;

-- ============================================================
-- RPC: confirm_payment
-- Called by webhook handler (Edge Function) after provider confirms.
-- Marks items as paid, generates receipt, closes session if settled.
-- This is the ONLY place items get marked paid.
-- ============================================================

create or replace function confirm_payment(
  p_payment_id      uuid,
  p_provider_ref    text,
  p_provider_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_payment  record;
  v_bill     jsonb;
  v_receipt_num text;
  v_item_ids uuid[];
begin
  select * into v_payment from payments_v2 where id = p_payment_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Payment not found');
  end if;

  -- Idempotency: already succeeded
  if v_payment.state = 'succeeded' then
    return jsonb_build_object('success', true, 'already_confirmed', true);
  end if;

  -- Only process pending/processing
  if v_payment.state not in ('pending', 'processing') then
    return jsonb_build_object('success', false, 'message', 'Payment in non-processable state: ' || v_payment.state);
  end if;

  -- Update payment state
  update payments_v2
  set state = 'succeeded',
      provider_ref = p_provider_ref,
      provider_payload = p_provider_payload,
      confirmed_at = now()
  where id = p_payment_id;

  -- Get item ids from payment_items
  select array_agg(order_item_id) into v_item_ids
  from payment_items where payment_id = p_payment_id;

  -- Mark items as paid
  if v_item_ids is not null and array_length(v_item_ids, 1) > 0 then
    update order_items
    set payment_status = 'paid',
        paid_by_payment_id = p_payment_id
    where id = any(v_item_ids);

    -- Remove reservations
    delete from item_reservations where order_item_id = any(v_item_ids);
  end if;

  -- Generate receipt number
  v_receipt_num := next_receipt_number(v_payment.venue_id);
  update payments_v2 set receipt_number = v_receipt_num where id = p_payment_id;

  -- Store receipt snapshot
  v_bill := compute_bill(v_payment.session_id);
  insert into receipts (payment_id, venue_id, receipt_number, data)
  values (p_payment_id, v_payment.venue_id, v_receipt_num,
    jsonb_build_object(
      'receipt_number', v_receipt_num,
      'payment_id', p_payment_id,
      'session_id', v_payment.session_id,
      'method', v_payment.method,
      'subtotal', v_payment.subtotal,
      'tax_amount', v_payment.tax_amount,
      'service_charge_amount', v_payment.service_charge_amount,
      'tip_amount', v_payment.tip_amount,
      'total', v_payment.total,
      'confirmed_at', now(),
      'items', (select jsonb_agg(jsonb_build_object(
        'name', oi.item_name, 'qty', oi.quantity, 'total', oi.line_total
      )) from order_items oi where oi.id = any(v_item_ids))
    ));

  -- Audit
  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_payment.venue_id, 'payment_succeeded', 'system', 'webhook', 'payment', p_payment_id::text,
    jsonb_build_object('provider_ref', p_provider_ref, 'total', v_payment.total));

  -- Auto-close session if fully settled
  v_bill := compute_bill(v_payment.session_id);
  if (v_bill->>'is_settled')::boolean then
    update table_sessions
    set is_active = false, closed_at = now(), current_code = null
    where id = v_payment.session_id;

    update restaurant_tables set status = 'idle'
    where id = (select table_id from table_sessions where id = v_payment.session_id);

    insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
    values (v_payment.venue_id, 'session_closed', 'system', 'system', 'session', v_payment.session_id::text);
  end if;

  return jsonb_build_object(
    'success', true,
    'receipt_number', v_receipt_num,
    'is_settled', (v_bill->>'is_settled')::boolean
  );
end;
$$;

-- ============================================================
-- RPC: fail_payment
-- Called by webhook or timeout handler.
-- Releases reserved items back to unpaid.
-- ============================================================

create or replace function fail_payment(
  p_payment_id      uuid,
  p_provider_payload jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_payment record;
  v_item_ids uuid[];
begin
  select * into v_payment from payments_v2 where id = p_payment_id;
  if not found or v_payment.state not in ('pending','processing') then return; end if;

  update payments_v2
  set state = 'failed', failed_at = now(),
      provider_payload = coalesce(p_provider_payload, provider_payload)
  where id = p_payment_id;

  select array_agg(order_item_id) into v_item_ids
  from payment_items where payment_id = p_payment_id;

  perform release_reservation(v_payment.session_id, v_payment.device_token, v_item_ids);

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
  values (v_payment.venue_id, 'payment_failed', 'system', 'webhook', 'payment', p_payment_id::text);
end;
$$;

-- ============================================================
-- RPC: initiate_payment
-- Client calls this to create the payment record server-side.
-- Returns amounts (server-calculated) and a payment id.
-- The client then uses the payment id to call the provider.
-- ============================================================

create or replace function initiate_payment(
  p_session_id      uuid,
  p_device_token    text,
  p_method          payment_method_v2,
  p_item_ids        uuid[],        -- null = pay all unpaid items
  p_tip_amount      numeric default 0,
  p_split_type      text default 'items',
  p_split_of        int default null,
  p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session   record;
  v_venue     record;
  v_item_ids  uuid[];
  v_reservation jsonb;
  v_payment   record;
  v_idem_key  text;
begin
  select * into v_session from table_sessions where id = p_session_id and is_active = true;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Session not active');
  end if;

  select * into v_venue from venues where id = v_session.venue_id;

  -- Determine which items to pay for
  if p_item_ids is null then
    select array_agg(oi.id) into v_item_ids
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.session_id = p_session_id
      and oi.payment_status = 'unpaid'
      and o.status != 'cancelled';
  else
    v_item_ids := p_item_ids;
  end if;

  if v_item_ids is null or array_length(v_item_ids, 1) = 0 then
    return jsonb_build_object('success', false, 'message', 'No items to pay for');
  end if;

  -- Idempotency check
  v_idem_key := coalesce(p_idempotency_key, encode(gen_random_bytes(16), 'hex'));
  select * into v_payment from payments_v2 where idempotency_key = v_idem_key;
  if found then
    return jsonb_build_object(
      'success', true,
      'payment_id', v_payment.id,
      'total', v_payment.total,
      'already_exists', true
    );
  end if;

  -- Reserve items and compute amounts
  v_reservation := reserve_items(p_session_id, p_device_token, v_item_ids, p_tip_amount);
  if not (v_reservation->>'success')::boolean then
    return v_reservation;
  end if;

  -- Create payment record
  insert into payments_v2 (
    venue_id, session_id, table_id, device_token, method, state,
    subtotal, tax_amount, service_charge_amount, tip_amount, total,
    split_type, split_of, idempotency_key
  )
  select
    v_session.venue_id,
    p_session_id,
    v_session.table_id,
    p_device_token,
    p_method,
    'pending',
    (v_reservation->>'subtotal')::numeric,
    (v_reservation->>'tax_amount')::numeric,
    (v_reservation->>'service_charge_amount')::numeric,
    (v_reservation->>'tip_amount')::numeric,
    (v_reservation->>'total')::numeric,
    p_split_type,
    p_split_of,
    v_idem_key
  returning * into v_payment;

  -- Link items to payment
  insert into payment_items (payment_id, order_item_id, amount)
  select v_payment.id, unnest(v_item_ids), 0;  -- amount per item set on confirm

  -- Audit
  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_session.venue_id, 'payment_initiated', 'customer', p_device_token, 'payment', v_payment.id::text,
    jsonb_build_object('method', p_method, 'total', v_payment.total));

  return jsonb_build_object(
    'success',      true,
    'payment_id',   v_payment.id,
    'subtotal',     v_payment.subtotal,
    'tax_amount',   v_payment.tax_amount,
    'service_charge_amount', v_payment.service_charge_amount,
    'tip_amount',   v_payment.tip_amount,
    'total',        v_payment.total,
    'idempotency_key', v_idem_key,
    'mpesa_shortcode', v_venue.mpesa_shortcode
  );
end;
$$;

-- ============================================================
-- RPC: record_cash_payment
-- Staff only. Marks items as paid immediately (no async).
-- ============================================================

create or replace function record_cash_payment(
  p_session_id   uuid,
  p_staff_id     uuid,
  p_item_ids     uuid[],   -- null = all unpaid
  p_cash_received numeric,
  p_tip_amount   numeric default 0,
  p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session   record;
  v_venue     record;
  v_item_ids  uuid[];
  v_subtotal  numeric(10,2);
  v_tax       numeric(10,2);
  v_svc       numeric(10,2);
  v_tip       numeric(10,2);
  v_total     numeric(10,2);
  v_change    numeric(10,2);
  v_payment   record;
  v_receipt_num text;
  v_idem_key  text;
begin
  -- Verify staff
  if not exists (select 1 from staff where id = p_staff_id and active = true) then
    return jsonb_build_object('success', false, 'message', 'Unauthorized');
  end if;

  select * into v_session from table_sessions where id = p_session_id;
  select * into v_venue from venues where id = v_session.venue_id;

  -- Determine items
  if p_item_ids is null then
    select array_agg(oi.id) into v_item_ids
    from order_items oi join orders o on o.id = oi.order_id
    where o.session_id = p_session_id
      and oi.payment_status in ('unpaid','reserved')
      and o.status != 'cancelled';
  else
    v_item_ids := p_item_ids;
  end if;

  if v_item_ids is null or array_length(v_item_ids, 1) = 0 then
    return jsonb_build_object('success', false, 'message', 'No items to pay for');
  end if;

  -- Server-compute amounts
  select coalesce(sum(line_total), 0) into v_subtotal from order_items where id = any(v_item_ids);
  v_tax  := round(v_subtotal * v_venue.tax_rate, 2);
  v_svc  := round(v_subtotal * v_venue.service_charge_rate, 2);
  v_tip  := greatest(0, coalesce(p_tip_amount, 0));
  v_total := v_subtotal + v_tax + v_svc + v_tip;
  v_change := greatest(0, p_cash_received - v_total);

  -- Idempotency
  v_idem_key := coalesce(p_idempotency_key, encode(gen_random_bytes(16), 'hex'));
  select * into v_payment from payments_v2 where idempotency_key = v_idem_key;
  if found then
    return jsonb_build_object('success', true, 'payment_id', v_payment.id, 'already_exists', true);
  end if;

  v_receipt_num := next_receipt_number(v_session.venue_id);

  insert into payments_v2 (
    venue_id, session_id, table_id, device_token, method, state,
    subtotal, tax_amount, service_charge_amount, tip_amount, total,
    cash_received, change_due, recorded_by, idempotency_key,
    receipt_number, confirmed_at, split_type
  ) values (
    v_session.venue_id, p_session_id, v_session.table_id,
    'staff:' || p_staff_id::text, 'cash', 'succeeded',
    v_subtotal, v_tax, v_svc, v_tip, v_total,
    p_cash_received, v_change, p_staff_id, v_idem_key,
    v_receipt_num, now(), 'items'
  ) returning * into v_payment;

  -- Link + mark items paid
  insert into payment_items (payment_id, order_item_id, amount)
  select v_payment.id, unnest(v_item_ids), 0;

  update order_items set payment_status = 'paid', paid_by_payment_id = v_payment.id
  where id = any(v_item_ids);

  delete from item_reservations where order_item_id = any(v_item_ids);

  -- Receipt
  insert into receipts (payment_id, venue_id, receipt_number, data)
  values (v_payment.id, v_session.venue_id, v_receipt_num,
    jsonb_build_object(
      'receipt_number', v_receipt_num, 'method', 'cash',
      'subtotal', v_subtotal, 'tax', v_tax, 'svc', v_svc,
      'tip', v_tip, 'total', v_total,
      'cash_received', p_cash_received, 'change_due', v_change
    ));

  -- Audit
  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_session.venue_id, 'cash_payment_recorded', 'waiter', p_staff_id::text, 'payment', v_payment.id::text,
    jsonb_build_object('total', v_total, 'cash', p_cash_received, 'change', v_change));

  -- Auto-close if settled
  declare v_bill jsonb;
  begin
    v_bill := compute_bill(p_session_id);
    if (v_bill->>'is_settled')::boolean then
      update table_sessions set is_active = false, closed_at = now(), current_code = null
      where id = p_session_id;
      update restaurant_tables set status = 'idle'
      where id = v_session.table_id;
    end if;
  end;

  return jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'receipt_number', v_receipt_num,
    'total', v_total,
    'change_due', v_change
  );
end;
$$;

-- ============================================================
-- RPC: void_item
-- Staff only. Marks an item as voided (not charged).
-- ============================================================

create or replace function void_item(
  p_order_item_id uuid,
  p_staff_id      uuid,
  p_reason        void_reason,
  p_note          text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item   record;
  v_venue_id uuid;
begin
  select oi.*, o.session_id, o.venue_id into v_item
  from order_items oi join orders o on o.id = oi.order_id
  where oi.id = p_order_item_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Item not found');
  end if;

  if v_item.payment_status = 'paid' then
    return jsonb_build_object('success', false, 'message', 'Cannot void a paid item. Issue a refund instead.');
  end if;

  -- Only owner/admin/manager can void
  if not exists (
    select 1 from staff
    where id = p_staff_id and venue_id = v_item.venue_id
      and role in ('owner','admin','manager') and active = true
  ) then
    return jsonb_build_object('success', false, 'message', 'Insufficient permissions to void items');
  end if;

  -- Release any reservation
  delete from item_reservations where order_item_id = p_order_item_id;

  update order_items
  set payment_status = 'voided',
      voided_at = now(),
      voided_by = p_staff_id,
      void_reason = p_reason,
      void_note = p_note
  where id = p_order_item_id;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_item.venue_id, 'item_voided', 'admin', p_staff_id::text, 'order_item', p_order_item_id::text,
    jsonb_build_object('reason', p_reason, 'note', p_note, 'line_total', v_item.line_total));

  return jsonb_build_object('success', true);
end;
$$;

-- ============================================================
-- RPC: comp_item
-- Staff only. Comps an item (marks as goodwill, not charged).
-- ============================================================

create or replace function comp_item(
  p_order_item_id uuid,
  p_staff_id      uuid,
  p_reason        comp_reason,
  p_note          text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item record;
begin
  select oi.*, o.venue_id into v_item
  from order_items oi join orders o on o.id = oi.order_id
  where oi.id = p_order_item_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Item not found');
  end if;

  if v_item.payment_status = 'paid' then
    return jsonb_build_object('success', false, 'message', 'Cannot comp a paid item. Issue a refund instead.');
  end if;

  if not exists (
    select 1 from staff
    where id = p_staff_id and venue_id = v_item.venue_id
      and role in ('owner','admin','manager') and active = true
  ) then
    return jsonb_build_object('success', false, 'message', 'Insufficient permissions');
  end if;

  delete from item_reservations where order_item_id = p_order_item_id;

  update order_items
  set payment_status = 'comped',
      comped_at = now(),
      comped_by = p_staff_id,
      comp_reason = p_reason,
      comp_note = p_note
  where id = p_order_item_id;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_item.venue_id, 'item_comped', 'admin', p_staff_id::text, 'order_item', p_order_item_id::text,
    jsonb_build_object('reason', p_reason, 'note', p_note, 'line_total', v_item.line_total));

  return jsonb_build_object('success', true);
end;
$$;

-- ============================================================
-- RPC: close_session_override
-- Waiter/manager closes session with outstanding balance.
-- Requires a reason. Manager approval enforced if venue setting is on.
-- ============================================================

create or replace function close_session_override(
  p_session_id    uuid,
  p_staff_id      uuid,
  p_reason        override_reason,
  p_note          text default null,
  p_approver_id   uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session   record;
  v_venue     record;
  v_bill      jsonb;
  v_outstanding numeric;
begin
  select * into v_session from table_sessions where id = p_session_id and is_active = true;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Session not active');
  end if;

  select * into v_venue from venues where id = v_session.venue_id;

  -- Permission check
  if not exists (
    select 1 from staff
    where id = p_staff_id and venue_id = v_session.venue_id
      and role in ('owner','admin','manager','waiter') and active = true
  ) then
    return jsonb_build_object('success', false, 'message', 'Unauthorized');
  end if;

  -- Manager approval required?
  if v_venue.close_override_requires_manager then
    if p_approver_id is null then
      return jsonb_build_object('success', false, 'message', 'Manager approval required to close with outstanding balance', 'requires_approval', true);
    end if;
    if not exists (
      select 1 from staff
      where id = p_approver_id and venue_id = v_session.venue_id
        and role in ('owner','admin','manager') and active = true
    ) then
      return jsonb_build_object('success', false, 'message', 'Approver does not have manager permissions');
    end if;
  end if;

  v_bill := compute_bill(p_session_id);
  v_outstanding := (v_bill->>'outstanding')::numeric;

  -- Record the override
  insert into session_close_overrides (
    session_id, venue_id, outstanding, reason, note, approved_by, created_by
  ) values (
    p_session_id, v_session.venue_id, v_outstanding,
    p_reason, p_note, p_approver_id, p_staff_id
  );

  -- Close session
  update table_sessions
  set is_active = false, closed_at = now(),
      current_code = null, closed_by = p_staff_id
  where id = p_session_id;

  update restaurant_tables set status = 'idle' where id = v_session.table_id;

  -- Release any remaining reservations
  delete from item_reservations where session_id = p_session_id;
  update order_items set payment_status = 'unpaid'
  where id in (
    select oi.id from order_items oi join orders o on o.id = oi.order_id
    where o.session_id = p_session_id and oi.payment_status = 'reserved'
  );

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_session.venue_id, 'session_close_override', 'waiter', p_staff_id::text, 'session', p_session_id::text,
    jsonb_build_object(
      'outstanding', v_outstanding,
      'reason', p_reason,
      'note', p_note,
      'approver', p_approver_id
    ));

  return jsonb_build_object('success', true, 'outstanding_written_off', v_outstanding);
end;
$$;

-- ============================================================
-- RPC: get_reconciliation_report
-- Owner/admin only. Daily payment reconciliation.
-- ============================================================

create or replace function get_reconciliation_report(
  p_venue_id  uuid,
  p_date_from timestamptz,
  p_date_to   timestamptz
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'period_from',    p_date_from,
    'period_to',      p_date_to,
    'by_method',      (
      select jsonb_agg(row_to_json(m)) from (
        select method,
               count(*) as count,
               sum(total) as total,
               sum(tip_amount) as tips
        from payments_v2
        where venue_id = p_venue_id
          and state = 'succeeded'
          and confirmed_at between p_date_from and p_date_to
        group by method
      ) m
    ),
    'totals', (
      select row_to_json(t) from (
        select
          count(*) filter (where state = 'succeeded') as payments,
          coalesce(sum(total) filter (where state = 'succeeded'), 0) as gross,
          coalesce(sum(tip_amount) filter (where state = 'succeeded'), 0) as tips,
          coalesce(sum(total) filter (where state = 'refunded'), 0) as refunds,
          count(*) filter (where state = 'failed') as failed_count,
          count(*) filter (where state = 'cancelled') as cancelled_count
        from payments_v2
        where venue_id = p_venue_id
          and initiated_at between p_date_from and p_date_to
      ) t
    ),
    'voids', (
      select jsonb_agg(row_to_json(v)) from (
        select oi.item_name, oi.line_total, oi.void_reason, oi.void_note,
               oi.voided_at, s.name as voided_by_name, o.order_number,
               rt.table_number
        from order_items oi
        join orders o on o.id = oi.order_id
        join restaurant_tables rt on rt.id = o.table_id
        left join staff s on s.id = oi.voided_by
        where oi.payment_status = 'voided'
          and oi.voided_at between p_date_from and p_date_to
          and o.venue_id = p_venue_id
        order by oi.voided_at desc
      ) v
    ),
    'comps', (
      select jsonb_agg(row_to_json(c)) from (
        select oi.item_name, oi.line_total, oi.comp_reason, oi.comp_note,
               oi.comped_at, s.name as comped_by_name, o.order_number
        from order_items oi
        join orders o on o.id = oi.order_id
        left join staff s on s.id = oi.comped_by
        where oi.payment_status = 'comped'
          and oi.comped_at between p_date_from and p_date_to
          and o.venue_id = p_venue_id
        order by oi.comped_at desc
      ) c
    ),
    'overrides', (
      select jsonb_agg(row_to_json(ov)) from (
        select sco.outstanding, sco.reason, sco.note, sco.created_at,
               s.name as closed_by_name, rt.table_number
        from session_close_overrides sco
        join staff s on s.id = sco.created_by
        join table_sessions ts on ts.id = sco.session_id
        join restaurant_tables rt on rt.id = ts.table_id
        where sco.venue_id = p_venue_id
          and sco.created_at between p_date_from and p_date_to
        order by sco.created_at desc
      ) ov
    ),
    'unpaid_tabs', (
      select jsonb_agg(row_to_json(ut)) from (
        select rt.table_number, ts.opened_at, ts.closed_at,
               (compute_bill(ts.id)->>'outstanding')::numeric as outstanding,
               s.name as opened_by_name
        from table_sessions ts
        join restaurant_tables rt on rt.id = ts.table_id
        left join staff s on s.id = ts.opened_by
        where ts.venue_id = p_venue_id
          and ts.closed_at between p_date_from and p_date_to
          and (compute_bill(ts.id)->>'outstanding')::numeric > 0
        order by ts.closed_at desc
      ) ut
    )
  ) into v_result;

  return v_result;
end;
$$;
