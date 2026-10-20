# New Android device synchronization — 1.7.39

## Report and evidence

Honor Pad X8b on the latest release remained on “Синхронизация…” with no imported songs. No physical device was connected by ADB during this investigation.

Read-only inspection of the Playerium Supabase project found 1,224 journal operations and successful session requests. Server logs also contained successful WebSocket upgrades from an Honor WebView. These observations establish service availability, not successful journal retrieval or audio downloads on the tablet. No database rows, cloud files, account settings, or other Supabase projects were changed.

## Corrected paths

- Android foreground flush processes outgoing changes only. Previously it could process every durable download before CloudSync.apply started importing tracks or displaying its download counter.
- The worker locks one job at a time with a fair lock. A waiting foreground operation can run between background transfers rather than waiting for the entire library.
- queueDownloads uses the same job lock so updating an entry cannot race with its completion and deletion.
- An existing cached recording is accepted only after matching content hash, size and modification stamp. It can then be imported without another Drive metadata/audio request; missing covers still use the independent cover path.
- Drive journal listings already select files by application and event properties; each selected file is fetched once instead of issuing another metadata request before its content. Pagination and cursor semantics remain intact.
- Native journal progress is delivered only to its pending request. Progress never resolves the request; final data or errors still do.
- Synchronization reports its current stage and discards the previous attempt’s progress.

## Regression coverage

JavaScript tests cover first import, stale progress reset, native progress response handling, legacy deletion convergence, interrupted uploads, more than 30 downloads, and immutable normalized audio revisions.

Native tests cover foreground flush skipping queued downloads, verified cached imports without networking, rejection of changed bytes, foreground import between two background transfers, and the first 1,224-entry Drive pull across two pages.

The release workflow runs the full native suite on Android API 29 and API 36 with 16 KB pages, plus browser and Windows runtime tests. Final release claims must use completed workflow results. Physical Honor synchronization remains to be confirmed after installing the update.

## Release dependency recovery

The preliminary v1.7.37 build could not fetch the removed upstream FFmpeg autobuild (HTTP 404); no application release was published for that tag. v1.7.38 uses the byte-identical cached original archive, pinned by its existing SHA-256, from a separate prerelease dependency mirror. Matching FFmpeg sources and the build-script snapshot at the original build date are attached. Audio executables and their versions remain unchanged.


## Private-channel bootstrap

Additional server log inspection found two private-channel authorization denials for the existing Playerium account immediately after successful session creation, at 2026-10-19T17:57:48Z and 19:24:58Z. WebSocket upgrades alone were insufficient evidence of an authorized subscription.

The client now explicitly awaits setAuth(user JWT) before creating its first private channel, rather than relying on token callback timing at connection. A failed bootstrap drops the partial session/client so a subsequent attempt can retry. Account changes during the asynchronous bootstrap cannot recreate the old channel.

Three regression tests failed on the previous implementation and pass after the fix: authorized cold joins, retry after initialization failure, and reset during token installation. This removes the identified authorization race; it does not establish that every reported tablet stall had this single cause.

Official references reviewed: https://supabase.com/docs/reference/javascript/setauth and https://supabase.com/docs/guides/realtime/postgres-changes#custom-tokens . The current changelog was checked; the upcoming TLS cipher removal and schema-lockdown notices do not require policy changes for this fix. No database policies or account rows were changed.

The preliminary v1.7.38 workflow was canceled before publication to include this correction in v1.7.39.
