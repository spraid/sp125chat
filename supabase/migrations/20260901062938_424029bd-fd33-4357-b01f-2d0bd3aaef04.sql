alter table public.messages replica identity full;
alter table public.chat_requests replica identity full;
alter table public.notifications replica identity full;
alter table public.profiles replica identity full;
alter table public.conversations replica identity full;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.messages'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.chat_requests'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.notifications'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.conversations'; exception when duplicate_object then null; end;
end $$;

drop policy if exists "avatars read own or related" on storage.objects;
drop policy if exists "avatars upload own" on storage.objects;
drop policy if exists "avatars update own" on storage.objects;
drop policy if exists "avatars delete own" on storage.objects;

create policy "avatars read own or related" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.shares_context(auth.uid(), nullif((storage.foldername(name))[1], '')::uuid)
      or public.has_role(auth.uid(), 'admin')
    )
  );

create policy "avatars upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
