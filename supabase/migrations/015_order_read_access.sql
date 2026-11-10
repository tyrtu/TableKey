-- TableKey - Customer order read access
--
-- Keep customer reads limited to orders belonging to an active table
-- session, while allowing PIN staff reads through the existing venue
-- policies. Explicit grants are required when project-level default
-- privileges have been changed.

grant usage on schema public to anon, authenticated;
grant select on public.orders to anon, authenticated;
grant select on public.order_items to anon, authenticated;
grant select on public.table_sessions to anon, authenticated;
grant execute on function public.get_my_venue_id() to anon, authenticated;
grant execute on function public.staff_session_venue_id() to anon, authenticated;

-- Return customer order status through a controlled RPC instead of a
-- nested anonymous REST select on orders and order_items.
create or replace function public.get_customer_orders(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(o) || jsonb_build_object(
        'items',
        coalesce(
          (
            select jsonb_agg(to_jsonb(oi) order by oi.id)
            from public.order_items oi
            where oi.order_id = o.id
          ),
          '[]'::jsonb
        )
      )
      order by o.placed_at
    ),
    '[]'::jsonb
  )
  from public.orders o
  where o.session_id = p_session_id
    and exists (
      select 1
      from public.table_sessions ts
      where ts.id = p_session_id
        and ts.is_active = true
    );
$$;

revoke all on function public.get_customer_orders(uuid) from public;
grant execute on function public.get_customer_orders(uuid) to anon, authenticated;

drop policy if exists "session read orders" on public.orders;
create policy "session read orders"
  on public.orders for select
  to anon, authenticated
  using (
    venue_id = get_my_venue_id()
    or exists (
      select 1
      from public.table_sessions ts
      where ts.id = orders.session_id
        and ts.is_active = true
    )
  );

drop policy if exists "session read order items" on public.order_items;
create policy "session read order items"
  on public.order_items for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.table_sessions ts on ts.id = o.session_id
      where o.id = order_items.order_id
        and (
          o.venue_id = get_my_venue_id()
          or ts.is_active = true
        )
    )
  );
