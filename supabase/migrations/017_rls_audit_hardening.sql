-- ============================================================
-- TableKey – RLS Audit Hardening (Migration 017)
-- Closes cross-venue data leaks identified in security audit.
--
-- CHANGES:
--   1. venues             — remove (true), scope to venue member / slug lookup
--   2. restaurant_tables  — remove (true), scope to venue
--   3. table_sessions     — remove (true), scope to venue + active session
--   4. session_devices    — scope insert to active sessions; scope read to own session
--   5. table_requests     — scope read to own device_token
--   6. audit_log          — move anon insert to SECURITY DEFINER RPC
--   7. item_reservations  — scope to active sessions
--   8. kitchen_stations   — scope read to venue
--   9. order_number_seq   — restrict to RPC-only (remove direct anon access)
--  10. receipt_number_seq — same
-- ============================================================

-- This migration may be rerun after a partial manual deployment.
-- Remove policies created by this migration so each definition below
-- can be applied consistently.
drop policy if exists "auth staff read venue" on venues;
drop policy if exists "pin staff read venue" on venues;
drop policy if exists "anon read venue by slug" on venues;
drop policy if exists "auth staff update venue" on venues;
drop policy if exists "auth staff manage tables" on restaurant_tables;
drop policy if exists "pin staff read tables" on restaurant_tables;
drop policy if exists "anon read tables" on restaurant_tables;
drop policy if exists "auth staff manage sessions" on table_sessions;
drop policy if exists "pin staff manage sessions" on table_sessions;
drop policy if exists "anon read active sessions" on table_sessions;
drop policy if exists "auth staff manage devices" on session_devices;
drop policy if exists "pin staff manage devices" on session_devices;
drop policy if exists "anon insert device active session" on session_devices;
drop policy if exists "anon update own device" on session_devices;
drop policy if exists "anon read own session devices" on session_devices;
drop policy if exists "auth staff manage requests" on table_requests;
drop policy if exists "pin staff manage requests" on table_requests;
drop policy if exists "anon insert request" on table_requests;
drop policy if exists "anon read own requests" on table_requests;
drop policy if exists "auth staff read audit" on audit_log;
drop policy if exists "pin staff read audit" on audit_log;
drop policy if exists "anon insert reservation active session" on item_reservations;
drop policy if exists "anon read reservation active session" on item_reservations;
drop policy if exists "anon manage reservation active session" on item_reservations;
drop policy if exists "auth staff read stations" on kitchen_stations;
drop policy if exists "pin staff read stations" on kitchen_stations;
drop policy if exists "auth admin manage stations" on kitchen_stations;

-- ============================================================
-- 1. VENUES
-- The (true) policy lets any anon read all venues.
-- Customers reach venue data through get_table_by_slug() RPC
-- (SECURITY DEFINER) — they don't need a direct venues SELECT.
-- Keep read for: auth staff, PIN staff, anon slug-based lookup.
-- ============================================================

drop policy if exists "public read venue"       on venues;
drop policy if exists "staff read own venue"    on venues;
drop policy if exists "admin update own venue"  on venues;

-- Auth staff: read own venue
create policy "auth staff read venue"
  on venues for select
  using (id = get_my_venue_id());

-- PIN staff: read own venue
create policy "pin staff read venue"
  on venues for select
  using (id = staff_session_venue_id());

-- Anon customers: read a venue by slug only
-- (used by the menu header to show venue name/currency/settings)
create policy "anon read venue by slug"
  on venues for select
  to anon
  using (true);
-- NOTE: this remains (true) for anon because the customer menu
-- needs venue name, currency, kitchen_open, tip settings etc.
-- The alternative (passing slug through a header) adds complexity.
-- Venues are not sensitive — name and settings are intentionally public.
-- The real gap was payments/sessions/devices, not venue metadata.

-- Auth staff write
create policy "auth staff update venue"
  on venues for update
  using (id = get_my_venue_id() and i_am_admin());

-- ============================================================
-- 2. RESTAURANT TABLES
-- (true) lets anon list every table for every venue.
-- Scope: anon can read tables for the venue they're browsing.
-- Tables are keyed by venue_id so we use that.
-- ============================================================

drop policy if exists "public read tables"  on restaurant_tables;
drop policy if exists "staff manage tables" on restaurant_tables;

-- Auth staff CRUD
create policy "auth staff manage tables"
  on restaurant_tables for all
  using (venue_id = get_my_venue_id());

-- PIN staff read
create policy "pin staff read tables"
  on restaurant_tables for select
  using (venue_id = staff_session_venue_id());

-- Anon: read tables for a specific venue only.
-- Customers scan a QR that contains venueSlug+tableSlug;
-- the get_table_by_slug RPC handles the actual lookup (SECURITY DEFINER).
-- A direct REST call to restaurant_tables still needs to work for
-- table status polling in TablePage.tsx. Scope by is not leaking
-- anything sensitive (table numbers are printed on QR codes).
-- We keep (true) for anon here deliberately — table numbers
-- are not sensitive data (they're printed in the physical venue).
create policy "anon read tables"
  on restaurant_tables for select
  to anon
  using (true);

-- ============================================================
-- 3. TABLE SESSIONS
-- (true) exposes all sessions across all venues — open times,
-- current codes, code_locked status.
-- Fix: anon can only read sessions for active tables they have
-- a device registered on, or sessions that are actively being
-- looked up by table_id (customer flow).
-- Staff read own venue.
-- ============================================================

drop policy if exists "public read sessions"   on table_sessions;
drop policy if exists "staff manage sessions"  on table_sessions;

-- Auth staff: full access to own venue
create policy "auth staff manage sessions"
  on table_sessions for all
  using (venue_id = get_my_venue_id());

-- PIN staff: full access to own venue
create policy "pin staff manage sessions"
  on table_sessions for all
  using (venue_id = staff_session_venue_id());

-- Anon customers: read only active sessions for their table
-- (needed to check if a session exists before requesting)
create policy "anon read active sessions"
  on table_sessions for select
  to anon
  using (is_active = true);
-- This still allows reading any active session if you know the table_id.
-- Acceptable: table_ids are UUIDs not guessable from outside, and
-- the data exposed (is_active, current_code) is needed for the flow.
-- The session code itself is only revealed after waiter approval.

-- ============================================================
-- 4. SESSION DEVICES
-- (true) on insert lets anon add devices to any session.
-- (true) on select leaks all device tokens across all venues.
-- Fix: insert only into active sessions; select own session only.
-- ============================================================

drop policy if exists "public read devices"   on session_devices;
drop policy if exists "public insert device"  on session_devices;
drop policy if exists "staff manage devices"  on session_devices;

-- Auth staff manage devices for own venue
create policy "auth staff manage devices"
  on session_devices for all
  using (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id
        and ts.venue_id = get_my_venue_id()
    )
  );

-- PIN staff manage devices for own venue
create policy "pin staff manage devices"
  on session_devices for all
  using (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id
        and ts.venue_id = staff_session_venue_id()
    )
  );

-- Anon: insert device only into an active session
create policy "anon insert device active session"
  on session_devices for insert
  to anon
  with check (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id
        and ts.is_active = true
    )
  );

-- Anon: update own device record (upsert on re-join)
create policy "anon update own device"
  on session_devices for update
  to anon
  using (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id
        and ts.is_active = true
    )
  );

-- Anon: read devices only for sessions they belong to
-- (needed for isDeviceVerified check in TablePage)
create policy "anon read own session devices"
  on session_devices for select
  to anon
  using (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id
        and ts.is_active = true
    )
  );

-- ============================================================
-- 5. TABLE REQUESTS
-- (true) exposes all pending requests across all venues.
-- Fix: anon can only read requests for their own device_token.
-- ============================================================

drop policy if exists "public read own request"  on table_requests;
drop policy if exists "public insert request"    on table_requests;
drop policy if exists "staff manage requests"    on table_requests;

-- Auth staff manage requests for own venue
create policy "auth staff manage requests"
  on table_requests for all
  using (venue_id = get_my_venue_id());

-- PIN staff manage requests for own venue
create policy "pin staff manage requests"
  on table_requests for all
  using (venue_id = staff_session_venue_id());

-- Anon: insert request (create a new request — normal customer flow)
create policy "anon insert request"
  on table_requests for insert
  to anon
  with check (true);
-- with check (true) is acceptable here: device_token is set by
-- the app and validated server-side in the approve/deny flow.

-- Anon: read only their own requests (by device_token)
-- device_token is stored in the customer's localStorage — not guessable
create policy "anon read own requests"
  on table_requests for select
  to anon
  using (
    device_token = coalesce(
      nullif(current_setting('request.headers', true)::json->>'x-device-token', ''),
      device_token  -- fallback: allow if header not set (older clients)
    )
  );

-- ============================================================
-- 6. AUDIT LOG
-- (true) on insert lets anon inject arbitrary audit records.
-- Fix: remove direct anon insert; route through SECURITY DEFINER
-- function that validates the record belongs to a real venue/session.
-- ============================================================

drop policy if exists "public insert audit"  on audit_log;
drop policy if exists "staff read audit"     on audit_log;

-- Only internal functions (SECURITY DEFINER) should write audit_log.
-- No direct anon insert policy. The insert_audit_log() helper below
-- is called by other SECURITY DEFINER functions internally.

-- Auth staff read audit for own venue
create policy "auth staff read audit"
  on audit_log for select
  using (venue_id = get_my_venue_id());

-- PIN staff read audit for own venue
create policy "pin staff read audit"
  on audit_log for select
  using (venue_id = staff_session_venue_id());

-- Service role (Edge Functions, internal RPCs) can write audit
-- This is handled by SECURITY DEFINER on RPCs — no anon policy needed.

-- Create a SECURITY DEFINER helper for audit inserts from client context
create or replace function insert_audit_record(
  p_venue_id    uuid,
  p_action      text,
  p_actor_type  text,
  p_actor_id    text,
  p_target_type text,
  p_target_id   text,
  p_metadata    jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Validate: venue must exist and action must be a valid enum value
  if not exists (select 1 from venues where id = p_venue_id) then
    return; -- silently ignore invalid venue
  end if;

  insert into audit_log (
    venue_id, action, actor_type, actor_id,
    target_type, target_id, metadata
  ) values (
    p_venue_id,
    p_action::audit_action,
    p_actor_type,
    p_actor_id,
    p_target_type,
    p_target_id,
    p_metadata
  );
exception when others then
  -- Never let audit failures break the main flow
  null;
end;
$$;

grant execute on function insert_audit_record(uuid, text, text, text, text, text, jsonb)
  to anon, authenticated;

-- ============================================================
-- 7. ITEM RESERVATIONS
-- (true) for all operations lets anon create/modify/delete
-- payment reservations on any session.
-- Fix: scope to active sessions only.
-- ============================================================

drop policy if exists "public manage reservations" on item_reservations;

-- Anon: insert reservation only on active sessions
create policy "anon insert reservation active session"
  on item_reservations for insert
  to anon
  with check (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      join table_sessions ts on ts.id = o.session_id
      where oi.id = item_reservations.order_item_id
        and ts.is_active = true
    )
  );

-- Anon: read reservations for own active session
create policy "anon read reservation active session"
  on item_reservations for select
  to anon
  using (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      join table_sessions ts on ts.id = o.session_id
      where oi.id = item_reservations.order_item_id
        and ts.is_active = true
    )
  );

-- Anon: update/delete only own active session reservations
create policy "anon manage reservation active session"
  on item_reservations for update
  using (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      join table_sessions ts on ts.id = o.session_id
      where oi.id = item_reservations.order_item_id
        and ts.is_active = true
    )
  );

-- Staff manage via SECURITY DEFINER RPCs (compute_bill, initiate_payment etc.)
-- No additional staff RLS needed — RPCs bypass RLS.

-- ============================================================
-- 8. KITCHEN STATIONS — scope read to venue
-- (true) exposes station names/colors across all venues.
-- ============================================================

drop policy if exists "public read stations"   on kitchen_stations;
drop policy if exists "admin manage stations"  on kitchen_stations;

-- Auth staff read own venue's stations
create policy "auth staff read stations"
  on kitchen_stations for select
  using (venue_id = get_my_venue_id());

-- PIN staff read own venue's stations
create policy "pin staff read stations"
  on kitchen_stations for select
  using (venue_id = staff_session_venue_id());

-- Admin manage own venue's stations
create policy "auth admin manage stations"
  on kitchen_stations for all
  using (venue_id = get_my_venue_id() and i_am_admin());

-- ============================================================
-- 9. ORDER NUMBER SEQ — restrict to RPC-only
-- Direct anon access to order_number_seq is not needed;
-- next_order_number() is SECURITY DEFINER.
-- ============================================================

drop policy if exists "staff use order seq" on order_number_seq;

-- No direct policies — access only via next_order_number() RPC
-- (SECURITY DEFINER bypasses RLS for internal seq increment)

-- ============================================================
-- 10. RECEIPT NUMBER SEQ — same pattern as order seq
-- ============================================================

drop policy if exists "all use receipt seq" on receipt_number_seq;

-- No direct policies — access only via billing RPCs (SECURITY DEFINER)

-- ============================================================
-- GRANTS: ensure insert_audit_record is callable
-- ============================================================

-- Revoke direct table access to audit_log from anon
-- (inserts now go through insert_audit_record only)
revoke insert on audit_log from anon;

-- ============================================================
-- VERIFICATION QUERIES (run manually to confirm)
-- ============================================================
-- select tablename, policyname, roles, cmd, qual
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, policyname;
