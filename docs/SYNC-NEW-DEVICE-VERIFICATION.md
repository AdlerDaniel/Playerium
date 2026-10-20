# New Android device synchronization — 1.7.38

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
