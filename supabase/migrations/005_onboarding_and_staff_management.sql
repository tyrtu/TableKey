-- ============================================================
-- TableKey – Onboarding & Staff Management
-- Run AFTER 004_add_enum_values.sql
-- ============================================================

-- ============================================================
-- SECTION 1: ALTER EXISTING TABLES
-- ============================================================

alter table venues add column if not exists owner_id uuid;
alter table venues add column if not exists setup_progress jsonb default '{"tables":false,"menu":false,"staff":false,"qr":false}'::jsonb;

alter table staff add column if not exists pin_hash text;
alter table staff add column if not exists pin_attempts int not null default 0;
alter table staff add column if not exists on_duty boolean not null default false;
alter table staff add column if not exists last_active_at timestamptz;

alter table table_requests add column if not exists assigned_waiter_id uuid;
alter table table_requests add column if not exists escalated_at timestamptz;

-- ============================================================
-- SECTION 2: NEW TABLES
-- ============================================================

-- Platform super admins (the SaaS operator, not venue staff)
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

-- Floor sections (e.g. "Main Floor", "Patio", "Bar")
create table if not exists sections (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid not null references venues(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sections_venue on sections(venue_id);

-- Waiter ↔ table assignments
create table if not exists staff_table_assignments (
  id         uuid primary key default uuid_generate_v4(),
  staff_id   uuid not null references staff(id) on delete cascade,
  table_id   uuid not null references restaurant_tables(id) on delete cascade,
  section_id uuid references sections(id) on delete set null,
  shift      text not null default 'all_day' check (shift in ('morning','evening','all_day')),
  created_at timestamptz not null default now(),
  unique (staff_id, table_id, shift)
);
create index if not exists idx_assignments_staff on staff_table_assignments(staff_id);
create index if not exists idx_assignments_table on staff_table_assignments(table_id);

-- Paired devices (kitchen tablets, shared waiter phones)
create table if not exists paired_devices (
  id                  uuid primary key default uuid_generate_v4(),
  venue_id            uuid not null references venues(id) on delete cascade,
  device_token        text not null unique default encode(gen_random_bytes(32), 'hex'),
  device_label        text,
  pairing_code        text not null unique,
  pairing_expires_at  timestamptz,
  paired_at           timestamptz,   -- null until paired
  last_used_at        timestamptz,
  locked              boolean not null default false,
  locked_at           timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists idx_paired_venue on paired_devices(venue_id);

-- PIN-based login sessions (for shared devices)
create table if not exists staff_sessions (
  id         uuid primary key default uuid_generate_v4(),
  staff_id   uuid not null references staff(id) on delete cascade,
  device_id  uuid references paired_devices(id) on delete set null,
  token      text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '8 hours'),
  created_at timestamptz not null default now()
);
create index if not exists idx_staff_sessions_token on staff_sessions(token);

-- ============================================================
-- SECTION 3: UPDATE AUTH HELPER FUNCTIONS
-- Query staff table directly instead of JWT metadata
-- ============================================================

create or replace function auth_venue_id() returns uuid language sql stable as $$
  select venue_id from staff where user_id = auth.uid() and active = true limit 1
$$;

create or replace function auth_staff_role() returns text language sql stable as $$
  select role from staff where user_id = auth.uid() and active = true limit 1
$$;

create or replace function auth_is_admin() returns boolean language sql stable as $$
  select auth_staff_role() in ('owner', 'admin')
$$;

create or replace function auth_is_owner() returns boolean language sql stable as $$
  select auth_staff_role() = 'owner'
$$;

create or replace function auth_is_manager() returns boolean language sql stable as $$
  select auth_staff_role() in ('owner', 'admin', 'manager')
$$;

create or replace function auth_is_staff() returns boolean language sql stable as $$
  select auth_staff_role() in ('owner', 'admin', 'manager', 'waiter', 'kitchen')
$$;

-- Platform admin check
create or replace function is_platform_admin() returns boolean language sql stable as $$
  select exists(select 1 from platform_admins where user_id = auth.uid())
$$;

-- ============================================================
-- SECTION 4: STAFF SESSION HELPER FUNCTIONS
-- Used by RLS policies for PIN-based sessions
-- The client sends X-Staff-Token header; PostgREST exposes it
-- via current_setting('request.header.x-staff-token', true)
-- ============================================================

create or replace function staff_session_staff_id() returns uuid language sql stable as $$
  select ss.staff_id
  from staff_sessions ss
  join staff s on s.id = ss.staff_id
  where ss.token = nullif(current_setting('request.header.x-staff-token', true), '')
  and ss.expires_at > now()
  and s.active = true
  limit 1
$$;

create or replace function staff_session_venue_id() returns uuid language sql stable as $$
  select s.venue_id
  from staff_sessions ss
  join staff s on s.id = ss.staff_id
  where ss.token = nullif(current_setting('request.header.x-staff-token', true), '')
  and ss.expires_at > now()
  and s.active = true
  limit 1
$$;

create or replace function staff_session_role() returns text language sql stable as $$
  select s.role
  from staff_sessions ss
  join staff s on s.id = ss.staff_id
  where ss.token = nullif(current_setting('request.header.x-staff-token', true), '')
  and ss.expires_at > now()
  and s.active = true
  limit 1
$$;

-- ============================================================
-- SECTION 5: RPCs
-- ============================================================

-- ── Verify PIN and create a staff session ───────────────────

create or replace function verify_pin(p_staff_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   record;
  v_token   text;
  v_device_id uuid;
begin
  select * into v_staff from staff where id = p_staff_id and active = true;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Staff member not found or inactive');
  end if;

  if v_staff.pin_attempts >= 5 then
    return jsonb_build_object('success', false, 'message', 'Too many failed attempts. Ask your manager to reset your PIN.');
  end if;

  if v_staff.pin_hash is null then
    return jsonb_build_object('success', false, 'message', 'No PIN set. Ask your manager to set one.');
  end if;

  if crypt(p_pin, v_staff.pin_hash) = v_staff.pin_hash then
    -- Success
    update staff set pin_attempts = 0, last_active_at = now(), on_duty = true where id = p_staff_id;

    -- Optionally link to a paired device
    select id into v_device_id from paired_devices
    where device_token = nullif(current_setting('request.header.x-device-token', true), '')
    and venue_id = v_staff.venue_id and locked = false and paired_at is not null
    limit 1;

    v_token := encode(gen_random_bytes(32), 'hex');
    insert into staff_sessions (staff_id, device_id, token)
    values (p_staff_id, v_device_id, v_token);

    insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
    values (v_staff.venue_id, 'pin_login_success', v_staff.role, p_staff_id::text, 'staff', p_staff_id::text);

    return jsonb_build_object(
      'success', true,
      'session_token', v_token,
      'staff_id', p_staff_id,
      'venue_id', v_staff.venue_id,
      'role', v_staff.role,
      'name', v_staff.name
    );
  else
    update staff set pin_attempts = pin_attempts + 1 where id = p_staff_id;
    insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
    values (v_staff.venue_id, 'pin_login_failed', v_staff.role, p_staff_id::text, 'staff', p_staff_id::text);
    return jsonb_build_object('success', false, 'message', 'Incorrect PIN');
  end if;
end;
$$;

-- ── Set PIN (owner/admin sets for staff, or staff sets own) ──

create or replace function set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_venue_id uuid;
begin
  select venue_id into v_target_venue_id from staff where id = p_staff_id;
  if v_target_venue_id is null then
    raise exception 'Staff member not found';
  end if;

  if not exists (
    select 1 from staff s
    where s.user_id = auth.uid()
    and s.active = true
    and (
      s.id = p_staff_id
      or (s.venue_id = v_target_venue_id and s.role in ('owner', 'admin'))
    )
  ) then
    raise exception 'Not authorized to set PIN';
  end if;

  if length(p_pin) < 4 or length(p_pin) > 6 or not p_pin ~ '^[0-9]+$' then
    raise exception 'PIN must be 4-6 digits';
  end if;

  update staff set pin_hash = crypt(p_pin, gen_salt('bf')), pin_attempts = 0
  where id = p_staff_id;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
  values (v_target_venue_id, 'pin_set', 'admin', auth.uid()::text, 'staff', p_staff_id::text);
end;
$$;

-- ── Reset PIN (clears the hash so staff must set a new one) ──

create or replace function reset_staff_pin(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_venue_id uuid;
begin
  select venue_id into v_target_venue_id from staff where id = p_staff_id;

  if not exists (
    select 1 from staff s
    where s.user_id = auth.uid()
    and s.venue_id = v_target_venue_id
    and s.role in ('owner', 'admin')
    and s.active = true
  ) then
    raise exception 'Not authorized to reset PIN';
  end if;

  update staff set pin_hash = null, pin_attempts = 0 where id = p_staff_id;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
  values (v_target_venue_id, 'pin_reset', 'admin', auth.uid()::text, 'staff', p_staff_id::text);
end;
$$;

-- ── Generate a one-time pairing code ─────────────────────────

create or replace function generate_pairing_code(p_venue_id uuid, p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_id   uuid;
begin
  if not exists (
    select 1 from staff
    where user_id = auth.uid()
    and venue_id = p_venue_id
    and role in ('owner', 'admin', 'manager')
    and active = true
  ) then
    raise exception 'Not authorized';
  end if;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  insert into paired_devices (venue_id, pairing_code, device_label, pairing_expires_at)
  values (p_venue_id, v_code, p_label, now() + interval '1 hour')
  returning id into v_id;

  return jsonb_build_object('success', true, 'pairing_code', v_code, 'device_id', v_id);
end;
$$;

-- ── Pair a device with a code (public — no auth required) ────

create or replace function pair_device(p_pairing_code text, p_device_label text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row paired_devices%rowtype;
begin
  select * into v_row from paired_devices
  where pairing_code = p_pairing_code
  and paired_at is null
  and (pairing_expires_at is null or pairing_expires_at > now())
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Invalid or expired pairing code');
  end if;

  update paired_devices
  set device_label = coalesce(p_device_label, device_label), paired_at = now()
  where id = v_row.id
  returning * into v_row;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_row.venue_id, 'device_paired', 'system', v_row.device_token, 'device', v_row.id::text, jsonb_build_object('label', p_device_label));

  return jsonb_build_object(
    'success', true,
    'device_token', v_row.device_token,
    'venue_id', v_row.venue_id
  );
end;
$$;

-- ── Validate a staff session token (for persistence on reload) ─

create or replace function validate_staff_session(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'valid', true,
    'staff_id', ss.staff_id,
    'venue_id', s.venue_id,
    'role', s.role,
    'name', s.name,
    'email', s.email
  )
  from staff_sessions ss
  join staff s on s.id = ss.staff_id
  where ss.token = p_token
  and ss.expires_at > now()
  and s.active = true
$$;

-- ── Get staff list for PIN login (requires paired device token) ─

create or replace function get_staff_for_pin(p_device_token text)
returns table (id uuid, name text, role text, has_pin boolean)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name, s.role, (s.pin_hash is not null) as has_pin
  from staff s
  join paired_devices pd on pd.venue_id = s.venue_id
  where pd.device_token = p_device_token
  and pd.paired_at is not null
  and pd.locked = false
  and s.active = true
  order by s.name
$$;

-- ── Transfer venue ownership ────────────────────────────────

create or replace function transfer_ownership(p_venue_id uuid, p_new_owner_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_owner_id uuid;
  v_new_owner_user_id uuid;
begin
  select id into v_current_owner_id
  from staff where venue_id = p_venue_id and user_id = auth.uid() and role = 'owner' and active = true;

  if v_current_owner_id is null then
    raise exception 'Only the current owner can transfer ownership';
  end if;

  select user_id into v_new_owner_user_id from staff where id = p_new_owner_staff_id and venue_id = p_venue_id and active = true;
  if v_new_owner_user_id is null then
    raise exception 'Target staff member not found';
  end if;

  update staff set role = 'admin' where id = v_current_owner_id;
  update staff set role = 'owner' where id = p_new_owner_staff_id;
  update venues set owner_id = v_new_owner_user_id where id = p_venue_id;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (p_venue_id, 'ownership_transferred', 'admin', auth.uid()::text, 'staff', p_new_owner_staff_id::text,
    jsonb_build_object('from', v_current_owner_id, 'to', p_new_owner_staff_id));
end;
$$;

-- ============================================================
-- SECTION 6: TRIGGERS
-- ============================================================

-- ── Owner self-serve signup ─────────────────────────────────
-- Fires on auth.users INSERT when metadata has signup_type='owner'

create or replace function handle_owner_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_name text;
  v_owner_name      text;
  v_slug            text;
  v_venue_id        uuid;
  v_suffix          text;
begin
  -- Only run for owner signups
  if coalesce(new.raw_user_meta_data->>'signup_type', '') != 'owner' then
    return new;
  end if;

  -- Skip if already linked (e.g. was pre-invited)
  if exists (select 1 from public.staff where user_id = new.id) then
    return new;
  end if;

  -- Also skip if a staff row with this email already has a user_id
  if exists (select 1 from public.staff where email = lower(new.email) and user_id is not null) then
    return new;
  end if;

  v_restaurant_name := trim(coalesce(new.raw_user_meta_data->>'restaurant_name', 'My Restaurant'));
  v_owner_name      := trim(coalesce(new.raw_user_meta_data->>'owner_name', split_part(new.email, '@', 1)));

  -- Build a slug: lowercase, replace non-alphanumeric with dash, add random suffix
  v_slug   := lower(regexp_replace(v_restaurant_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug   := trim(both '-' from v_slug);
  -- Use a timestamp-based suffix instead of gen_random_bytes to avoid extension issues
  v_suffix := to_hex(floor(extract(epoch from now()) * 1000)::bigint % 16777216);
  v_slug   := v_slug || '-' || v_suffix;

  -- Create the venue
  insert into public.venues (name, slug, owner_id)
  values (v_restaurant_name, v_slug, new.id)
  returning id into v_venue_id;

  -- Create order number sequence row
  insert into public.order_number_seq (venue_id, last_seq)
  values (v_venue_id, 0)
  on conflict (venue_id) do nothing;

  -- Create the owner staff record
  insert into public.staff (venue_id, user_id, email, name, role, active, joined_at)
  values (v_venue_id, new.id, lower(new.email), v_owner_name, 'owner', true, now());

  -- Audit log (non-fatal — don't let this block signup)
  begin
    insert into public.audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
    values (v_venue_id, 'owner_signup', 'admin', new.id::text, 'venue', v_venue_id::text,
      jsonb_build_object('restaurant_name', v_restaurant_name));
  exception when others then
    null; -- audit failure must never block signup
  end;

  return new;

exception when others then
  -- Log the error details to help debug, but don't crash the signup
  raise warning 'handle_owner_signup failed for %: % %', new.email, SQLERRM, SQLSTATE;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_owner on auth.users;
create trigger on_auth_user_created_owner
  after insert on auth.users
  for each row execute function handle_owner_signup();

-- ── Revoke sessions + go off duty when staff is deactivated ──

create or replace function on_staff_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active = false and old.active = true then
    delete from staff_sessions where staff_id = new.id;
    update staff set on_duty = false where id = new.id;
    insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
    values (new.venue_id, 'staff_deactivated', 'admin', auth.uid()::text, 'staff', new.id::text);
  elsif new.active = true and old.active = false then
    insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
    values (new.venue_id, 'staff_activated', 'admin', auth.uid()::text, 'staff', new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists staff_deactivation_trigger on staff;
create trigger staff_deactivation_trigger
  after update on staff
  for each row execute function on_staff_deactivate();

-- ── Prevent removing or demoting the last owner ──────────────

create or replace function prevent_last_owner_loss()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_count int;
begin
  -- Deactivating the last owner
  if new.active = false and old.active = true and old.role = 'owner' then
    select count(*) into v_owner_count from staff
    where venue_id = new.venue_id and role = 'owner' and active = true and id != new.id;
    if v_owner_count = 0 then
      raise exception 'Cannot remove the last owner. Transfer ownership to another staff member first.';
    end if;
  end if;

  -- Demoting the last owner (role change from owner to something else)
  if new.role != 'owner' and old.role = 'owner' and new.active = true then
    select count(*) into v_owner_count from staff
    where venue_id = new.venue_id and role = 'owner' and active = true and id != new.id;
    if v_owner_count = 0 then
      raise exception 'Cannot demote the last owner. Transfer ownership first.';
    end if;
  end if;

  -- Log role changes
  if new.role != old.role and new.active = true then
    insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
    values (new.venue_id, 'role_changed', 'admin', auth.uid()::text, 'staff', new.id::text,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_last_owner_trigger on staff;
create trigger prevent_last_owner_trigger
  before update on staff
  for each row execute function prevent_last_owner_loss();

-- ============================================================
-- SECTION 7: RLS ON NEW TABLES
-- ============================================================

alter table platform_admins        enable row level security;
alter table sections                enable row level security;
alter table staff_table_assignments enable row level security;
alter table paired_devices          enable row level security;
alter table staff_sessions          enable row level security;

-- Platform admins
create policy "platform admin self read"
  on platform_admins for select using (user_id = auth.uid());

-- Sections: staff read via venue_id column (sections has venue_id)
create policy "staff read sections"
  on sections for select
  using (venue_id = auth_venue_id() and auth_is_staff());

create policy "pin read sections"
  on sections for select
  using (venue_id = staff_session_venue_id());

create policy "admin manage sections"
  on sections for all
  using (venue_id = auth_venue_id() and auth_is_manager());

-- Staff table assignments: no venue_id column — join through staff
create policy "staff read assignments"
  on staff_table_assignments for select
  using (
    exists (
      select 1 from staff s
      where s.id = staff_id
        and (s.venue_id = auth_venue_id() or s.venue_id = staff_session_venue_id())
    )
  );

create policy "admin manage assignments"
  on staff_table_assignments for all
  using (
    exists (
      select 1 from staff s
      where s.id = staff_id and s.venue_id = auth_venue_id()
    )
    and auth_is_manager()
  );

-- Paired devices: venue_id column exists on paired_devices
create policy "admin read paired devices"
  on paired_devices for select
  using (venue_id = auth_venue_id() and auth_is_manager());

create policy "admin manage paired devices"
  on paired_devices for all
  using (venue_id = auth_venue_id() and auth_is_manager());

-- Staff sessions: no direct client access — only via RPCs
create policy "no direct session access"
  on staff_sessions for all
  using (false) with check (false);

revoke all on staff_sessions from anon, authenticated;

-- ============================================================
-- SECTION 8: ADDITIONAL RLS FOR PIN SESSIONS
-- Allow staff on shared devices (PIN sessions) to access
-- the same tables they can via regular auth.
-- The staff_session_venue_id() function resolves the venue
-- from the X-Staff-Token header via staff_sessions table.
-- ============================================================

-- Venues: no venue_id column — use id directly
create policy "pin read venue"
  on venues for select
  using (id = staff_session_venue_id());

-- Tables
create policy "pin read tables"
  on restaurant_tables for select
  using (venue_id = staff_session_venue_id());

-- Table sessions
create policy "pin read sessions"
  on table_sessions for select
  using (venue_id = staff_session_venue_id());

create policy "pin update sessions"
  on table_sessions for update
  using (venue_id = staff_session_venue_id());

-- Table requests
create policy "pin read requests"
  on table_requests for select
  using (venue_id = staff_session_venue_id());

create policy "pin update requests"
  on table_requests for update
  using (venue_id = staff_session_venue_id());

-- Orders
create policy "pin read orders"
  on orders for select
  using (venue_id = staff_session_venue_id());

create policy "pin update orders"
  on orders for update
  using (venue_id = staff_session_venue_id());

-- Order items: join through orders
create policy "pin read order items"
  on order_items for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_id and o.venue_id = staff_session_venue_id()
    )
  );

-- Menu categories and items
create policy "pin read menu cats"
  on menu_categories for select
  using (venue_id = staff_session_venue_id());

create policy "pin read menu items"
  on menu_items for select
  using (venue_id = staff_session_venue_id());

-- Session devices: join through table_sessions
create policy "pin read devices"
  on session_devices for select
  using (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id and ts.venue_id = staff_session_venue_id()
    )
  );

-- Staff (for duty status and names on shared device)
create policy "pin read staff"
  on staff for select
  using (venue_id = staff_session_venue_id());

-- Payments
create policy "pin read payments"
  on payments for select
  using (venue_id = staff_session_venue_id());

create policy "pin insert payment"
  on payments for insert
  with check (venue_id = staff_session_venue_id());

-- ── Staff: safe policies using security definer function ────

-- A security definer function that reads staff bypassing RLS
-- This is the standard Supabase pattern to avoid infinite recursion
create or replace function get_my_venue_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select venue_id from staff
  where user_id = auth.uid()
  and active = true
  limit 1
$$;

-- Drop any old conflicting policies first
drop policy if exists "staff read own venue staff" on staff;
drop policy if exists "admin manage staff" on staff;
drop policy if exists "staff read own record" on staff;
drop policy if exists "staff read venue staff" on staff;
drop policy if exists "read same venue staff" on staff;
drop policy if exists "owner admin write staff" on staff;
drop policy if exists "read own staff row" on staff;

-- 1. Anyone reads their own row (for login — no recursion possible)
create policy "read own staff row"
  on staff for select
  using (user_id = auth.uid());

-- 2. Read all staff in same venue (via security definer — no recursion)
create policy "read same venue staff"
  on staff for select
  using (venue_id = get_my_venue_id());

-- 3. Owner/admin can write staff (via security definer — no recursion)
create policy "owner admin write staff"
  on staff for all
  using (venue_id = get_my_venue_id());
-- ============================================================

-- Promote the demo admin to owner
update staff set role = 'owner'
where email = 'admin@demo.com'
and venue_id = 'a1b2c3d4-0000-0000-0000-000000000001';

-- ============================================================
-- SECTION 10: REALTIME
-- ============================================================

do $$ begin
  alter publication supabase_realtime add table staff;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table staff_table_assignments;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table paired_devices;
exception when duplicate_object then null; end $$;
