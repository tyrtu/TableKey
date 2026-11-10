-- ============================================================
-- TableKey – Staff auto-link trigger
-- When someone signs up via the invite page, this trigger
-- automatically links their new auth account to the matching
-- staff record (matched by email). No manual SQL needed.
-- ============================================================

-- Function that runs after a new auth user is created
create or replace function link_staff_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Link the new auth user to an existing staff record by email
  update staff
  set
    user_id   = new.id,
    joined_at = now()
  where email = lower(new.email)
    and user_id is null
    and active = true;

  return new;
end;
$$;

-- Attach it to the auth.users table
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function link_staff_on_signup();

-- ── Seed demo staff (without user_id — they'll self-register) ──
-- These records exist so that when someone signs up with these
-- emails, they're automatically linked to the right role.

insert into staff (venue_id, email, name, role, active) values
  ('a1b2c3d4-0000-0000-0000-000000000001', 'admin@demo.com',  'Demo Admin',  'admin',  true),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'waiter@demo.com', 'Demo Waiter', 'waiter', true),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'kitchen@demo.com','Demo Kitchen','kitchen',true)
on conflict (venue_id, email) do nothing;
