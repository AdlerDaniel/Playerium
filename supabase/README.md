# Playerium synchronization

Dedicated project: **cjmdgrstuaxaimpgxsmv** (`playerium`, eu-west-1).
Do not deploy this schema or function to any other Supabase project. In particular,
`adyfbxbmfrdetzdxdmmh` belongs to Couple Space and is outside this integration.

## Responsibilities

- Google Drive retains audio, artwork, and the backup operation log.
- `playerium_events` stores immutable, account-owned operations. The existing
  conflict-resolution model handles likes, membership, metadata and tombstones.
- Database triggers send small wake-up notifications to private Realtime channels.
  Clients read the durable journal after notifications and reconnects; messages
  themselves are not the only copy of any library change.
- Device state and commands use the same private channel. Acknowledgments and
  command IDs prevent double execution when falling back to native delivery.
- Existing local and WebRTC transports remain available. Realtime does not replace
  the Android playback service or guarantee background WebView execution.

## Authentication and isolation

`playerium-session` accepts an existing Google Drive bearer credential **from
native code** and verifies it against Google's Drive `about` API. The resulting
Google permission ID selects a server-owned mapping to a randomly named Supabase
Auth identity. No separate user password is required. A server-generated one-time
login proof is consumed internally to issue the short-lived user JWT. Only the
JWT, expiry and account IDs reach the renderer; refresh tokens are not returned.

The Edge Function uses custom Google authentication, so gateway `verify_jwt` is
disabled for this function only. Invalid/missing Google credentials return 401
before service-role operations. The service key stays in the function's default
server environment. The database password is never part of the application.

RLS limits event reads and inserts to `auth.uid()`. Events cannot be updated or
deleted by clients. The identity mapping is service-only. Private broadcast read
and send policies match the authenticated user's exact channel topic. The public
client key is publishable and does not authorize access to another user's data.

## Recovery and migration

On first reconciliation, existing Drive events are copied idempotently into
Supabase. Published audio is advertised only after its Drive upload completes.
Native upload jobs persist a separate account-scoped realtime outbox, drained
with retries on Windows and by WorkManager on Android. Google Drive backup jobs
remain durable even when realtime is unavailable.

Subsequent metadata pulls use Supabase, with Drive reconciliation at least every
five minutes and on startup. If Supabase fails, the normal Drive path is used.
If a Drive metadata pull fails while Supabase is reachable, its journal remains
available. Audio downloads still depend on Drive and network speed.

## Deployment and verification

`schema.sql` is the initial schema, deployed only to the project above. The Edge
Function source is under `functions/playerium-session`. Bundle the pinned Realtime
client with `npm run realtime:build`; the generated browser module is committed
and included in both desktop and Android packages.

Verification includes unit tests for credential exchange, account switches,
pagination, pending audio, fallback and duplicate command acknowledgments; native
Android tests cover a failed outbox batch, retry and account separation. A live
test with two disposable accounts verified REST/RLS isolation, private WebSocket
notifications, journal recovery and a command/acknowledgment round trip (264 ms).
Disposable accounts and events are removed after verification.

The Supabase advisor also reports the project's default disabled
[password leak check](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Playerium's integration does not use password sign-in; identities receive their
sessions only after server-side Google verification. This notice is separate from
the database credential and does not affect the RLS isolation tests above.
