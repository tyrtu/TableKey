-- ============================================================
-- TableKey – Venue-Scoped RLS for payments_v2 & help_requests
-- Run AFTER 012_security_hardening.sql
-- ============================================================

-- ============================================================
-- SECTION 1: payments_v2
-- Previously "public read own payments_v2" used (true) — any
-- anon token could read payments from any venue.
-- ============================================================

drop policy if exists "public insert payment_v2"        on payments_v2;
drop policy if exists "public read own payments_v2"     on payments_v2;
drop policy if exists "staff manage payments_v2"        on payments_v2;
drop policy if exists "pin read payments"               on payments_v2;
drop policy if exists "pin insert payment"              on payments_v2;

-- Customers can insert a payment for an active session
create policy "customer insert payment"
  on payments_v2 for insert
  with check (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id
        and ts.is_active = true
    )
  );

-- Customers can read payments for their own active session only
create policy "customer read own session payments"
  on payments_v2 for select
  using (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id
        and ts.is_active = true
    )
    -- also allow reading parked sessions (for receipt display)
    or exists (
      select 1 from table_sessions ts
      where ts.id = session_id
        and ts.is_active = false
        and ts.parked_at is not null
        and ts.opened_at > now() - interval '24 hours'
    )
  );

-- Staff can read and manage all payments for their venue
create policy "staff read venue payments"
  on payments_v2 for select
  using (venue_id = get_my_venue_id() and i_am_staff());

create policy "staff manage venue payments"
  on payments_v2 for all
  using (venue_id = get_my_venue_id() and i_am_staff());

-- ============================================================
-- SECTION 2: payment_items
-- Previously "public read payment_items" used (true).
-- ============================================================

drop policy if exists "public insert payment_items"  on payment_items;
drop policy if exists "public read payment_items"    on payment_items;
drop policy if exists "staff manage payment_items"   on payment_items;

create policy "customer insert payment_items"
  on payment_items for insert
  with check (
    exists (
      select 1 from payments_v2 p
      join table_sessions ts on ts.id = p.session_id
      where p.id = payment_id
        and ts.is_active = true
    )
  );

create policy "customer read own payment_items"
  on payment_items for select
  using (
    exists (
      select 1 from payments_v2 p
      join table_sessions ts on ts.id = p.session_id
      where p.id = payment_id
        and ts.is_active = true
    )
  );

create policy "staff manage payment_items"
  on payment_items for all
  using (
    exists (
      select 1 from payments_v2 p
      where p.id = payment_id
        and p.venue_id = get_my_venue_id()
    ) and i_am_staff()
  );

-- ============================================================
-- SECTION 3: help_requests
-- Previously "public read own help" used (true).
-- Customers should only see requests from their own session.
-- ============================================================

drop policy if exists "public insert help"   on help_requests;
drop policy if exists "public read own help" on help_requests;
drop policy if exists "staff manage help"    on help_requests;

-- Customers can insert for active sessions
create policy "customer insert help"
  on help_requests for insert
  with check (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id and ts.is_active = true
    )
  );

-- Customers can read/cancel their own session's requests
create policy "customer read own session help"
  on help_requests for select
  using (
    exists (
      select 1 from table_sessions ts
      where ts.id = session_id and ts.is_active = true
    )
  );

-- Customers can update (cancel) their own open requests
create policy "customer cancel own help"
  on help_requests for update
  using (
    status = 'open'
    and exists (
      select 1 from table_sessions ts
      where ts.id = session_id and ts.is_active = true
    )
  );

-- Staff can read and manage all help requests for their venue
create policy "staff read venue help"
  on help_requests for select
  using (venue_id = get_my_venue_id() and i_am_staff());

create policy "staff manage venue help"
  on help_requests for all
  using (venue_id = get_my_venue_id() and i_am_staff());

-- ============================================================
-- SECTION 4: receipts
-- Previously "public read receipts" used (true).
-- ============================================================

drop policy if exists "public read receipts"  on receipts;
drop policy if exists "staff insert receipts" on receipts;

-- Customers can read receipts for payments from their session
create policy "customer read own receipts"
  on receipts for select
  using (
    exists (
      select 1 from payments_v2 p
      join table_sessions ts on ts.id = p.session_id
      where p.id = payment_id
        and (
          ts.is_active = true
          or ts.opened_at > now() - interval '24 hours'
        )
    )
  );

-- Staff can read receipts for their venue
create policy "staff read venue receipts"
  on receipts for select
  using (venue_id = get_my_venue_id() and i_am_staff());

create policy "staff insert receipts"
  on receipts for insert
  with check (venue_id = get_my_venue_id() and i_am_staff());
