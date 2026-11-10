-- RLS regression checks.
-- Run with `supabase test db` after applying all migrations.

begin;

select plan(6);

select ok(
  (select relrowsecurity from pg_class where oid = 'orders'::regclass),
  'orders has RLS enabled'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'order_items'::regclass),
  'order_items has RLS enabled'
);

select has_policy(
  'public',
  'orders',
  'customer insert active session order',
  'orders can only be inserted for active sessions'
);

select has_policy(
  'public',
  'order_items',
  'customer insert active session order items',
  'order items can only be inserted for active-session orders'
);

select ok(
  position('is_active' in (
    select qual
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'customer insert active session order'
  )) > 0,
  'order insert policy checks active session'
);

select ok(
  position('is_active' in (
    select qual
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'customer insert active session order items'
  )) > 0,
  'order item insert policy checks active session'
);

select * from finish();
rollback;
