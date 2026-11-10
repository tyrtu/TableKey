-- ============================================================
-- TableKey – Session Timeout Automation
-- Uses pg_cron to run every 2 minutes.
-- pg_cron must be enabled in Supabase: Database → Extensions → pg_cron
-- ============================================================

-- ============================================================
-- SECTION 1: CORE TIMEOUT FUNCTION
-- Runs periodically. Closes or parks stale sessions,
-- expires stale requests, cancels expired help requests.
-- ============================================================

create or replace function run_session_timeouts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed   int := 0;
  v_parked   int := 0;
  v_requests int := 0;
  v_help     int := 0;
  v_sess     record;
  v_venue    record;
  v_bill     jsonb;
  v_outstanding numeric;
begin

  -- ── 1. Expire stale table requests ────────────────────────
  update table_requests
  set status = 'expired'
  where status = 'pending'
    and (
      expires_at is not null and expires_at < now()
      or (expires_at is null and requested_at < now() - interval '10 minutes')
    );

  get diagnostics v_requests = row_count;

  -- ── 1b. Escalate table requests ───────────────────────────
  -- Mark requests as escalated after venue.request_escalate_min
  update table_requests tr
  set escalated_at = now()
  from venues v
  where tr.venue_id = v.id
    and tr.status = 'pending'
    and tr.escalated_at is null
    and tr.requested_at < now() - (v.request_escalate_min * interval '1 minute');

  -- ── 2. Cancel expired help requests ───────────────────────
  update help_requests
  set status = 'cancelled', cancelled_at = now()
  where status = 'open'
    and expires_at is not null
    and expires_at < now();

  get diagnostics v_help = row_count;

  -- ── 3. Process idle sessions ───────────────────────────────
  -- For each venue, find sessions that have been idle longer
  -- than the venue's session_idle_timeout_min setting.

  for v_sess in
    select ts.id            as session_id,
           ts.table_id,
           ts.venue_id,
           ts.last_activity,
           ts.opened_at,
           v.session_idle_timeout_min,
           v.close_override_requires_manager
    from table_sessions ts
    join venues v on v.id = ts.venue_id
    where ts.is_active = true
      and ts.last_activity < now() - (v.session_idle_timeout_min * interval '1 minute')
  loop

    select * into v_venue from venues where id = v_sess.venue_id;

    -- Cannot close/park while a payment is in flight
    if exists (
      select 1 from payments_v2
      where session_id = v_sess.session_id
        and state in ('pending','processing')
    ) then
      continue;
    end if;

    -- Compute outstanding balance
    begin
      v_bill := compute_bill(v_sess.session_id);
      v_outstanding := (v_bill->>'outstanding')::numeric;
    exception when others then
      v_outstanding := 0;
    end;

    if v_outstanding <= 0 then
      -- ── Settled: close cleanly ──────────────────────────────
      update table_sessions
      set is_active = false,
          closed_at = now(),
          current_code = null
      where id = v_sess.session_id;

      update restaurant_tables
      set status = 'idle'
      where id = v_sess.table_id;

      -- Invalidate devices
      update session_devices
      set is_active = false, revoked_at = now()
      where session_id = v_sess.session_id and is_active = true;

      insert into audit_log (
        venue_id, action, actor_type, actor_id, target_type, target_id, metadata
      ) values (
        v_sess.venue_id, 'session_closed', 'system', 'timeout_job',
        'session', v_sess.session_id::text,
        jsonb_build_object('reason', 'idle_timeout', 'idle_min', v_sess.session_idle_timeout_min)
      );

      v_closed := v_closed + 1;

    else
      -- ── Unpaid: park the session ────────────────────────────
      update table_sessions
      set is_active = false,
          closed_at = now(),
          parked_at = now(),
          park_reason = 'idle_timeout',
          current_code = null
      where id = v_sess.session_id;

      update restaurant_tables
      set status = 'idle'
      where id = v_sess.table_id;

      -- Invalidate devices
      update session_devices
      set is_active = false, revoked_at = now()
      where session_id = v_sess.session_id and is_active = true;

      -- Release any item reservations
      delete from item_reservations where session_id = v_sess.session_id;
      update order_items set payment_status = 'unpaid'
      where id in (
        select oi.id from order_items oi
        join orders o on o.id = oi.order_id
        where o.session_id = v_sess.session_id
          and oi.payment_status = 'reserved'
      );

      insert into audit_log (
        venue_id, action, actor_type, actor_id, target_type, target_id, metadata
      ) values (
        v_sess.venue_id, 'session_parked', 'system', 'timeout_job',
        'session', v_sess.session_id::text,
        jsonb_build_object(
          'reason', 'idle_timeout',
          'outstanding', v_outstanding,
          'idle_min', v_sess.session_idle_timeout_min
        )
      );

      v_parked := v_parked + 1;
    end if;

  end loop;

  return jsonb_build_object(
    'sessions_closed',   v_closed,
    'sessions_parked',   v_parked,
    'requests_expired',  v_requests,
    'help_cancelled',    v_help,
    'ran_at',            now()
  );
end;
$$;

-- ============================================================
-- SECTION 2: SCHEDULE WITH pg_cron (every 2 minutes)
-- NOTE: pg_cron must be enabled first.
-- Go to Supabase Dashboard → Database → Extensions → search "pg_cron" → Enable
-- Then run this section separately.
-- ============================================================

-- Uncomment after enabling pg_cron:
-- select cron.schedule(
--   'tablekey-session-timeouts',   -- job name (unique)
--   '*/2 * * * *',                 -- every 2 minutes
--   $$select run_session_timeouts()$$
-- );

-- To check scheduled jobs:
-- select * from cron.job;

-- To remove the job:
-- select cron.unschedule('tablekey-session-timeouts');

-- ============================================================
-- SECTION 3: MANUAL TRIGGER ENDPOINT
-- Call this RPC from the app as a fallback when pg_cron
-- is not available (e.g. free Supabase plan).
-- ============================================================

-- The function run_session_timeouts() is already public and
-- can be called manually via:
--   supabase.rpc('run_session_timeouts')
-- or from an Edge Function on a cron schedule.

-- ============================================================
-- SECTION 4: EDGE FUNCTION ALTERNATIVE
-- If pg_cron is unavailable, deploy this as a Supabase Edge
-- Function and schedule it via Supabase Dashboard.
--
-- supabase/functions/session-timeout/index.ts:
--
-- import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
-- Deno.serve(async () => {
--   const sb = createClient(
--     Deno.env.get('SUPABASE_URL')!,
--     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
--   )
--   const { data, error } = await sb.rpc('run_session_timeouts')
--   if (error) return new Response(JSON.stringify({ error }), { status: 500 })
--   return new Response(JSON.stringify(data), { status: 200 })
-- })
-- ============================================================
