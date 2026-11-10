-- ============================================================
-- TableKey – Owner Planning & Analytics
-- ============================================================

-- ── Sales targets ─────────────────────────────────────────────
create table if not exists sales_targets (
  id         uuid primary key default uuid_generate_v4(),
  venue_id   uuid not null references venues(id) on delete cascade,
  period     text not null check (period in ('daily','weekly','monthly')),
  amount     numeric(12,2) not null,
  starts_on  date not null,
  created_at timestamptz not null default now(),
  unique (venue_id, period, starts_on)
);
alter table sales_targets enable row level security;
create policy "owner manage targets" on sales_targets for all
  using (venue_id = get_my_venue_id() and i_am_admin());

-- ── Expense categories ────────────────────────────────────────
create table if not exists expense_categories (
  id       uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references venues(id) on delete cascade,
  name     text not null,
  color    text default '#6b7280',
  sort_order int not null default 0,
  unique (venue_id, name)
);
alter table expense_categories enable row level security;
create policy "owner manage expense cats" on expense_categories for all
  using (venue_id = get_my_venue_id() and i_am_admin());

-- ── Expenses ──────────────────────────────────────────────────
create table if not exists expenses (
  id           uuid primary key default uuid_generate_v4(),
  venue_id     uuid not null references venues(id) on delete cascade,
  category_id  uuid references expense_categories(id) on delete set null,
  description  text not null,
  amount       numeric(12,2) not null,
  is_recurring boolean not null default false,
  recur_period text check (recur_period in ('weekly','monthly','annually')),
  expense_date date not null,
  budget       numeric(12,2),  -- monthly budget for this line
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table expenses enable row level security;
create policy "owner manage expenses" on expenses for all
  using (venue_id = get_my_venue_id() and i_am_admin());
create index if not exists idx_expenses_venue on expenses(venue_id, expense_date desc);

-- ── Item costs (for margin calculation) ──────────────────────
create table if not exists item_costs (
  id         uuid primary key default uuid_generate_v4(),
  venue_id   uuid not null references venues(id) on delete cascade,
  item_id    uuid not null references menu_items(id) on delete cascade unique,
  cost       numeric(10,2) not null,
  updated_at timestamptz not null default now()
);
alter table item_costs enable row level security;
create policy "owner manage item costs" on item_costs for all
  using (venue_id = get_my_venue_id() and i_am_admin());

-- ── Seed default expense categories for demo venue ────────────
insert into expense_categories (venue_id, name, color, sort_order)
values
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Rent',        '#3b82f6', 1),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Salaries',    '#8b5cf6', 2),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Utilities',   '#f59e0b', 3),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Supplies',    '#10b981', 4),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Marketing',   '#ec4899', 5),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Other',       '#6b7280', 6)
on conflict do nothing;
