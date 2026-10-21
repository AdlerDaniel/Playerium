-- Dedicated Playerium project only. Existing clients remain compatible.
begin;
lock table public.playerium_events in share row exclusive mode;
alter table public.playerium_events add column revision bigint;
with ordered as (
 select seq,row_number() over(partition by user_id order by seq) as revision
 from public.playerium_events
)
update public.playerium_events e set revision=o.revision from ordered o where o.seq=e.seq;
alter table public.playerium_events alter column revision set not null;
create unique index playerium_events_user_revision on public.playerium_events(user_id,revision);
create table playerium_private.journal_heads (
 user_id uuid primary key references public.playerium_accounts(user_id) on delete cascade,
 revision bigint not null check(revision>=0)
);
alter table playerium_private.journal_heads enable row level security;
revoke all on playerium_private.journal_heads from public,anon,authenticated;
insert into playerium_private.journal_heads(user_id,revision)
 select user_id,max(revision) from public.playerium_events group by user_id;
-- The row lock is held until COMMIT, so readers cannot advance past an
-- uncommitted earlier revision. Identity sequence values alone cannot do this.
create function playerium_private.assign_journal_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is not null and (select auth.uid())<>new.user_id then
  raise exception 'Account mismatch' using errcode='42501';
 end if;
 insert into playerium_private.journal_heads(user_id,revision) values(new.user_id,1)
 on conflict(user_id) do update set revision=playerium_private.journal_heads.revision+1
 returning revision into new.revision;
 return new;
end $$;
revoke all on function playerium_private.assign_journal_revision() from public,anon,authenticated;
create trigger playerium_event_revision before insert on public.playerium_events
 for each row execute function playerium_private.assign_journal_revision();
create or replace function playerium_private.notify_library() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform realtime.send(jsonb_build_object('seq',new.seq,'revision',new.revision),'library','playerium:'||new.user_id::text,true);
 return new;
end $$;
revoke all on function playerium_private.notify_library() from public,anon,authenticated;
commit;
