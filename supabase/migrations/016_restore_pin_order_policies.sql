-- Migration 016: Restore PIN staff order read policies
--
-- Migration 015 dropped and recreated "session read orders" and
-- "session read order items" but did not include a PIN session branch.
-- This overwrote the "pin read orders" / "pin read order items" policies
-- originally created in 005, breaking order reads for PIN-authenticated
-- staff (kitchen tablets, shared waiter phones).
--
-- This migration restores those policies.

-- Orders: PIN staff can read all orders for their venue
drop policy if exists "pin read orders" on orders;
create policy "pin read orders"
  on orders for select
  using (venue_id = staff_session_venue_id());

-- Order items: PIN staff can read items for orders in their venue
drop policy if exists "pin read order items" on order_items;
create policy "pin read order items"
  on order_items for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_id
        and o.venue_id = staff_session_venue_id()
    )
  );
