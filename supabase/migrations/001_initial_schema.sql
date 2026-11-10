-- ============================================================
-- TableKey – Full Database Schema
-- Run this in Supabase SQL editor or via supabase db push
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type table_status as enum ('idle', 'requested', 'active', 'awaiting_payment', 'closed');
create type order_status as enum ('new', 'preparing', 'ready', 'served', 'cancelled');
create type payment_method as enum ('card', 'cash');
create type payment_status as enum ('pending', 'completed', 'failed', 'refunded');
create type staff_role as enum ('waiter', 'kitchen', 'admin');
create type audit_action as enum (
  'table_request', 'request_approved', 'request_denied',
  'code_generated', 'code_entered', 'code_failed',
  'session_opened', 'session_closed', 'device_joined', 'device_revoked',
  'order_placed', 'order_status_changed', 'order_cancelled',
  'payment_initiated', 'payment_completed', 'payment_failed',
  'item_86ed', 'item_restored',
  'staff_invited', 'staff_removed',
  'settings_changed'
);

-- ============================================================
-- VENUES
-- ============================================================

create table venues (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  slug          text not null unique,
  logo_url      text,
  address       text,
  phone         text,
  currency      text not null default 'USD',
  timezone      text not null default 'UTC',
  -- settings
  code_length            int not null default 4 check (code_length between 4 and 8),
  session_timeout_min    int not null default 120,  -- session auto-close after inactivity
  inactivity_timeout_min int not null default 30,   -- code expires if no activity
  max_code_attempts      int not null default 3,
  request_escalate_min   int not null default 3,    -- escalate if waiter doesn't respond
  rate_limit_requests    int not null default 10,   -- max requests per device per 2-min window
  -- kitchen
  kitchen_open    boolean not null default true,
  -- payment
  stripe_account_id text,
  allow_cash        boolean not null default true,
  allow_card        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- TABLES (physical restaurant tables)
-- ============================================================

create table restaurant_tables (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid not null references venues(id) on delete cascade,
  table_number text not null,
  label       text,                      -- e.g. "Window seat", "Patio 1"
  capacity    int,
  status      table_status not null default 'idle',
  qr_token    text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz not null default now(),
  unique (venue_id, table_number)
);

create index idx_tables_venue on restaurant_tables(venue_id);
create index idx_tables_qr_token on restaurant_tables(qr_token);

-- ============================================================
-- STAFF
-- ============================================================

create table staff (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid not null references venues(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,  -- null until they accept invite
  email       text not null,
  name        text not null,
  role        staff_role not null,
  active      boolean not null default true,
  invited_at  timestamptz not null default now(),
  joined_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (venue_id, email)
);

create index idx_staff_venue on staff(venue_id);
create index idx_staff_user on staff(user_id);

-- ============================================================
-- TABLE SESSIONS
-- ============================================================

create table table_sessions (
  id            uuid primary key default uuid_generate_v4(),
  venue_id      uuid not null references venues(id) on delete cascade,
  table_id      uuid not null references restaurant_tables(id) on delete cascade,
  opened_by     uuid references staff(id),   -- waiter who accepted
  closed_by     uuid references staff(id),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  -- code
  current_code  text,                        -- null when session closed
  code_expires_at timestamptz,
  code_attempts   int not null default 0,
  code_locked     boolean not null default false,
  -- status
  is_active     boolean not null default true,
  last_activity timestamptz not null default now()
);

create index idx_sessions_table on table_sessions(table_id);
create index idx_sessions_venue on table_sessions(venue_id);
create index idx_sessions_active on table_sessions(table_id, is_active) where is_active = true;

-- ============================================================
-- SESSION DEVICES (each phone that has verified the code)
-- ============================================================

create table session_devices (
  id             uuid primary key default uuid_generate_v4(),
  session_id     uuid not null references table_sessions(id) on delete cascade,
  device_token   text not null,  -- random token stored in localStorage
  device_label   text,           -- browser UA snippet
  joined_at      timestamptz not null default now(),
  revoked_at     timestamptz,
  is_active      boolean not null default true
);

create index idx_devices_session on session_devices(session_id);
create unique index idx_devices_token on session_devices(device_token, session_id);

-- ============================================================
-- TABLE REQUESTS (step 3 of core flow)
-- ============================================================

create table table_requests (
  id           uuid primary key default uuid_generate_v4(),
  venue_id     uuid not null references venues(id) on delete cascade,
  table_id     uuid not null references restaurant_tables(id) on delete cascade,
  device_token text not null,
  ip_address   inet,
  status       text not null default 'pending' check (status in ('pending','approved','denied','expired')),
  handled_by   uuid references staff(id),
  requested_at timestamptz not null default now(),
  handled_at   timestamptz,
  session_id   uuid references table_sessions(id)  -- set on approval
);

create index idx_requests_table on table_requests(table_id, status);
create index idx_requests_venue on table_requests(venue_id);

-- ============================================================
-- MENU CATEGORIES
-- ============================================================

create table menu_categories (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid not null references venues(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index idx_categories_venue on menu_categories(venue_id);

-- ============================================================
-- MENU ITEMS
-- ============================================================

create table menu_items (
  id            uuid primary key default uuid_generate_v4(),
  venue_id      uuid not null references venues(id) on delete cascade,
  category_id   uuid not null references menu_categories(id) on delete cascade,
  name          text not null,
  description   text,
  price         numeric(10,2) not null check (price >= 0),
  image_url     text,
  sort_order    int not null default 0,
  available     boolean not null default true,   -- false = "86'd"
  allergens     text[],                           -- e.g. ['gluten','nuts']
  prep_time_min int,                              -- estimated prep minutes
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_items_venue on menu_items(venue_id);
create index idx_items_category on menu_items(category_id);

-- ============================================================
-- ITEM OPTIONS (modifiers: size, extras, etc.)
-- ============================================================

create table item_options (
  id          uuid primary key default uuid_generate_v4(),
  item_id     uuid not null references menu_items(id) on delete cascade,
  group_name  text not null,           -- e.g. "Size", "Extras"
  required    boolean not null default false,
  multi_select boolean not null default false
);

create table item_option_choices (
  id          uuid primary key default uuid_generate_v4(),
  option_id   uuid not null references item_options(id) on delete cascade,
  label       text not null,
  price_delta numeric(10,2) not null default 0
);

-- ============================================================
-- ORDERS
-- ============================================================

create table orders (
  id              uuid primary key default uuid_generate_v4(),
  venue_id        uuid not null references venues(id) on delete cascade,
  table_id        uuid not null references restaurant_tables(id) on delete cascade,
  session_id      uuid not null references table_sessions(id) on delete cascade,
  device_token    text not null,
  order_number    text not null,    -- human-readable, e.g. "#042"
  status          order_status not null default 'new',
  notes           text,
  subtotal        numeric(10,2) not null default 0,
  idempotency_key text not null unique,   -- client-generated UUID to prevent duplicates
  placed_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_orders_session on orders(session_id);
create index idx_orders_venue on orders(venue_id, placed_at desc);
create index idx_orders_status on orders(venue_id, status) where status not in ('served','cancelled');

-- ============================================================
-- ORDER ITEMS
-- ============================================================

create table order_items (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references orders(id) on delete cascade,
  item_id     uuid not null references menu_items(id),
  item_name   text not null,      -- snapshot at time of order
  item_price  numeric(10,2) not null,
  quantity    int not null default 1 check (quantity > 0),
  notes       text,               -- per-item notes ("no onions")
  options     jsonb,              -- snapshot of selected options
  line_total  numeric(10,2) not null
);

create index idx_order_items_order on order_items(order_id);

-- ============================================================
-- PAYMENTS
-- ============================================================

create table payments (
  id                  uuid primary key default uuid_generate_v4(),
  venue_id            uuid not null references venues(id) on delete cascade,
  session_id          uuid not null references table_sessions(id) on delete cascade,
  device_token        text not null,
  method              payment_method not null,
  status              payment_status not null default 'pending',
  amount              numeric(10,2) not null,
  stripe_payment_intent_id text unique,
  stripe_checkout_session  text unique,
  order_ids           uuid[],    -- which orders this payment covers
  split_type          text check (split_type in ('full','even','items')),
  split_of            int,       -- e.g. 3 (of 4 people)
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index idx_payments_session on payments(session_id);

-- ============================================================
-- AUDIT LOG
-- ============================================================

create table audit_log (
  id          bigserial primary key,
  venue_id    uuid references venues(id) on delete set null,
  action      audit_action not null,
  actor_type  text not null check (actor_type in ('customer','waiter','kitchen','admin','system')),
  actor_id    text,          -- staff id, device token, or 'system'
  target_type text,          -- 'table', 'session', 'order', 'payment', etc.
  target_id   text,
  metadata    jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index idx_audit_venue on audit_log(venue_id, created_at desc);
create index idx_audit_action on audit_log(action, created_at desc);

-- ============================================================
-- RATE LIMIT TRACKING
-- ============================================================

create table rate_limit_buckets (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid references venues(id) on delete cascade,
  bucket_key  text not null,    -- e.g. "req:device:<token>" or "req:ip:<ip>"
  count       int not null default 1,
  window_start timestamptz not null default now(),
  unique (venue_id, bucket_key)
);

create index idx_rate_limit_key on rate_limit_buckets(bucket_key, window_start);

-- ============================================================
-- HELPER: auto-update updated_at
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_venues_updated_at        before update on venues        for each row execute function set_updated_at();
create trigger trg_menu_items_updated_at    before update on menu_items    for each row execute function set_updated_at();
create trigger trg_orders_updated_at        before update on orders        for each row execute function set_updated_at();

-- ============================================================
-- HELPER: generate sequential order numbers per venue
-- ============================================================

create table order_number_seq (
  venue_id uuid primary key references venues(id) on delete cascade,
  last_seq  int not null default 0
);

create or replace function next_order_number(p_venue_id uuid)
returns text language plpgsql as $$
declare
  v_seq int;
begin
  insert into order_number_seq (venue_id, last_seq)
  values (p_venue_id, 1)
  on conflict (venue_id) do update
    set last_seq = order_number_seq.last_seq + 1
  returning last_seq into v_seq;
  return '#' || lpad(v_seq::text, 3, '0');
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
alter table venues              enable row level security;
alter table restaurant_tables   enable row level security;
alter table staff               enable row level security;
alter table table_sessions      enable row level security;
alter table session_devices     enable row level security;
alter table table_requests      enable row level security;
alter table menu_categories     enable row level security;
alter table menu_items          enable row level security;
alter table item_options        enable row level security;
alter table item_option_choices enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table payments            enable row level security;
alter table audit_log           enable row level security;
alter table rate_limit_buckets  enable row level security;
alter table order_number_seq    enable row level security;

-- ── Helper: get current user's venue_id and role ────────────

create or replace function auth_venue_id() returns uuid language sql stable as $$
  select (auth.jwt() -> 'user_metadata' ->> 'venue_id')::uuid;
$$;

create or replace function auth_staff_role() returns text language sql stable as $$
  select auth.jwt() -> 'user_metadata' ->> 'role';
$$;

create or replace function auth_is_admin() returns boolean language sql stable as $$
  select auth_staff_role() = 'admin';
$$;

create or replace function auth_is_staff() returns boolean language sql stable as $$
  select auth_staff_role() in ('admin','waiter','kitchen');
$$;

-- ── VENUES ──────────────────────────────────────────────────

-- Staff read their own venue; admin can update
create policy "staff read own venue"
  on venues for select
  using (id = auth_venue_id() and auth_is_staff());

create policy "admin update own venue"
  on venues for update
  using (id = auth_venue_id() and auth_is_admin());

-- Public: anonymous can read venue by id (needed for customer menu)
create policy "public read venue"
  on venues for select
  using (true);

-- ── RESTAURANT TABLES ────────────────────────────────────────

-- Public read (customer scans QR, needs to verify table exists)
create policy "public read tables"
  on restaurant_tables for select
  using (true);

-- Staff CRUD on their venue's tables
create policy "staff manage tables"
  on restaurant_tables for all
  using (venue_id = auth_venue_id() and auth_is_staff());

-- ── STAFF ────────────────────────────────────────────────────

create policy "staff read own venue staff"
  on staff for select
  using (venue_id = auth_venue_id() and auth_is_staff());

create policy "admin manage staff"
  on staff for all
  using (venue_id = auth_venue_id() and auth_is_admin());

-- ── TABLE SESSIONS ───────────────────────────────────────────

-- Anonymous: can read session for their table (to check if active/get code prompt)
-- We use device_token check at app layer; RLS just ensures venue isolation
create policy "public read sessions"
  on table_sessions for select
  using (true);

create policy "staff manage sessions"
  on table_sessions for all
  using (venue_id = auth_venue_id() and auth_is_staff());

-- ── SESSION DEVICES ──────────────────────────────────────────

create policy "public read devices"
  on session_devices for select
  using (true);

create policy "public insert device"
  on session_devices for insert
  with check (true);

create policy "staff manage devices"
  on session_devices for all
  using (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id and ts.venue_id = auth_venue_id()
    ) and auth_is_staff()
  );

-- ── TABLE REQUESTS ────────────────────────────────────────────

create policy "public insert request"
  on table_requests for insert
  with check (true);

create policy "public read own request"
  on table_requests for select
  using (true);

create policy "staff manage requests"
  on table_requests for all
  using (venue_id = auth_venue_id() and auth_is_staff());

-- ── MENU ─────────────────────────────────────────────────────

create policy "public read menu categories"
  on menu_categories for select
  using (true);

create policy "admin manage menu categories"
  on menu_categories for all
  using (venue_id = auth_venue_id() and auth_is_admin());

create policy "public read menu items"
  on menu_items for select
  using (true);

create policy "admin manage menu items"
  on menu_items for all
  using (venue_id = auth_venue_id() and auth_is_admin());

create policy "public read item options"
  on item_options for select
  using (true);

create policy "admin manage item options"
  on item_options for all
  using (
    exists (
      select 1 from menu_items mi
      where mi.id = item_id and mi.venue_id = auth_venue_id()
    ) and auth_is_admin()
  );

create policy "public read option choices"
  on item_option_choices for select
  using (true);

create policy "admin manage option choices"
  on item_option_choices for all
  using (
    exists (
      select 1 from item_options io
        join menu_items mi on mi.id = io.item_id
      where io.id = option_id and mi.venue_id = auth_venue_id()
    ) and auth_is_admin()
  );

-- ── ORDERS ────────────────────────────────────────────────────

create policy "public insert order"
  on orders for insert
  with check (true);

create policy "public read own orders"
  on orders for select
  using (true);

create policy "staff manage orders"
  on orders for all
  using (venue_id = auth_venue_id() and auth_is_staff());

-- ── ORDER ITEMS ───────────────────────────────────────────────

create policy "public insert order items"
  on order_items for insert
  with check (true);

create policy "public read order items"
  on order_items for select
  using (true);

create policy "staff read order items"
  on order_items for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_id and o.venue_id = auth_venue_id()
    ) and auth_is_staff()
  );

-- ── PAYMENTS ─────────────────────────────────────────────────

create policy "public insert payment"
  on payments for insert
  with check (true);

create policy "public read own payments"
  on payments for select
  using (true);

create policy "staff manage payments"
  on payments for all
  using (venue_id = auth_venue_id() and auth_is_staff());

-- ── AUDIT LOG ─────────────────────────────────────────────────

create policy "public insert audit"
  on audit_log for insert
  with check (true);

create policy "staff read audit"
  on audit_log for select
  using (venue_id = auth_venue_id() and auth_is_staff());

-- ── RATE LIMITS ───────────────────────────────────────────────

create policy "public rate limit"
  on rate_limit_buckets for all
  using (true) with check (true);

-- ── ORDER SEQ ─────────────────────────────────────────────────

create policy "staff use order seq"
  on order_number_seq for all
  using (true) with check (true);

-- ============================================================
-- REALTIME: enable for live updates
-- ============================================================

alter publication supabase_realtime add table restaurant_tables;
alter publication supabase_realtime add table table_sessions;
alter publication supabase_realtime add table table_requests;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table payments;
alter publication supabase_realtime add table session_devices;
