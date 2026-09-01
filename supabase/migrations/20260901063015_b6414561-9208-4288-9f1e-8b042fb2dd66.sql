create or replace function public.distance_meters(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)
  ))
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;
end $$;

-- trigger/internal-only functions must not be callable by clients
revoke all on function public.handle_new_user() from authenticated;
revoke all on function public.messages_guard() from authenticated;
revoke all on function public.update_updated_at_column() from authenticated;

-- functions the app / RLS policies legitimately call as a signed-in user
grant execute on function public.has_role(uuid, app_role) to authenticated;
grant execute on function public.blocked_between(uuid, uuid) to authenticated;
grant execute on function public.shares_context(uuid, uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.distance_meters(double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.get_nearby_users() to authenticated;
grant execute on function public.send_chat_request(uuid) to authenticated;
grant execute on function public.respond_chat_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_chat_request(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.heartbeat(boolean) to authenticated;
grant execute on function public.update_my_location(double precision, double precision) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_list_users(integer) to authenticated;
grant execute on function public.admin_set_suspended(uuid, boolean) to authenticated;
grant execute on function public.admin_stats() to authenticated;
