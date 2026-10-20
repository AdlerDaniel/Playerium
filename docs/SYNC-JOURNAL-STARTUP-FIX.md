# Android journal startup follow-up

The previous queue fixes still left two barriers before audio import: a new
account performed up to three journal pulls, and Android reread every Drive event
after an interrupted initial pull. A pending download backlog also counted as
outgoing work and triggered another pull before foreground import.

The coordinator now performs one complete pull for an incoming-only sync. It
retains the post-flush pull when there are published operations or pending
outgoing native jobs, using a separate Android outgoing count. Desktop and older
bridges retain the existing pending-count fallback.

Android reads up to twelve events concurrently instead of four. Completion-order
collection reports completed work even when an earlier request is slow. Each
successful event is cached atomically in private, account-specific no-backup
storage. Both listing and changes requests include Drive's file version; only an
exact version match can reuse cached JSON. Unknown versions and corrupt caches
fall back to the original content request. Cache write failures are nonfatal.
A failed pull never returns a new cursor; completed entries remain available for
the next attempt. All journal events, including deletions and restores, are
collected before computing the audio download list.

Drive does not support batching media downloads, including event JSON fetched
with `alt=media`; this implementation uses supported individual downloads.
Reference: https://developers.google.com/workspace/drive/api/guides/performance

## Validation

- `npm run check` and `npm test` run locally.
- Added coordinator regressions for a single pull before download, completed
  deletion history before import, and a pending download backlog.
- Extended `CloudStorageTest` with 1,224 events over two pages, twelve concurrent
  reads, zero repeat content requests for unchanged versions, interrupted refresh
  recovery, and unknown-version fallback. This requires the Android emulator CI;
  Android SDK/emulator are unavailable in the current workspace.
- A physical Honor tablet and its Google account are not connected. No measured
  device speedup or successful installation is claimed. The first uncached Drive
  pull still reads every event; subsequent attempts reuse completed reads.
