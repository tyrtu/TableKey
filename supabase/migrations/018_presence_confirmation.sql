-- Store waiter-confirmed presence separately from membership and activity.
-- This migration does not change order routing yet.

alter table table_sessions
  add column if not exists presence_confirmed_until timestamptz;

