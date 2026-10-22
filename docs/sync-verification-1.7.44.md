# Verification for 1.7.44

Release source: `4e4a30956756bd77d8c95dd4219991ff34cfd2af`, tag `v1.7.44`, Android version code 58.

- GitHub Actions run [39664042616](https://github.com/AdlerDaniel/Playerium/actions/runs/39664042616), attempt 2: verification, Windows, Android and release packaging succeeded. The first attempt encountered an invalid downloaded emulator archive; the failed job was rerun.
- Both Android runtime gates passed: API 29 and API 36 with 16 KiB pages. The archived final native XML report contains 54 test cases and no failures/errors, including cancelled parallel journal reads, account isolation, concurrent snapshots and incoming files preceding unavailable outgoing backups.
- JavaScript verification: 155 unit tests and 104 browser tests passed. Windows native audio/cloud/LAN tests and desktop runtime checks passed.
- Both Windows packages: 112 packaged JS/CSS/HTML sources matched the release tag. Actual streamed audio, mini-player transport/seek/volume and hidden-main-window playback were checked using each extracted package.
- All four release asset hashes matched both GitHub digests and SHA256SUMS. The Android package retained the existing signing certificate and contained the expected compiled sources and native synchronization components, without instrumentation-only components or Firebase Admin credentials.

## Physical Android check

The final release APK was installed over the existing application on a Samsung SM-M236B (API 34), retaining app data. Its SHA-256 was `c64fa275d867f7a42a88c4b35c311a0bb6c2236b65342582a9c3c3e15044e314`.

With the launcher foreground and the phone forced into deep Doze, an FCM hint for the existing journal revision was accepted. The background refresh started 82 ms later and journal/file reconciliation completed in 1188 ms. Forced idle was then removed and both idle states returned to ACTIVE.

This checks background wake-up and reconciliation of the existing library; it does not measure transfer of a newly added audio file or prove full convergence across three physical devices. The Honor tablet was not attached for physical testing. Google/Supabase connectivity and operating-system restrictions remain external dependencies.

## Firebase client configuration alert

GitHub secret-scanning alert 1 identifies the client API key in `android/app/google-services.json`, not a Firebase Admin private key. Firebase documents these client keys as public by design, subject to appropriate API restrictions: [Firebase API key guidance](https://firebase.google.com/docs/projects/api-keys).

Tracked files were scanned for Firebase Admin credentials and PEM private-key material; none were found. Automatic inspection of the client key's restrictions was blocked because `apikeys.googleapis.com` was disabled in `playerium-personal`. The alert remains open pending inspection of restrictions in Google Cloud. No rotation, permission expansion or alert dismissal was performed.
