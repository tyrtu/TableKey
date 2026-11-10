-- Require waiter-confirmed presence before customer orders enter the kitchen.
-- Waiter-entered orders remain available even when the confirmation window expires.

create or replace function public.require_customer_presence_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_presence_until timestamptz;
begin
  v_source := coalesce(NEW.source::text, 'customer');
  if v_source <> 'customer' then
    return NEW;
  end if;

  select presence_confirmed_until
    into v_presence_until
  from public.table_sessions
  where id = NEW.session_id
    and is_active = true;

  if v_presence_until is null or v_presence_until <= now() then
    raise exception 'PRESENCE_CONFIRMATION_REQUIRED'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists require_customer_presence_before_order on public.orders;
create trigger require_customer_presence_before_order
  before insert on public.orders
  for each row
  execute function public.require_customer_presence_for_order();

