-- ============================================================
-- TableKey – Spec Compliance Upgrade
-- Run AFTER 007_billing_rpcs.sql
-- ============================================================

-- ============================================================
-- SECTION 1: TABLE SLUG (random, rotatable, non-guessable)
-- Replaces qr_token as the public-facing identifier.
-- URL: /:venue_slug/t/:table_slug
-- ============================================================

alter table restaurant_tables
  add column if not exists table_slug text unique
    default encode(gen_random_bytes(6), 'hex');

alter table restaurant_tables
  add column if not exists section_id uuid
    references sections(id) on delete set null;

alter table restaurant_tables
  add column if not exists is_communal boolean not null default false;

-- Backfill any nulls (existing rows that pre-date this migration)
update restaurant_tables
  set table_slug = encode(gen_random_bytes(6), 'hex')
  where table_slug is null;

alter table restaurant_tables
  alter column table_slug set not null;

create index if not exists idx_tables_slug on restaurant_tables(table_slug);

-- ============================================================
-- SECTION 2: SESSION STATE UPGRADES
-- Add 'settling' and 'parked' to the session lifecycle.
-- Also add code_locked_until (timestamptz) so lockouts expire.
-- ============================================================

alter type table_status add value if not exists 'settling';
alter type table_status add value if not exists 'parked';

-- Replace code_locked boolean with a timed lockout
alter table table_sessions
  add column if not exists code_locked_until timestamptz;

-- Parking info
alter table table_sessions
  add column if not exists parked_at timestamptz;
alter table table_sessions
  add column if not exists parked_by uuid references staff(id);
alter table table_sessions
  add column if not exists park_reason text;
alter table table_sessions
  add column if not exists settled_at timestamptz;

-- Last activity used for idle timeout
alter table table_sessions
  add column if not exists idle_timeout_min int;  -- null = use venue default

-- ============================================================
-- SECTION 3: UNIQUE PARTIAL INDEX
-- Enforces "one active or settling session per table"
-- at the DB level, not just application code.
-- For communal tables this is one session per (table, party) —
-- handled by the app layer; the DB index covers the common case.
-- ============================================================

drop index if exists idx_one_active_session_per_table;
create unique index idx_one_active_session_per_table
  on table_sessions (table_id)
  where is_active = true;

-- ============================================================
-- SECTION 4: ORDER STATUS UPGRADES
-- Add 'held' (presence check pending) and 'awaiting_payment'.
-- ============================================================

alter type order_status add value if not exists 'awaiting_payment';
alter type order_status add value if not exists 'held';

-- ============================================================
-- SECTION 5: SHARED CART (server-side, versioned)
-- One cart per session. Clients sync via realtime.
-- Version number enables conflict detection.
-- ============================================================

create table if not exists carts (
  id          uuid primary key default uuid_generate_v4(),
  session_id  uuid not null references table_sessions(id) on delete cascade unique,
  version     int not null default 1,
  notes       text,
  updated_at  timestamptz not null default now()
);

create table if not exists cart_lines (
  id          uuid primary key default uuid_generate_v4(),
  cart_id     uuid not null references carts(id) on delete cascade,
  session_id  uuid not null references table_sessions(id) on delete cascade,
  device_token text not null,
  item_id     uuid not null references menu_items(id),
  item_name   text not null,    -- snapshot at add time
  item_price  numeric(10,2) not null,
  quantity    int not null default 1 check (quantity > 0),
  notes       text,
  options     jsonb,
  options_delta numeric(10,2) not null default 0,
  line_total  numeric(10,2) not null,
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_carts_session on carts(session_id);
create index if not exists idx_cart_lines_cart on cart_lines(cart_id);
create index if not exists idx_cart_lines_session on cart_lines(session_id);

-- RLS
alter table carts      enable row level security;
alter table cart_lines enable row level security;

create policy "public read cart"
  on carts for select using (true);
create policy "public write cart"
  on carts for all using (true) with check (true);

create policy "public read cart lines"
  on cart_lines for select using (true);
create policy "public write cart lines"
  on cart_lines for all using (true) with check (true);

-- Realtime
do $$ begin
  alter publication supabase_realtime add table carts;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table cart_lines;
exception when duplicate_object then null; end $$;

-- ============================================================
-- SECTION 6: SESSION DEVICE HEARTBEAT
-- Each device updates last_seen. Stale devices trigger
-- presence-check (order goes to 'held').
-- ============================================================

alter table session_devices
  add column if not exists last_seen timestamptz default now();

-- ============================================================
-- SECTION 7: VENUE SETTINGS ADDITIONS
-- ============================================================

alter table venues
  add column if not exists session_idle_timeout_min  int not null default 90;
alter table venues
  add column if not exists stale_device_threshold_min int not null default 20;
alter table venues
  add column if not exists pending_payment_timeout_min int not null default 3;
alter table venues
  add column if not exists code_lockout_min int not null default 5;
alter table venues
  add column if not exists request_expiry_min int not null default 10;

-- ============================================================
-- SECTION 8: TABLE REQUEST ADDITIONS
-- One pending request per device + table (enforced by index).
-- ============================================================

drop index if exists idx_one_pending_request_per_device;
create unique index idx_one_pending_request_per_device
  on table_requests (table_id, device_token)
  where status = 'pending';

alter table table_requests
  add column if not exists version int not null default 1;
alter table table_requests
  add column if not exists expires_at timestamptz
    default (now() + interval '10 minutes');
alter table table_requests
  add column if not exists cancelled_at timestamptz;

-- ============================================================
-- SECTION 9: AUDIT ACTION ADDITIONS
-- ============================================================

alter type audit_action add value if not exists 'session_settled';
alter type audit_action add value if not exists 'session_parked';
alter type audit_action add value if not exists 'session_unparked';
alter type audit_action add value if not exists 'session_turned_over';
alter type audit_action add value if not exists 'cart_conflict';
alter type audit_action add value if not exists 'order_held';
alter type audit_action add value if not exists 'order_hold_released';
alter type audit_action add value if not exists 'table_slug_rotated';

-- ============================================================
-- SECTION 10: RPCs
-- ============================================================

-- ── Get session + cart by table slug ─────────────────────────

create or replace function get_table_by_slug(
  p_venue_slug text,
  p_table_slug text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_table record;
  v_venue record;
begin
  select v.*, rt.id as table_id, rt.table_number, rt.label, rt.status as table_status,
         rt.capacity, rt.table_slug, rt.is_communal, rt.section_id
  into v_venue
  from venues v
  join restaurant_tables rt on rt.venue_id = v.id
  where v.slug = p_venue_slug
    and rt.table_slug = p_table_slug
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found',        true,
    'venue_id',     v_venue.id,
    'venue_name',   v_venue.name,
    'venue_slug',   v_venue.slug,
    'table_id',     v_venue.table_id,
    'table_number', v_venue.table_number,
    'table_slug',   v_venue.table_slug,
    'label',        v_venue.label,
    'status',       v_venue.table_status,
    'capacity',     v_venue.capacity,
    'is_communal',  v_venue.is_communal,
    'payment_mode', v_venue.payment_mode,
    'code_length',  v_venue.code_length,
    'max_code_attempts', v_venue.max_code_attempts,
    'kitchen_open', v_venue.kitchen_open,
    'currency',     v_venue.currency,
    'tip_enabled',  v_venue.tip_enabled,
    'tip_presets',  v_venue.tip_presets
  );
end;
$$;

-- ── Rotate table slug ─────────────────────────────────────────

create or replace function rotate_table_slug(p_table_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_new_slug text;
  v_venue_id uuid;
begin
  select venue_id into v_venue_id from restaurant_tables where id = p_table_id;

  if not exists (
    select 1 from staff
    where user_id = auth.uid()
      and venue_id = v_venue_id
      and role in ('owner','admin','manager')
      and active = true
  ) then
    raise exception 'Not authorized';
  end if;

  -- Generate a unique slug
  loop
    v_new_slug := encode(gen_random_bytes(6), 'hex');
    exit when not exists (
      select 1 from restaurant_tables where table_slug = v_new_slug
    );
  end loop;

  update restaurant_tables set table_slug = v_new_slug where id = p_table_id;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
  values (v_venue_id, 'table_slug_rotated', 'admin', auth.uid()::text, 'table', p_table_id::text);

  return v_new_slug;
end;
$$;

-- ── Park a session ────────────────────────────────────────────

create or replace function park_session(
  p_session_id uuid,
  p_staff_id   uuid,
  p_reason     text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session record;
  v_bill    jsonb;
begin
  select * into v_session from table_sessions where id = p_session_id and is_active = true;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Session not found or already closed');
  end if;

  -- Cannot park while a payment is pending
  if exists (
    select 1 from payments_v2
    where session_id = p_session_id and state in ('pending','processing')
  ) then
    return jsonb_build_object('success', false, 'message', 'A payment is in progress. Wait for it to resolve first.');
  end if;

  -- Mark session parked (is_active=false so it detaches from the table)
  update table_sessions
  set is_active = false,
      parked_at = now(),
      parked_by = p_staff_id,
      park_reason = p_reason,
      current_code = null,
      closed_at = now()
  where id = p_session_id;

  -- Free up the table
  update restaurant_tables set status = 'idle' where id = v_session.table_id;

  -- Invalidate all device tokens for this session
  update session_devices set is_active = false, revoked_at = now()
  where session_id = p_session_id and is_active = true;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_session.venue_id, 'session_parked', 'waiter', p_staff_id::text, 'session', p_session_id::text,
    jsonb_build_object('reason', p_reason));

  return jsonb_build_object('success', true);
end;
$$;

-- ── Update cart (versioned) ───────────────────────────────────

create or replace function upsert_cart_line(
  p_session_id  uuid,
  p_device_token text,
  p_item_id     uuid,
  p_item_name   text,
  p_item_price  numeric,
  p_quantity    int,
  p_notes       text,
  p_options     jsonb,
  p_options_delta numeric,
  p_line_total  numeric,
  p_cart_version int   -- client's known version; reject if stale
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cart record;
begin
  -- Get or create cart for this session
  insert into carts (session_id) values (p_session_id)
  on conflict (session_id) do nothing;

  select * into v_cart from carts where session_id = p_session_id for update;

  -- Version conflict check
  if p_cart_version is not null and v_cart.version != p_cart_version then
    return jsonb_build_object(
      'success', false,
      'conflict', true,
      'current_version', v_cart.version,
      'message', 'Cart was updated by another device. Please review.'
    );
  end if;

  -- Upsert the line (merge same item+options+notes from same device)
  insert into cart_lines (
    cart_id, session_id, device_token, item_id, item_name, item_price,
    quantity, notes, options, options_delta, line_total
  ) values (
    v_cart.id, p_session_id, p_device_token, p_item_id, p_item_name, p_item_price,
    p_quantity, p_notes, p_options, p_options_delta, p_line_total
  )
  on conflict do nothing;

  -- Bump version
  update carts set version = version + 1, updated_at = now()
  where id = v_cart.id;

  return jsonb_build_object('success', true, 'new_version', v_cart.version + 1);
end;
$$;

-- ── Device heartbeat ──────────────────────────────────────────

create or replace function device_heartbeat(p_device_token text, p_session_id uuid)
returns void language sql security definer set search_path = public as $$
  update session_devices
  set last_seen = now()
  where device_token = p_device_token
    and session_id = p_session_id
    and is_active = true;
$$;

-- ── Check if a device is stale ────────────────────────────────

create or replace function is_device_stale(
  p_device_token  text,
  p_session_id    uuid,
  p_threshold_min int default 20
)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from session_devices
    where device_token = p_device_token
      and session_id = p_session_id
      and is_active = true
      and last_seen < now() - (p_threshold_min * interval '1 minute')
  );
$$;

-- ============================================================
-- SECTION 11: UPDATE DEMO SEED
-- Give existing tables a slug if they don't have one
-- (the default already handles new rows)
-- ============================================================

update restaurant_tables
  set table_slug = encode(gen_random_bytes(6), 'hex')
  where table_slug is null
    and venue_id = 'a1b2c3d4-0000-0000-0000-000000000001';
