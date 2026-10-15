-- Deploy only to the dedicated Playerium project cjmdgrstuaxaimpgxsmv.
begin;
create schema if not exists playerium_private;
revoke all on schema playerium_private from public, anon, authenticated;
create table public.playerium_accounts (
  google_account text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique
);
alter table public.playerium_accounts enable row level security;
revoke all on public.playerium_accounts from anon, authenticated;
grant all on public.playerium_accounts to service_role;
create policy accounts_service_only on public.playerium_accounts for all to service_role
  using (true) with check (true);
create table public.playerium_events (
  seq bigint generated always as identity primary key,
  user_id uuid not null references public.playerium_accounts(user_id) on delete cascade,
  op_id text not null check (op_id ~ '^[A-Za-z0-9_-]{1,160}$'),
  operation jsonb not null,
  unique(user_id, op_id),
  check (octet_length(operation::text) <= 262144),
  check (coalesce(operation->>'id'=op_id and operation->>'version'='1'
    and operation->>'kind' in ('track','like','delete','restore','playlist','playlist-delete','member'), false)),
  check (operation->>'kind' <> 'track' or coalesce(operation#>>'{track,audioId}' <> 'pending',false))
);
alter table public.playerium_events enable row level security;
revoke all on public.playerium_events from anon, authenticated;
grant select, insert on public.playerium_events to authenticated;
grant usage on sequence public.playerium_events_seq_seq to authenticated;
grant all on public.playerium_events to service_role;
create policy own_events_read on public.playerium_events for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_events_insert on public.playerium_events for insert to authenticated
  with check ((select auth.uid()) = user_id);
create index playerium_events_user_seq on public.playerium_events(user_id,seq);
create function playerium_private.notify_library() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('seq',new.seq),'library','playerium:'||new.user_id::text,true);
  return new;
end $$;
revoke all on function playerium_private.notify_library() from public,anon,authenticated;
create trigger playerium_event_notify after insert on public.playerium_events
  for each row execute function playerium_private.notify_library();
create policy playerium_broadcast_read on realtime.messages for select to authenticated
  using (extension='broadcast' and realtime.topic()='playerium:'||(select auth.uid())::text);
create policy playerium_broadcast_send on realtime.messages for insert to authenticated
  with check (extension='broadcast' and realtime.topic()='playerium:'||(select auth.uid())::text);
commit;
