-- ============================================================
-- TableKey – Payment System Schema
-- Run AFTER 005_onboarding_and_staff_management.sql
-- ============================================================

-- ============================================================
-- SECTION 1: NEW ENUMS
-- ============================================================

create type payment_mode as enum ('pay_at_end', 'pay_per_order', 'hybrid');
create type item_payment_status as enum ('unpaid', 'reserved', 'paid', 'voided', 'comped');
create type payment_state as enum ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded');
create type payment_method_v2 as enum ('mpesa', 'card', 'cash');
create type void_reason as enum ('wrong_item', 'customer_changed_mind', 'kitchen_error', 'other');
create type comp_reason as enum ('complaint', 'service_issue', 'manager_goodwill', 'other');
create type override_reason as enum ('cash_received', 'comped', 'dispute', 'other');

-- ============================================================
-- SECTION 2: ALTER EXISTING TABLES
-- ============================================================

-- Venues: add payment mode and tax/service charge settings
alter table venues
  add column if not exists payment_mode payment_mode not null default 'pay_at_end',
  add column if not exists hybrid_max_unpaid numeric(10,2) default 50.00,
  add column if not exists tax_rate numeric(5,4) not null default 0,        -- e.g. 0.16 = 16%
  add column if not exists service_charge_rate numeric(5,4) not null default 0, -- e.g. 0.10 = 10%
  add column if not exists tip_enabled boolean not null default true,
  add column if not exists tip_presets int[] not null default '{10,15,20}', -- percentage presets
  add column if not exists mpesa_shortcode text,
  add column if not exists mpesa_passkey text,
  add column if not exists mpesa_consumer_key text,
  add column if not exists mpesa_consumer_secret text,
  add column if not exists webhook_secret text,
  add column if not exists close_override_requires_manager boolean not null default false;

-- Order items: add item-level payment tracking
alter table order_items
  add column if not exists payment_status item_payment_status not null default 'unpaid',
  add column if not exists paid_by_payment_id uuid,  -- FK added after payments_v2 table created
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason void_reason,
  add column if not exists void_note text,
  add column if not exists comped_at timestamptz,
  add column if not exists comped_by uuid,
  add column if not exists comp_reason comp_reason,
  add column if not exists comp_note text;

-- Drop old payments table and replace with payments_v2
-- (Only drop if you haven't stored real production data yet)
-- We create a new table rather than alter to avoid conflicts
-- with the old schema.

-- ============================================================
-- SECTION 3: NEW TABLES
-- ============================================================

-- Full payment records (replaces the old payments table concept)
create table if not exists payments_v2 (
  id                    uuid primary key default uuid_generate_v4(),
  venue_id              uuid not null references venues(id) on delete cascade,
  session_id            uuid not null references table_sessions(id) on delete cascade,
  table_id              uuid not null references restaurant_tables(id),
  device_token          text not null,
  method                payment_method_v2 not null,
  state                 payment_state not null default 'pending',
  -- Amounts (always server-computed)
  subtotal              numeric(10,2) not null default 0,
  tax_amount            numeric(10,2) not null default 0,
  service_charge_amount numeric(10,2) not null default 0,
  tip_amount            numeric(10,2) not null default 0,
  total                 numeric(10,2) not null default 0,
  -- Split info
  split_type            text check (split_type in ('full','even','items','custom')),
  split_of              int,              -- e.g. "1 of 3"
  custom_amount         numeric(10,2),    -- for custom amount payments
  -- Provider info
  provider_ref          text unique,      -- Mpesa CheckoutRequestID or Stripe session id
  provider_payload      jsonb,            -- raw webhook/callback payload
  idempotency_key       text not null unique,
  -- Receipt
  receipt_number        text unique,
  receipt_sent_at       timestamptz,
  -- Timing
  initiated_at          timestamptz not null default now(),
  confirmed_at          timestamptz,
  failed_at             timestamptz,
  -- Cash only
  cash_received         numeric(10,2),
  change_due            numeric(10,2),
  recorded_by           uuid references staff(id),
  -- Staff override
  override_by           uuid references staff(id),
  override_reason       override_reason,
  override_note         text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_payments_v2_session on payments_v2(session_id);
create index if not exists idx_payments_v2_venue on payments_v2(venue_id, initiated_at desc);
create index if not exists idx_payments_v2_state on payments_v2(state) where state in ('pending','processing');
create index if not exists idx_payments_v2_provider on payments_v2(provider_ref) where provider_ref is not null;

-- Which order items this payment covers
create table if not exists payment_items (
  id           uuid primary key default uuid_generate_v4(),
  payment_id   uuid not null references payments_v2(id) on delete cascade,
  order_item_id uuid not null references order_items(id),
  amount       numeric(10,2) not null,   -- portion of item price covered by this payment
  created_at   timestamptz not null default now(),
  unique (payment_id, order_item_id)
);

create index if not exists idx_payment_items_payment on payment_items(payment_id);
create index if not exists idx_payment_items_item on payment_items(order_item_id);

-- Item reservations (prevent double-payment)
create table if not exists item_reservations (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references table_sessions(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  device_token  text not null,
  expires_at    timestamptz not null default (now() + interval '10 minutes'),
  created_at    timestamptz not null default now(),
  unique (order_item_id)  -- only one reservation per item at a time
);

create index if not exists idx_reservations_session on item_reservations(session_id);
create index if not exists idx_reservations_expires on item_reservations(expires_at);

-- Session close overrides
create table if not exists session_close_overrides (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references table_sessions(id) on delete cascade,
  venue_id      uuid not null references venues(id) on delete cascade,
  outstanding   numeric(10,2) not null,
  reason        override_reason not null,
  note          text,
  approved_by   uuid references staff(id),  -- manager approval if required
  created_by    uuid not null references staff(id),
  created_at    timestamptz not null default now()
);

-- Receipts
create table if not exists receipts (
  id            uuid primary key default uuid_generate_v4(),
  payment_id    uuid not null references payments_v2(id) on delete cascade unique,
  venue_id      uuid not null references venues(id) on delete cascade,
  receipt_number text not null unique,
  data          jsonb not null,  -- snapshot of receipt content
  created_at    timestamptz not null default now()
);

-- Add FK from order_items to payments_v2 now that it exists
do $$ begin
  alter table order_items
    add constraint fk_order_items_payment
    foreign key (paid_by_payment_id) references payments_v2(id);
exception when duplicate_object then null;
end $$;

-- Receipt number sequence
create table if not exists receipt_number_seq (
  venue_id  uuid primary key references venues(id) on delete cascade,
  last_seq  int not null default 0
);

-- ============================================================
-- SECTION 4: NEW AUDIT ACTIONS
-- ============================================================

alter type audit_action add value if not exists 'payment_initiated';
alter type audit_action add value if not exists 'payment_processing';
alter type audit_action add value if not exists 'payment_succeeded';
alter type audit_action add value if not exists 'payment_failed';
alter type audit_action add value if not exists 'payment_cancelled';
alter type audit_action add value if not exists 'payment_refunded';
alter type audit_action add value if not exists 'item_voided';
alter type audit_action add value if not exists 'item_comped';
alter type audit_action add value if not exists 'item_reserved';
alter type audit_action add value if not exists 'item_reservation_released';
alter type audit_action add value if not exists 'session_close_override';
alter type audit_action add value if not exists 'cash_payment_recorded';
alter type audit_action add value if not exists 'receipt_generated';

-- ============================================================
-- SECTION 5: RLS
-- ============================================================

alter table payments_v2           enable row level security;
alter table payment_items         enable row level security;
alter table item_reservations     enable row level security;
alter table session_close_overrides enable row level security;
alter table receipts              enable row level security;
alter table receipt_number_seq    enable row level security;

-- payments_v2
create policy "public insert payment_v2"
  on payments_v2 for insert with check (true);
create policy "public read own payments_v2"
  on payments_v2 for select using (true);
create policy "staff manage payments_v2"
  on payments_v2 for all
  using (venue_id = get_my_venue_id() and i_am_staff());

-- payment_items
create policy "public insert payment_items"
  on payment_items for insert with check (true);
create policy "public read payment_items"
  on payment_items for select using (true);
create policy "staff manage payment_items"
  on payment_items for all
  using (
    exists (select 1 from payments_v2 p where p.id = payment_id and p.venue_id = get_my_venue_id())
    and i_am_staff()
  );

-- item_reservations
create policy "public manage reservations"
  on item_reservations for all using (true) with check (true);

-- session_close_overrides
create policy "staff read overrides"
  on session_close_overrides for select
  using (venue_id = get_my_venue_id() and i_am_staff());
create policy "staff insert overrides"
  on session_close_overrides for insert
  with check (venue_id = get_my_venue_id() and i_am_staff());

-- receipts
create policy "public read receipts"
  on receipts for select using (true);
create policy "staff insert receipts"
  on receipts for insert with check (venue_id = get_my_venue_id() and i_am_staff());

-- receipt_number_seq
create policy "all use receipt seq"
  on receipt_number_seq for all using (true) with check (true);

-- ============================================================
-- SECTION 6: REALTIME
-- ============================================================

do $$ begin
  alter publication supabase_realtime add table payments_v2;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table order_items;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table item_reservations;
exception when duplicate_object then null; end $$;
