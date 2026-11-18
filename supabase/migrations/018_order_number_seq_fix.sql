-- Migration 018: Fix order_number generation
-- Migration 017 removed policies on order_number_seq and receipt_number_seq,
-- blocking the next_order_number() RPC even though it is SECURITY DEFINER.
-- This restores access and adds a DB-level sequence default as a fallback.

-- ── Restore seq table access ──────────────────────────────────

drop policy if exists "rpc access order seq"   on order_number_seq;
drop policy if exists "rpc access receipt seq" on receipt_number_seq;

create policy "rpc access order seq"
  on order_number_seq for all
  using (true)
  with check (true);

create policy "rpc access receipt seq"
  on receipt_number_seq for all
  using (true)
  with check (true);

-- ── DB-level sequence default for order_number ────────────────
-- Ensures inserts without an explicit order_number still get a valid value.

create sequence if not exists public.orders_order_number_seq;

select setval(
  'public.orders_order_number_seq',
  coalesce(
    (select max(substr(order_number, 2)::bigint)
     from public.orders
     where order_number ~ '^#[0-9]+$'),
    0
  ) + 1,
  false
);

alter table public.orders
  alter column order_number
  set default '#' || lpad(nextval('public.orders_order_number_seq')::text, 3, '0');
