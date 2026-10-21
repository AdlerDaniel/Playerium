-- Keep burst updates immediate when a newer revision arrives during FCM delivery.
-- Only Playerium's existing private queue and service-only RPC are affected.
begin;
create or replace function playerium_private.wake_push() returns void
language plpgsql security definer set search_path='' as $$
declare credential text;
begin
 if not exists(select 1 from playerium_private.push_queue where next_at<=now()
   and (leased_until is null or leased_until<now())) then return; end if;
 if not exists(select 1 from vault.secrets where name='playerium_fcm_service_account') then return; end if;
 select decrypted_secret into credential from vault.decrypted_secrets where name='playerium_push_worker';
 perform net.http_post(url:='https://cjmdgrstuaxaimpgxsmv.supabase.co/functions/v1/playerium-push',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
   body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=20000);
end $$;

create or replace function public.playerium_push_finish(p_device uuid,p_lease uuid,p_revision bigint,p_result text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_result='unregistered' then
  delete from playerium_private.push_devices d using playerium_private.push_queue q where d.id=p_device and q.device_id=d.id and q.lease=p_lease;
 elsif p_result='ok' then
  delete from playerium_private.push_queue where device_id=p_device and lease=p_lease and revision<=p_revision;
  update playerium_private.push_queue set lease=null,leased_until=null,attempts=0,next_at=now() where device_id=p_device and lease=p_lease;
  -- A newer revision survived the acknowledgement. Dispatch it now, without
  -- waiting for the next library write or the minute-based recovery task.
  if found then perform playerium_private.wake_push(); end if;
 else
  update playerium_private.push_queue set lease=null,leased_until=null,attempts=least(attempts+1,10),
   next_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::int)
  where device_id=p_device and lease=p_lease;
 end if;
end $$;
commit;
