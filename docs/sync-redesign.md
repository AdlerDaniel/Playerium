# Local-first synchronization redesign

## Required behavior

- Every completed recording is stored on the device and plays without Drive or Supabase.
- Google sign-in starts and maintains synchronization automatically. Settings expose account controls, not a sync dashboard.
- Metadata, likes, deletions and playlists converge independently of audio uploads/downloads.
- Drive stores verified, normalized audio revisions and artwork as a backup; interrupted transfers resume from durable state.
- Windows, Android phone and Android tablet are equal writers. Intentional deletions remain deletions.
- Background transfers survive closing the Android activity and report ongoing work through the system notification.

## Verified starting problems (1.7.42)

- Android CloudWorker exits when no previously queued transfer exists; it never pulls incoming changes itself.
- Foreground CloudSync waits for outgoing flush before applying incoming operations; native file transfers share the bridge executor.
- RealtimeSync reads the complete Supabase journal repeatedly and periodically falls back to individually downloaded Drive journal files.
- GoogleCloud holds a global job lock across network transfers, serializing independent work and blocking foreground metadata calls.
- Realtime track publication occurs after both audio and Drive journal upload, increasing the critical path.
- Account settings expose queue controls, diagnostics, setup and recovery alongside unrelated sound and appearance controls.

## Implementation sequence

1. Publish the already built theme release 1.7.42 independently; do not mix this redesign into its tag.
2. Replace account settings with Google sign-in and a compact account row. Structure settings into account, appearance, sound/player, local files, updates, and desktop shortcuts.
3. Replace foreground coordination with independent durable metadata and file queues. Use bounded concurrency, incremental durable journal reads, immediate remote edits and resumable recovery.
4. Add native incoming journal discovery and queue reconciliation on Android and Windows, independent of WebView/renderer lifetime. Preserve legacy immutable operations during migration.
5. Verify normalized bytes before backup publication, preserve recording identity across audio revisions, verify hashes on receipt, and import already downloaded files without network work.
6. Test three peers, initial import, concurrent edits, offline edits, intentional deletions, process restart, broken transfers, account switching, and native background work.

## Infrastructure boundaries

Only Supabase project `cjmdgrstuaxaimpgxsmv` (playerium) is in scope. Never change couple-space.

Realtime notifications wake durable journal reads; delivery notifications alone cannot be the source of truth.

No network can guarantee immediate delivery while disconnected or when all configured endpoints are blocked. A reachable authenticated relay/custom endpoint is required if Google/Supabase are unavailable through the user's provider. Do not claim VPN-independent reachability without measuring it on those networks.

Instant wake-up of an idle Android application requires push configuration (for example FCM); periodic WorkManager is recovery, not instant push. Android limits background execution; ongoing transfers must use supported foreground/user-initiated work and recover after interruption.

## Progress

- Firebase Android client configuration received from the user and validated: project playerium-personal, project number 919635824329, package com.playerium.music. Copied to android/app/google-services.json and wired the Google Services Gradle plugin. Runtime FCM delivery is not yet verified.
- FCM receive/registration and native wake-up are now implemented locally. `playerium-push` Edge Function and migration `20261021171642_playerium_push_delivery.sql` are LIVE in Playerium only: service-only RPCs, private device registrations, coalesced durable jobs, leased dispatch, retries, stale-token protection and cron recovery. Rollback-only SQL checks and unauthenticated HTTP rejection passed. Full JS tests 147 passed; Android production and instrumentation compilation passed before the new CloudPushTest was added. Server signing credential is still missing: no actual FCM send or physical-device wake-up has been verified. See firebase-push.md.
- Final Android compilation including CloudPushTest passed. Live pg_net -> Edge -> Vault authentication checked: correctly reports FCM server configuration required (503), without claiming queue jobs. Server credential is the next external dependency. No release containing this redesign has been published.
- 2026-10-21: server credential received, verified as playerium-personal and imported into Vault only. OAuth and Firebase HTTP v1 validate-only check passed. Live pg_net -> Edge -> Vault -> OAuth now returns 200 with no pending jobs. Zero Android registrations yet; physical-device receipt needs installation of the new client. The credential dependency is resolved; never copy the signing key into this repository or client binaries.
- 1.7.42 is PUBLIC/STABLE: https://github.com/AdlerDaniel/Playerium/releases/tag/v1.7.42 . Tag source 720490a, CI run 39634535125 succeeded. All four assets, signatures and exact theme source verified; both Windows packages passed actual audio/mini-player controls. Android API29+36: 45 native tests, playlist starts 213/193 ms and switches 134/142 ms. Do not alter this published tag.
- Inspected Supabase playerium: 1239 events, one account, RLS restricted to the owning user. No data changed.
- Source exploration used codebase-memory, then current source fallback for metadata-changed paths.
- Local settings redesign implemented and visually inspected at desktop/phone sizes. Account login/logout only; technical sync controls and editable GitHub repo removed. Existing theme/equalizer/folder/update controls retained, indexed sections added. Targeted appearance/Android settings/account browser checks passed. Google sign-in now schedules synchronization without awaiting the entire file batch.
- LIVE Playerium-only migration `20261021164036_playerium_durable_journal.sql` applied. Adds a per-account commit-ordered revision, private row-locked journal heads, revision index and wake notifications. A rollback-only insert verified the trigger; all 1239 original events have revisions. Coupled Space untouched. Advisor INFO: private journal_heads intentionally has RLS with no client policy; prior leaked-password-check warning remains unrelated to Google login.
- JS incremental reads persist journalCursor with local received events; retries and legacy journal migration pass. Added metadata-only lane, prioritization of non-file edits, 3-way bounded file work, and a guard against resurrecting a track deleted while its download was pending. 38 focused cloud/realtime tests pass, including blocked-upload metadata delivery and deletion/download race.
- Native Android CloudJournal now receives/persists the incoming journal without a WebView and queues missing recordings. Worker checks for incoming work even with an empty transfer queue. Status/session operations have a separate executor. New native tests added; compilation passed before the latest backup-normalization edit. Native tests still need emulator execution on API29/36.
- Android backup preparation work in progress: normalize a private queued snapshot before uploading it, carrying verified audioKey/normalization/size into the immutable event. Private normalization access is narrowly limited to canonical cloud-jobs/audio/queued-UUID paths. Queue lock is released around normalization to avoid lock inversion; preparingJobs suppresses a second worker processing that file concurrently. Check these changes carefully and test native upload fixtures/recovery.
- Metadata writes now enqueue realtime independently of Drive backup writes on both platforms. Windows background renderer already has backgroundThrottling:false.

## Current implementation checkpoint

- Windows production now uses desktop-original-audio.js: constant gain toward -7 LUFS, peak headroom preserved, original-file replacement, verified marker and crash recovery. Actual FFmpeg tests passed, including unchanged dynamics and replay without processing. The old copy processor is retained only for compatibility/tests.
- LAN file delivery is wired into Windows and Android native downloads with hash-only source registries, AES-GCM chunks, resumable Drive fallback, account checks and final hash validation. Windows HTTP replies now include Content-Length for Android interoperability. Three independent file stores redistribute recordings without Drive in runtime socket tests.
- Peer-ready track-preview operations advertise prepared bytes before a new track waits for Drive. Dedicated migration 20261021183041_playerium_peer_ready_tracks.sql is LIVE in Playerium only and was checked with a rollback-only insert. Final backed-up operations take priority at equal clocks; older clients ignore previews.
- Android no longer holds the global queue lock across normalization/upload; active job IDs prevent duplicate processing. Downloads have separate per-recording locks. Ready imports bypass transfer locks. Source snapshot ownership and normalization recovery were tightened. Native journal state prevents deleted/obsolete downloads from being installed and reconciles pending jobs.
- Incoming JS file work runs while outgoing native uploads wait, with serialized/coalesced file application. Failed recordings retry on the next pass rather than twice in the same pass. Independent metadata delivery remains active.
- Native incoming discovery falls back to the Drive journal if the realtime provider cannot be reached. Account-prefixed download job filenames preserve other accounts' pending jobs.
- Latest completed checks: 155 JS tests passed locally in a sequential Windows run; 104 browser tests passed. Candidate CI 39657270633 passed JS/browser checks and Windows runtime/package gates. Android lint and signed candidate build passed; native emulator verification is still running.
- Signed Android 1.7.43 (code 57, source 33bfe49) was checked against the existing release certificate and exact compiled JS, then installed over Samsung SM-M236B / Android 14 via adb install -r. Existing app data was retained. Native logs confirmed push registration and actual FCM receipt, including a test notification after bringing the launcher forward. No library operation was invented for that test.
- Physical-device testing exposed a queueing issue: accepted push notifications were appended behind a transfer worker's retry/backoff. Push journal receipt now has a separate replaceable metadata lane, and completed receipt wakes a separate file lane without cancelling an active transfer. New metadata can restart a waiting file retry. Incoming recordings take priority over outgoing Drive backups. These follow-up changes still need the next signed candidate and native runtime gates.
- Windows cold HTTP initialization could exceed the 450 ms LAN deadline. First-contact handshakes now allow 1500 ms; established peers keep 450 ms. The previously failing Windows LAN test and the full 155-test suite passed after this fix.

## Still required before publication

- Run the complete final JS/browser checks and Android runtime/lint on API29/36, including encrypted native transfers, account ownership, background journal receipt, updated concurrent transfers and normalization recovery. Compile success alone is not runtime confirmation.
- Review changed native/storage code and resolve any CI failures; verify packaged Windows/Android artifacts and the existing signing identity.
- Verify the latest independent push/file lanes on the attached Samsung with an updated signed candidate. Actual FCM registration and notification receipt have passed on the earlier candidate; receipt alone does not prove completion of journal/file work.
- Keep network limitations explicit: no universal VPN-free guarantee and no remote relay provisioned. Cross-network file fallback remains Drive.
- Current candidate version is 1.7.43 / Android code 57. The published v1.7.42 tag is immutable; do not put these changes into it.
