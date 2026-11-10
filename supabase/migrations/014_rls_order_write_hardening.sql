-- ============================================================
-- TableKey - Order write RLS hardening
-- Run after 013_rls_payments_help.sql.
--
-- Customer order creation remains anonymous, but records must
-- belong to an active session and the correct venue/table.
-- ============================================================

drop policy if exists "public insert order" on orders;
create policy "customer insert active session order"
  on orders for insert
  with check (
    exists (
      select 1
      from table_sessions ts
      join restaurant_tables rt on rt.id = ts.table_id
      where ts.id = session_id
        and ts.is_active = true
        and ts.venue_id = orders.venue_id
        and ts.table_id = orders.table_id
    )
  );

drop policy if exists "public insert order items" on order_items;
create policy "customer insert active session order items"
  on order_items for insert
  with check (
    exists (
      select 1
      from orders o
      join table_sessions ts on ts.id = o.session_id
      join menu_items mi on mi.id = order_items.item_id
      where o.id = order_items.order_id
        and ts.is_active = true
        and mi.id = order_items.item_id
        and mi.venue_id = o.venue_id
    )
  );

-- Customer reads remain scoped to active sessions by migration 012.
-- Staff policies remain responsible for venue-wide access.
