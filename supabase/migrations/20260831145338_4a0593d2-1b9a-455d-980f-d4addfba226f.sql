
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin','moderator','user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending','accepted','rejected','cancelled','blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open','reviewing','resolved','dismissed');
exception when duplicate_object then null; end $$;

create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'New user',
  email text,
  avatar_url text,
  latitude double precision,
  longitude double precision,
  location_updated_at timestamptz,
  online boolean not null default false,
  last_seen timestamptz not null default now(),
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint full_name_len check (char_length(full_name) between 1 and 60)
);

create index if not exists profiles_geo_idx on public.profiles (latitude, longitude);
create index if not exists profiles_last_seen_idx on public.profiles (last_seen desc);

revoke all on public.profiles from authenticated, anon;
grant select (id, full_name, avatar_url, online, last_seen, location_updated_at, suspended, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);
grant select, insert, delete on public.blocks to authenticated;
grant all on public.blocks to service_role;
alter table public.blocks enable row level security;

create policy "manage own blocks" on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy "create own blocks" on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy "delete own blocks" on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

create or replace function public.blocked_between(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = _a and blocked_id = _b) or (blocker_id = _b and blocked_id = _a)
  )
$$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conv_members_user_idx on public.conversation_members (user_id);
grant select, update on public.conversation_members to authenticated;
grant all on public.conversation_members to service_role;
alter table public.conversation_members enable row level security;

create or replace function public.is_conversation_member(_conv uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = _conv and user_id = _user)
$$;

create policy "members read conversations" on public.conversations for select to authenticated
  using (public.is_conversation_member(id, auth.uid()));

create policy "members read membership" on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
create policy "update own membership" on public.conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint content_len check (char_length(btrim(content)) between 1 and 2000)
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at desc);
grant select, insert, update on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;

create policy "members read messages" on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
create policy "members send messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
create policy "recipients mark read" on public.messages for update to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()) and sender_id <> auth.uid())
  with check (public.is_conversation_member(conversation_id, auth.uid()));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  related_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);
grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "update own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own notifications" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.messages_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare recent int; other uuid; sender_name text;
begin
  new.content := btrim(new.content);
  select count(*) into recent from public.messages
    where sender_id = new.sender_id and created_at > now() - interval '10 seconds';
  if recent >= 12 then
    raise exception 'You are sending messages too quickly. Please slow down.';
  end if;
  select user_id into other from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id limit 1;
  if other is not null and public.blocked_between(new.sender_id, other) then
    raise exception 'This conversation is no longer available.';
  end if;
  update public.conversations set updated_at = now() where id = new.conversation_id;
  if other is not null then
    select full_name into sender_name from public.profiles where id = new.sender_id;
    insert into public.notifications (user_id, type, title, message, related_id)
    values (other, 'message', coalesce(sender_name,'Someone'), left(new.content, 80), new.conversation_id);
  end if;
  return new;
end $$;

create trigger messages_guard_trg before insert on public.messages
  for each row execute function public.messages_guard();

create table if not exists public.chat_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status public.request_status not null default 'pending',
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_self_request check (sender_id <> receiver_id)
);
create unique index if not exists chat_requests_pending_uniq
  on public.chat_requests (sender_id, receiver_id) where status = 'pending';
create index if not exists chat_requests_receiver_idx on public.chat_requests (receiver_id, status);
create index if not exists chat_requests_sender_idx on public.chat_requests (sender_id, status);
grant select on public.chat_requests to authenticated;
grant all on public.chat_requests to service_role;
alter table public.chat_requests enable row level security;

create policy "read own requests" on public.chat_requests for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create trigger chat_requests_updated before update on public.chat_requests
  for each row execute function public.update_updated_at_column();

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  description text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_self_report check (reporter_id <> reported_user_id),
  constraint reason_valid check (reason in ('spam','harassment','inappropriate','fake_profile','other')),
  constraint description_len check (description is null or char_length(description) <= 1000)
);
grant select, insert, update on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;

create policy "read own or admin reports" on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "create own reports" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "admins update reports" on public.reports for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create trigger reports_updated before update on public.reports
  for each row execute function public.update_updated_at_column();

create or replace function public.shares_context(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_requests
    where (sender_id = _a and receiver_id = _b) or (sender_id = _b and receiver_id = _a)
  ) or exists (
    select 1 from public.conversation_members m1
    join public.conversation_members m2 on m1.conversation_id = m2.conversation_id
    where m1.user_id = _a and m2.user_id = _b
  ) or exists (
    select 1 from public.reports where reporter_id = _a and reported_user_id = _b
  )
$$;

create policy "read self and related profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'admin') or public.shares_context(auth.uid(), id));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid() and suspended = false) with check (id = auth.uid());

create trigger profiles_updated before update on public.profiles
  for each row execute function public.update_updated_at_column();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''), split_part(new.email,'@',1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.update_my_location(_lat double precision, _lng double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if _lat is null or _lng is null or _lat < -90 or _lat > 90 or _lng < -180 or _lng > 180 then
    raise exception 'Invalid coordinates';
  end if;
  update public.profiles
     set latitude = _lat, longitude = _lng, location_updated_at = now(),
         online = true, last_seen = now()
   where id = auth.uid();
end $$;

create or replace function public.heartbeat(_online boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set online = _online, last_seen = now() where id = auth.uid();
end $$;

create or replace function public.distance_meters(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)
  ))
$$;

create or replace function public.get_nearby_users()
returns table (id uuid, full_name text, avatar_url text, distance_meters int, online boolean, last_seen timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare me record;
begin
  select p.id as pid, p.latitude as lat, p.longitude as lng, p.location_updated_at as lua
    into me from public.profiles p where p.id = auth.uid();
  if me.pid is null then raise exception 'Not authenticated'; end if;
  if me.lat is null or me.lua < now() - interval '30 minutes' then
    return;
  end if;
  return query
  select p.id, p.full_name, p.avatar_url,
         public.distance_meters(me.lat, me.lng, p.latitude, p.longitude)::int,
         (p.online and p.last_seen > now() - interval '2 minutes'),
         p.last_seen
    from public.profiles p
   where p.id <> me.pid
     and p.suspended = false
     and p.latitude is not null
     and p.location_updated_at > now() - interval '15 minutes'
     and p.last_seen > now() - interval '10 minutes'
     and p.latitude between me.lat - 0.01 and me.lat + 0.01
     and p.longitude between me.lng - 0.02 and me.lng + 0.02
     and public.distance_meters(me.lat, me.lng, p.latitude, p.longitude) <= 1000
     and not public.blocked_between(me.pid, p.id)
   order by 4 asc
   limit 100;
end $$;

create or replace function public.send_chat_request(_receiver uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); recent int; dist int; req_id uuid; my_name text; existing_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if me = _receiver then raise exception 'You cannot send a request to yourself'; end if;
  if public.blocked_between(me, _receiver) then raise exception 'This user is unavailable'; end if;
  if exists (select 1 from public.profiles where id = me and suspended) then raise exception 'Account suspended'; end if;

  select count(*) into recent from public.chat_requests
    where sender_id = me and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'Too many chat requests. Please try again later.'; end if;

  select count(*) into recent from public.chat_requests
    where sender_id = me and receiver_id = _receiver and created_at > now() - interval '24 hours';
  if recent >= 3 then raise exception 'You have already contacted this person recently.'; end if;

  select n.distance_meters into dist from public.get_nearby_users() n where n.id = _receiver;
  if dist is null then raise exception 'This person is no longer within 1 km'; end if;

  select id into existing_id from public.chat_requests
    where sender_id = me and receiver_id = _receiver and status = 'pending';
  if existing_id is not null then return existing_id; end if;

  insert into public.chat_requests (sender_id, receiver_id) values (me, _receiver) returning id into req_id;
  select full_name into my_name from public.profiles where id = me;
  insert into public.notifications (user_id, type, title, message, related_id)
  values (_receiver, 'request', 'New chat request', coalesce(my_name,'Someone') || ' wants to chat with you.', req_id);
  return req_id;
end $$;

create or replace function public.respond_chat_request(_request uuid, _accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r record; conv uuid; my_name text;
begin
  select * into r from public.chat_requests where id = _request;
  if r.id is null or r.receiver_id <> me then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request is no longer pending'; end if;
  select full_name into my_name from public.profiles where id = me;

  if not _accept then
    update public.chat_requests set status = 'rejected' where id = _request;
    insert into public.notifications (user_id, type, title, message, related_id)
    values (r.sender_id, 'request_rejected', 'Request declined', coalesce(my_name,'Someone') || ' declined your chat request.', _request);
    return null;
  end if;

  select cm1.conversation_id into conv
    from public.conversation_members cm1
    join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
   where cm1.user_id = me and cm2.user_id = r.sender_id limit 1;

  if conv is null then
    insert into public.conversations default values returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, r.sender_id);
  end if;

  update public.chat_requests set status = 'accepted', conversation_id = conv where id = _request;
  insert into public.notifications (user_id, type, title, message, related_id)
  values (r.sender_id, 'request_accepted', 'Request accepted', coalesce(my_name,'Someone') || ' accepted your chat request.', conv);
  return conv;
end $$;

create or replace function public.cancel_chat_request(_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  update public.chat_requests set status = 'cancelled'
   where id = _request and sender_id = me and status = 'pending';
end $$;

create or replace function public.block_user(_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or me = _target then raise exception 'Invalid request'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (me, _target) on conflict do nothing;
  update public.chat_requests set status = 'blocked'
   where status = 'pending' and ((sender_id = me and receiver_id = _target) or (sender_id = _target and receiver_id = me));
end $$;

create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  return json_build_object(
    'total_users', (select count(*) from public.profiles),
    'online_users', (select count(*) from public.profiles where online and last_seen > now() - interval '2 minutes'),
    'pending_requests', (select count(*) from public.chat_requests where status = 'pending'),
    'conversations', (select count(*) from public.conversations),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'blocks', (select count(*) from public.blocks)
  );
end $$;

create or replace function public.admin_list_users(_limit int default 100)
returns table (id uuid, full_name text, email text, avatar_url text, online boolean, last_seen timestamptz, suspended boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  return query select p.id, p.full_name, p.email, p.avatar_url, p.online, p.last_seen, p.suspended, p.created_at
    from public.profiles p order by p.created_at desc limit _limit;
end $$;

create or replace function public.admin_set_suspended(_user uuid, _suspended boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  update public.profiles set suspended = _suspended where id = _user;
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  delete from auth.users where id = me;
end $$;

alter table public.messages replica identity full;
alter table public.chat_requests replica identity full;
alter table public.notifications replica identity full;
alter table public.conversation_members replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.chat_requests;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null; end $$;

create policy "avatars authenticated read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
create policy "avatars own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
