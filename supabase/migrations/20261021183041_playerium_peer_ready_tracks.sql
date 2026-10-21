-- New clients can retrieve a ready local recording while its backup is uploading.
-- Older clients ignore track-preview and continue to use ordinary backed-up tracks.
begin;
alter table public.playerium_events drop constraint playerium_events_check;
alter table public.playerium_events add constraint playerium_events_check check (
 coalesce(operation->>'id'=op_id and operation->>'version'='1' and
 operation->>'kind' in ('track','track-preview','like','delete','restore','playlist','playlist-delete','member'),false)
);
alter table public.playerium_events add constraint playerium_events_preview_check check (
 operation->>'kind'<>'track-preview' or coalesce(operation#>>'{track,audioId}'='peer'
 and operation#>>'{track,audioKey}' ~ '^[a-f0-9]{64}$',false)
);
commit;
