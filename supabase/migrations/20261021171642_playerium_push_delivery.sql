-- Playerium only. FCM tokens and dispatch credentials are never client-readable.
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create table playerium_private.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.playerium_accounts(user_id) on delete cascade,
  installation uuid not null,
  token text not null unique check (length(token) between 20 and 4096),
  updated_at timestamptz not null default now(),
  unique(user_id,installation)
);
create table playerium_private.push_queue (
  device_id uuid primary key references playerium_private.push_devices(id) on delete cascade,
  revision bigint not null,
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  lease uuid,
  leased_until timestamptz
);
alter table playerium_private.push_devices enable row level security;
alter table playerium_private.push_queue enable row level security;
revoke all on playerium_private.push_devices,playerium_private.push_queue from public,anon,authenticated;

do $$ begin
 if not exists(select 1 from vault.secrets where name='playerium_push_worker') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'playerium_push_worker');
 end if;
end $$;

create function public.playerium_push_authorize(p_secret text) returns boolean
language sql security definer set search_path='' as $$
 select length(p_secret)=64 and exists(select 1 from vault.decrypted_secrets
 where name='playerium_push_worker' and decrypted_secret=p_secret)
$$;
create function public.playerium_push_credentials() returns jsonb
language sql security definer set search_path='' as $$
 select decrypted_secret::jsonb from vault.decrypted_secrets where name='playerium_fcm_service_account'
$$;

create function playerium_private.wake_push() returns void
language plpgsql security definer set search_path='' as $$
declare credential text;
begin
 if not exists(select 1 from vault.secrets where name='playerium_fcm_service_account') then return; end if;
 select decrypted_secret into credential from vault.decrypted_secrets where name='playerium_push_worker';
 perform net.http_post(url:='https://cjmdgrstuaxaimpgxsmv.supabase.co/functions/v1/playerium-push',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
   body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=20000);
end $$;

create function public.playerium_push_register(p_user uuid,p_installation uuid,p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare device uuid;
begin
 -- Only the authenticated Edge Function may invoke this RPC with a verified user.
 if length(p_token) not between 20 and 4096 then raise exception 'Invalid token'; end if;
 delete from playerium_private.push_devices where token=p_token and (user_id<>p_user or installation<>p_installation);
 insert into playerium_private.push_devices(user_id,installation,token) values(p_user,p_installation,p_token)
 on conflict(user_id,installation) do update set token=excluded.token,updated_at=now() returning id into device;
 -- Catch up after reinstall, token rotation or an offline login.
 insert into playerium_private.push_queue(device_id,revision)
 select device,max(revision) from public.playerium_events where user_id=p_user having count(*)>0
 on conflict(device_id) do update set revision=greatest(playerium_private.push_queue.revision,excluded.revision),next_at=now(),lease=null,leased_until=null;
 perform playerium_private.wake_push();
end $$;
create function public.playerium_push_unregister(p_user uuid,p_installation uuid) returns void
language sql security definer set search_path='' as $$
 delete from playerium_private.push_devices where user_id=p_user and installation=p_installation
$$;

create function playerium_private.queue_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into playerium_private.push_queue(device_id,revision)
 select id,new.revision from playerium_private.push_devices where user_id=new.user_id
 on conflict(device_id) do update set revision=greatest(playerium_private.push_queue.revision,excluded.revision),next_at=least(playerium_private.push_queue.next_at,now());
 return new;
end $$;
create function playerium_private.flush_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from playerium_private.push_queue where next_at<=now() and (leased_until is null or leased_until<now())) then
  perform playerium_private.wake_push();
 end if;
 return null;
end $$;
create trigger playerium_push_queue after insert on public.playerium_events for each row execute function playerium_private.queue_push();
create trigger playerium_push_flush after insert on public.playerium_events for each statement execute function playerium_private.flush_push();

create function public.playerium_push_claim() returns jsonb
language sql security definer set search_path='' as $$
 with candidates as (
  select q.device_id from playerium_private.push_queue q where q.next_at<=now()
  and (q.leased_until is null or q.leased_until<now()) order by q.next_at for update skip locked limit 32
 ), claimed as (
  update playerium_private.push_queue q set lease=gen_random_uuid(),leased_until=now()+interval '90 seconds'
  from candidates c where q.device_id=c.device_id returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('device',q.device_id,'revision',q.revision::text,'lease',q.lease,'token',d.token,'user',d.user_id)),'[]'::jsonb)
 from claimed q join playerium_private.push_devices d on d.id=q.device_id
$$;
create function public.playerium_push_finish(p_device uuid,p_lease uuid,p_revision bigint,p_result text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_result='unregistered' then
  delete from playerium_private.push_devices d using playerium_private.push_queue q where d.id=p_device and q.device_id=d.id and q.lease=p_lease;
 elsif p_result='ok' then
  delete from playerium_private.push_queue where device_id=p_device and lease=p_lease and revision<=p_revision;
  update playerium_private.push_queue set lease=null,leased_until=null,attempts=0,next_at=now() where device_id=p_device and lease=p_lease;
 else
  update playerium_private.push_queue set lease=null,leased_until=null,attempts=least(attempts+1,10),
   next_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::int)
  where device_id=p_device and lease=p_lease;
 end if;
end $$;

revoke all on function playerium_private.wake_push(),playerium_private.queue_push(),playerium_private.flush_push() from public,anon,authenticated;
revoke all on function public.playerium_push_authorize(text),public.playerium_push_credentials(),public.playerium_push_register(uuid,uuid,text),public.playerium_push_unregister(uuid,uuid),public.playerium_push_claim(),public.playerium_push_finish(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.playerium_push_authorize(text),public.playerium_push_credentials(),public.playerium_push_register(uuid,uuid,text),public.playerium_push_unregister(uuid,uuid),public.playerium_push_claim(),public.playerium_push_finish(uuid,uuid,bigint,text) to service_role;
select cron.schedule('playerium-push-recovery','* * * * *','select playerium_private.wake_push()');
commit;
