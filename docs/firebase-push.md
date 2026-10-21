# Android background library wake-ups

Only Google Cloud/Firebase project `playerium-personal` (919635824329) and Supabase project `cjmdgrstuaxaimpgxsmv` are in scope. Never configure Couple Space.

## Client

`android/app/google-services.json` is the Android **client** configuration, not a server credential. The Google Services Gradle task validates the package `com.playerium.music`. Messaging 24.1.2 retains the existing minimum Android API22 compatibility; newer major versions raise it.

Firebase receives data-only wake-up hints. `CloudMessagingService` accepts only the configured sender and the currently registered account. It starts native WorkManager synchronization with a foreground progress notification; it does not trust push payloads as library operations. The native durable journal supplies actual metadata and file jobs. Token registration retries after network failure, initial login, app startup and token rotation. Periodic synchronization remains recovery when push is unavailable. Android force-stop and unreachable Google services cannot guarantee immediate delivery.

Push journal work uses a separate replaceable lane, so it bypasses an earlier file transfer's retry/backoff. Once the journal is stored, incoming file work wakes independently, preserves an active transfer and can restart a waiting retry. Incoming recordings precede outgoing Drive backup jobs.

## Server

Migration `20261021171642_playerium_push_delivery.sql` creates private device tokens, a coalescing per-device revision queue, expiring dispatch leases, retry backoff and a one-minute recovery job. Statement triggers wake `playerium-push` after event transactions commit through pg_net. Registration uses a Supabase user session and derives ownership from `/auth/v1/user`, never from the submitted user ID. All push RPCs are service-role only. The Edge Function authenticates dispatcher requests against a random Vault secret; the gateway JWT check is disabled because the function explicitly authenticates both entry paths.

Migration `20261021192226_playerium_push_followup.sql` immediately dispatches a newer revision that survives acknowledgement of an in-flight delivery. Stale acknowledgements cannot schedule another dispatch. An empty/not-yet-due queue does not invoke the Edge Function.

The Firebase service-account JSON must be stored **only** in Supabase Vault as `playerium_fcm_service_account`. The Edge Function obtains it via a service-role-only RPC and signs a short-lived OAuth assertion scoped to Firebase Messaging. Private signing keys must never enter APKs, renderer code, logs, committed files or GitHub secrets intended for client configuration. Validate `project_id` and `client_email` against `playerium-personal` before importing any credential. Prefer a dedicated account with `roles/firebasecloudmessaging.admin` scoped to this single project. The HTTP v1 Cloud Messaging API must be enabled.

Without that Vault entry, automatic dispatch deliberately stays dormant, registration/journal operations remain usable, and jobs remain durable. Do not claim notification delivery is active until an actual configured Android device receives and processes a data message while its activity is closed.

## Verification

- 2026-10-21: user-provided signing credential validated against Playerium and imported into Supabase Vault only. Google OAuth and FCM HTTP v1 `validate_only` request succeeded; no notification sent. Live database -> Edge -> Google authorization succeeded (`delivered:0,failed:0`), with zero registered Android devices. Actual device receipt remains unverified until the new Android client is installed and registered. Credential source is outside the Player repository and must not be packaged or committed.
- Later on 2026-10-21: signed candidate 1.7.43 / code 57 / source 33bfe49 installed over Samsung SM-M236B (Android 14) with existing data retained. The native client registered one device and accepted actual FCM messages, including a message sent after bringing the launcher forward. This exposed file-backoff blocking subsequent push work; the separate-lane follow-up still requires installation and completion evidence on that device.
- Live rollback-only follow-up checks passed: a newer revision queues an immediate pg_net dispatch; a stale acknowledgement queues no duplicate; acknowledging the latest revision removes the queue entry; idle wake calls queue no HTTP work. Test queue mutations and HTTP work were rolled back without changing the music journal or sending test library operations.
- `node --test tests/push.test.cjs`: authentication, identity binding, missing credentials, scoped RSA signing, HTTP delivery outcomes, network failure, wrong-project rejection.
- SQL rollback-only checks: exclusive claim, concurrent newer revision, retry backoff, rotated token surviving a stale UNREGISTERED response, cascade cleanup, no anon/authenticated RPC access.
- Android `CloudPushTest`: sender/account validation and logout suppression. Compile success alone does not confirm physical-device delivery.
