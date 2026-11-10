-- Allow RLS policies to resolve PIN staff sessions without granting
-- direct access to staff_sessions.
--
-- staff_sessions is intentionally inaccessible to client roles. These
-- helpers are security definer functions and return only the staff
-- identity needed by policy predicates.

alter function public.staff_session_staff_id()
  security definer
  set search_path = public;

alter function public.staff_session_venue_id()
  security definer
  set search_path = public;

alter function public.staff_session_role()
  security definer
  set search_path = public;

grant execute on function public.staff_session_staff_id() to anon, authenticated;
grant execute on function public.staff_session_venue_id() to anon, authenticated;
grant execute on function public.staff_session_role() to anon, authenticated;

