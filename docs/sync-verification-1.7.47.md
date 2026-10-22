# Windows library reconciliation: 53 to 56 tracks

Release source: tag `v1.7.47`, Android version code 61.

## Findings

- The Windows production network allowlist allowed Google endpoints but rejected the Playerium Supabase endpoint. Tests previously substituted a transport and missed this production boundary.
- The saved desktop Google refresh token was rejected with `invalid_grant`. The account remained displayed as connected, without a reconnect action. The user signed in again; a read-only diagnostic confirmed the new session worked after correcting the allowlist.
- With VPN disabled, large Chromium journal responses repeatedly stalled. Small responses over fresh HTTP connections succeeded. Windows now reads the account-scoped journal natively in 20-event pages, retries an interrupted page, validates revision order and checks the account before accepting data. Renderer transports on other platforms retain their existing reader.
- Four previously imported normalized recordings were linked by their new byte hashes rather than their original cloud recording identities. Their normalized content hashes or saved cloud identities now reconnect the existing local rows. Pending likes and membership changes receive new operation IDs when remapped; published operations remain immutable. Pending duplicate uploads are removed. Deletions remain effective.

## Live-data proof

An isolated copy of the desktop's 53-row library was reconciled using all 1393 events from the real account journal. The fixed production native reader completed the journal read with VPN disabled. Required audio was fetched from Google Drive using the production downloader, including ownership, size and SHA-256 checks.

Result: **53 local rows → 56 rows matching all 56 active cloud recording identities; 8 imported recordings; no missing identities, duplicates or download failures.** The difference includes pending deletions and identity repair, rather than simply three new files. The original desktop database and original audio files were not modified by this diagnostic.

Local verification: 166 unit tests, 104 browser tests, syntax/version checks and the Electron cloud-runtime check passed. Added regressions cover the production endpoint allowlist, native journal IPC, interrupted response bodies, revision gaps, account switching, expired Google authorization, normalized identity recovery, pending likes/playlists and intentional deletions.

The unpublished 1.7.46 verification run found a separate late-artwork failure on Android 16 after all Android 10 checks passed. The recorded System UI logs contained `EACCES` when loading private `file://` artwork paths. Playback metadata now contains image bytes instead of those paths. The image is read on the artwork worker; a revision check rejects stale completions. Existing artwork tests now also reject private file URIs in system metadata and check immutable cache-version reads. Final package and emulator verification is recorded after the 1.7.47 build completes.

## Google sign-in

`invalid_grant` requires signing in again; the application cannot renew a rejected refresh token itself. If the Google OAuth consent screen remains in External / Testing, Google documents a seven-day lifetime for these Drive refresh tokens. This is one possible cause, not a confirmed diagnosis of this account's consent-screen state: [Google OAuth documentation](https://developers.google.com/identity/protocols/oauth2/).
