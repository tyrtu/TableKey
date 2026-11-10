-- ============================================================
-- TableKey – Waiter Orders, Kitchen Stations, Help Requests,
--            Menu Modifier Depth
-- Run AFTER 009_planning.sql
-- ============================================================

-- ============================================================
-- SECTION 1: KITCHEN STATIONS
-- ============================================================

create table if not exists kitchen_stations (
  id           uuid primary key default uuid_generate_v4(),
  venue_id     uuid not null references venues(id) on delete cascade,
  name         text not null,                  -- "Kitchen", "Bar", "Grill", "Dessert"
  color        text not null default '#6b7280',
  sort_order   int not null default 0,
  is_default   boolean not null default false, -- one default per venue
  target_prep_min int not null default 15,     -- alert threshold
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (venue_id, name)
);

create index if not exists idx_stations_venue on kitchen_stations(venue_id);

-- Staff station assignments (kitchen staff see only their stations)
create table if not exists staff_station_assignments (
  id         uuid primary key default uuid_generate_v4(),
  staff_id   uuid not null references staff(id) on delete cascade,
  station_id uuid not null references kitchen_stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (staff_id, station_id)
);

-- Category default station
alter table menu_categories
  add column if not exists station_id uuid references kitchen_stations(id) on delete set null;

-- Item station override
alter table menu_items
  add column if not exists station_id uuid references kitchen_stations(id) on delete set null;

-- RLS
alter table kitchen_stations          enable row level security;
alter table staff_station_assignments enable row level security;

create policy "public read stations"
  on kitchen_stations for select using (true);
create policy "admin manage stations"
  on kitchen_stations for all
  using (venue_id = get_my_venue_id() and i_am_admin());

create policy "staff read station assignments"
  on staff_station_assignments for select
  using (
    exists (select 1 from kitchen_stations ks
            where ks.id = station_id and ks.venue_id = get_my_venue_id())
    and i_am_staff()
  );
create policy "admin manage station assignments"
  on staff_station_assignments for all
  using (
    exists (select 1 from kitchen_stations ks
            where ks.id = station_id and ks.venue_id = get_my_venue_id())
    and i_am_admin()
  );

-- Seed default station for demo venue
insert into kitchen_stations (venue_id, name, color, sort_order, is_default)
values ('a1b2c3d4-0000-0000-0000-000000000001', 'Kitchen', '#f59e0b', 1, true)
on conflict (venue_id, name) do nothing;

-- ============================================================
-- SECTION 2: ORDER & ORDER ITEM UPGRADES
-- ============================================================

-- Orders: source + placed_by
create type order_source as enum ('customer', 'waiter');

alter table orders
  add column if not exists source    order_source not null default 'customer',
  add column if not exists placed_by uuid references staff(id);  -- set when source=waiter

-- Order items: station routing, line status, allergy flag
create type line_status as enum ('new', 'preparing', 'ready', 'served', 'voided');

alter table order_items
  add column if not exists station_id   uuid references kitchen_stations(id) on delete set null,
  add column if not exists line_status  line_status not null default 'new',
  add column if not exists allergy_flag boolean not null default false,
  add column if not exists allergy_note text;

create index if not exists idx_order_items_station on order_items(station_id);
create index if not exists idx_order_items_line_status on order_items(line_status)
  where line_status not in ('served', 'voided');

-- ============================================================
-- SECTION 3: MENU MODIFIER DEPTH UPGRADES
-- ============================================================

-- item_options: add min/max selections, availability
alter table item_options
  add column if not exists min_selections int not null default 0,
  add column if not exists max_selections int,  -- null = unlimited
  add column if not exists sort_order     int not null default 0;

-- item_option_choices: add availability toggle and default flag
alter table item_option_choices
  add column if not exists available boolean not null default true,
  add column if not exists is_default boolean not null default false,
  add column if not exists sort_order int not null default 0;

-- ============================================================
-- SECTION 4: HELP REQUESTS
-- ============================================================

create type help_request_type as enum (
  'call_waiter', 'ask_for_bill',
  'order_problem', 'payment_problem', 'other'
);
create type help_request_status as enum (
  'open', 'acknowledged', 'resolved', 'cancelled'
);
create type order_problem_type as enum (
  'wrong_item', 'missing_item', 'cold', 'not_as_expected',
  'taking_too_long', 'other'
);
create type help_resolution as enum (
  'remake', 'comp', 'void', 'no_action'
);

create table if not exists help_requests (
  id              uuid primary key default uuid_generate_v4(),
  venue_id        uuid not null references venues(id) on delete cascade,
  session_id      uuid not null references table_sessions(id) on delete cascade,
  table_id        uuid not null references restaurant_tables(id),
  device_token    text not null,
  request_type    help_request_type not null,
  status          help_request_status not null default 'open',
  -- Order problem fields
  order_id        uuid references orders(id),
  order_item_id   uuid references order_items(id),
  problem_type    order_problem_type,
  note            text,
  -- Assignment & escalation
  assigned_to     uuid references staff(id),
  acknowledged_by uuid references staff(id),
  acknowledged_at timestamptz,
  resolved_by     uuid references staff(id),
  resolved_at     timestamptz,
  -- Resolution (for order problems)
  resolution      help_resolution,
  resolution_note text,
  -- Timing
  created_at      timestamptz not null default now(),
  expires_at      timestamptz default (now() + interval '10 minutes'),
  cancelled_at    timestamptz
);

create index if not exists idx_help_session   on help_requests(session_id);
create index if not exists idx_help_venue      on help_requests(venue_id, created_at desc);
create index if not exists idx_help_open       on help_requests(venue_id, status)
  where status in ('open', 'acknowledged');

-- One open request per type per session
create unique index if not exists idx_help_one_open_per_type
  on help_requests (session_id, request_type)
  where status in ('open', 'acknowledged');

-- RLS
alter table help_requests enable row level security;

create policy "public insert help"
  on help_requests for insert with check (true);
create policy "public read own help"
  on help_requests for select using (true);
create policy "staff manage help"
  on help_requests for all
  using (venue_id = get_my_venue_id() and i_am_staff());

-- Realtime
do $$ begin
  alter publication supabase_realtime add table help_requests;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table kitchen_stations;
exception when duplicate_object then null; end $$;

-- ============================================================
-- SECTION 5: WAITER-MANAGED SESSION FLAG
-- ============================================================

alter table table_sessions
  add column if not exists waiter_managed boolean not null default false;

-- ============================================================
-- SECTION 6: AUDIT ACTION ADDITIONS
-- ============================================================

alter type audit_action add value if not exists 'table_opened_by_waiter';
alter type audit_action add value if not exists 'waiter_order_placed';
alter type audit_action add value if not exists 'line_status_changed';
alter type audit_action add value if not exists 'help_request_created';
alter type audit_action add value if not exists 'help_request_acknowledged';
alter type audit_action add value if not exists 'help_request_resolved';
alter type audit_action add value if not exists 'station_created';
alter type audit_action add value if not exists 'station_rerouted';

-- ============================================================
-- SECTION 7: RPC — open_table_as_waiter
-- Creates a session directly without a customer request.
-- Resolves any pending request into the session if one exists.
-- Blocks if a live session already exists (waiter must use that).
-- ============================================================

create or replace function open_table_as_waiter(
  p_table_id   uuid,
  p_staff_id   uuid,
  p_code_length int default 4
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_table    record;
  v_existing record;
  v_code     text;
  v_expires  timestamptz;
  v_session  record;
begin
  select * into v_table from restaurant_tables where id = p_table_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Table not found');
  end if;

  -- Must be waiter/manager/owner of this venue
  if not exists (
    select 1 from staff
    where id = p_staff_id
      and venue_id = v_table.venue_id
      and role in ('owner','admin','manager','waiter')
      and active = true
      and on_duty = true
  ) then
    return jsonb_build_object('success', false, 'message', 'You must be on duty to open a table');
  end if;

  -- Check for existing live session
  select * into v_existing from table_sessions
  where table_id = p_table_id and is_active = true limit 1;

  if found then
    return jsonb_build_object(
      'success', false,
      'message', 'Table already has an active session',
      'session_id', v_existing.id
    );
  end if;

  -- Generate code
  v_code    := lpad(floor(random() * power(10, p_code_length))::int::text, p_code_length, '0');
  v_expires := now() + interval '60 seconds';

  -- Create session
  insert into table_sessions (
    venue_id, table_id, opened_by, current_code, code_expires_at,
    is_active, waiter_managed, last_activity
  )
  select v_table.venue_id, p_table_id, p_staff_id, v_code, v_expires,
         true, true, now()
  returning * into v_session;

  -- Update table status
  update restaurant_tables set status = 'active' where id = p_table_id;

  -- Resolve any pending request for this table into the session
  update table_requests
  set status = 'approved',
      handled_by = p_staff_id,
      handled_at = now(),
      session_id = v_session.id
  where table_id = p_table_id and status = 'pending';

  -- Audit
  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
  values (v_table.venue_id, 'table_opened_by_waiter', 'waiter',
          p_staff_id::text, 'session', v_session.id::text);

  return jsonb_build_object(
    'success',    true,
    'session_id', v_session.id,
    'code',       v_code
  );
end;
$$;

-- ============================================================
-- SECTION 8: RPC — place_waiter_order
-- Same rules as placeOrder but skips device/code checks.
-- Atomically assigns station_id from item or category default.
-- ============================================================

create or replace function place_waiter_order(
  p_session_id      uuid,
  p_staff_id        uuid,
  p_items           jsonb,   -- [{item_id, quantity, notes, options, allergy_flag}]
  p_notes           text,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session   record;
  v_staff     record;
  v_order     record;
  v_order_num text;
  v_subtotal  numeric(10,2) := 0;
  v_item      record;
  v_menu_item record;
  v_station_id uuid;
  v_line_total numeric(10,2);
  v_el        jsonb;
begin
  -- Auth check
  select * into v_staff from staff
  where id = p_staff_id and active = true;
  if not found or v_staff.role not in ('owner','admin','manager','waiter') then
    return jsonb_build_object('success', false, 'message', 'Not authorized to place orders');
  end if;

  select * into v_session from table_sessions
  where id = p_session_id and is_active = true;
  if not found then
    return jsonb_build_object('success', false, 'message', 'No active session for this table');
  end if;

  if v_staff.venue_id != v_session.venue_id then
    return jsonb_build_object('success', false, 'message', 'Session belongs to a different venue');
  end if;

  -- Idempotency
  select * into v_order from orders where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('success', true, 'order_id', v_order.id,
                              'order_number', v_order.order_number, 'already_exists', true);
  end if;

  -- Calculate subtotal and validate items
  for v_el in select * from jsonb_array_elements(p_items) loop
    select * into v_menu_item from menu_items
    where id = (v_el->>'item_id')::uuid and venue_id = v_session.venue_id;

    if not found then
      return jsonb_build_object('success', false,
        'message', 'Item not found: ' || (v_el->>'item_id'));
    end if;
    if not v_menu_item.available then
      return jsonb_build_object('success', false,
        'message', v_menu_item.name || ' is not available');
    end if;

    v_line_total := v_menu_item.price * (v_el->>'quantity')::int
                  + coalesce((v_el->>'options_delta')::numeric, 0)
                    * (v_el->>'quantity')::int;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  -- Generate order number
  v_order_num := next_order_number(v_session.venue_id);

  -- Insert order
  insert into orders (
    venue_id, table_id, session_id, device_token,
    order_number, status, notes, subtotal, idempotency_key,
    source, placed_by
  ) values (
    v_session.venue_id, v_session.table_id, p_session_id,
    'staff:' || p_staff_id::text,
    v_order_num, 'new', p_notes, v_subtotal, p_idempotency_key,
    'waiter', p_staff_id
  ) returning * into v_order;

  -- Insert order items with station routing
  for v_el in select * from jsonb_array_elements(p_items) loop
    select * into v_menu_item from menu_items
    where id = (v_el->>'item_id')::uuid;

    v_line_total := v_menu_item.price * (v_el->>'quantity')::int
                  + coalesce((v_el->>'options_delta')::numeric, 0)
                    * (v_el->>'quantity')::int;

    -- Station: item override → category default → venue default
    v_station_id := coalesce(
      v_menu_item.station_id,
      (select station_id from menu_categories where id = v_menu_item.category_id),
      (select id from kitchen_stations
       where venue_id = v_session.venue_id and is_default = true limit 1)
    );

    insert into order_items (
      order_id, item_id, item_name, item_price, quantity,
      notes, options, line_total,
      station_id, allergy_flag, allergy_note, line_status
    ) values (
      v_order.id,
      (v_el->>'item_id')::uuid,
      v_menu_item.name,
      v_menu_item.price,
      (v_el->>'quantity')::int,
      v_el->>'notes',
      case when v_el->'options' is not null then v_el->'options' else null end,
      v_line_total,
      v_station_id,
      coalesce((v_el->>'allergy_flag')::boolean, false),
      v_el->>'allergy_note',
      'new'
    );
  end loop;

  -- Touch session activity
  update table_sessions set last_activity = now(), waiter_managed = false
  where id = p_session_id;

  -- Audit
  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_session.venue_id, 'waiter_order_placed', 'waiter', p_staff_id::text,
          'order', v_order.id::text,
          jsonb_build_object('order_number', v_order_num, 'subtotal', v_subtotal));

  return jsonb_build_object(
    'success',      true,
    'order_id',     v_order.id,
    'order_number', v_order_num,
    'subtotal',     v_subtotal
  );
end;
$$;

-- ============================================================
-- SECTION 9: RPC — acknowledge_help_request
-- ============================================================

create or replace function acknowledge_help_request(
  p_request_id uuid,
  p_staff_id   uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_req record;
begin
  select * into v_req from help_requests where id = p_request_id and status = 'open';
  if not found then return; end if;

  update help_requests
  set status = 'acknowledged', acknowledged_by = p_staff_id, acknowledged_at = now()
  where id = p_request_id;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id)
  values (v_req.venue_id, 'help_request_acknowledged', 'waiter',
          p_staff_id::text, 'help_request', p_request_id::text);
end;
$$;

create or replace function resolve_help_request(
  p_request_id     uuid,
  p_staff_id       uuid,
  p_resolution     help_resolution default null,
  p_resolution_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_req record;
begin
  select * into v_req from help_requests
  where id = p_request_id and status in ('open','acknowledged');
  if not found then return; end if;

  update help_requests
  set status = 'resolved', resolved_by = p_staff_id, resolved_at = now(),
      resolution = p_resolution, resolution_note = p_resolution_note
  where id = p_request_id;

  insert into audit_log (venue_id, action, actor_type, actor_id, target_type, target_id, metadata)
  values (v_req.venue_id, 'help_request_resolved', 'waiter',
          p_staff_id::text, 'help_request', p_request_id::text,
          jsonb_build_object('resolution', p_resolution));
end;
$$;
