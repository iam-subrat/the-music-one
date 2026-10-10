# Shared Queue Rollout

Shared Queue is independent playback, not synchronized listening. Each browser
tab/device owns its cursor, transport and repeat mode; the room shares a catalog.

## Deployment Order

1. Apply Alembic through revision 010 with the API release. Existing rooms default
   to DJ-led. Revision 010 repairs null expiry timestamps using creation time plus
   24 hours, without extending existing timestamps or reviving expired rooms.
   Deploy the updated API model so new rooms use the database expiry default.
   The default already exists from the baseline; revision 010 avoids an
   unnecessary ALTER TABLE exclusive lock. SSE releases its setup transaction
   before streaming so open listeners do not retain database read locks.
2. Deploy web clients, including the hosted /bridge player with protocol 2.
3. Ship the Capacitor mobile client update. Old mobile clients cannot play Shared
   Queue and cannot mutate its global playback state.
4. Validate YouTube cue/play on physical iOS and Android devices, including
   background/foreground transitions, interrupted audio and blocked embeds.
5. Enable INDEPENDENT_PLAYBACK in feature_flags only after the above checks.
   YOUTUBE_EMBED must also remain enabled. The new flag defaults to false.

## Operational Checks

- Host creation and confirmed switching work; non-host switching returns 403.
- A conflicting expected_version returns 409. Clients refresh on conflict.
- Shared Queue joins/reloads are paused. Local Next never calls a queue-advance RPC.
- Independent resolution uses transaction-scoped PostgreSQL advisory locks per
  item across API workers, then rechecks the session epoch before metadata writes.
- Resolution errors do not globally skip songs. Expensive resolution endpoints use
  the existing strict rate-limit bucket.
- Mode changes increment playback_mode_version and disable auto-pilot. Returning
  to DJ-led assigns the host as DJ, cues at zero, and requires explicit Play.
- Check API errors and external lookup quotas during the staged rollout.

## Kill Switch And Rollback

Disable INDEPENDENT_PLAYBACK to block new rooms/transitions without breaking
already independent rooms. Hosts can return those rooms to DJ-led.

Revision 010 downgrade restores the previous queue guard but retains repaired
timestamps and the baseline expiry default. Reapply it if rolling back a client
release; do not restore null expiry data.

Before downgrading revision 009, end or convert all active Shared Queue rooms.
The downgrade deliberately refuses otherwise. Downgrade removes the additive
columns/flag and restores the original RPC implementations.

## Verification

- Web: npm exec vitest run; npm exec playwright test; npm run build.
- Mobile: npm ci; npm run build; npm run lint.
- API: pytest -q, with TEST_DATABASE_URL pointing to a disposable database whose
  name begins musicone_test. Database tests reset public schema; never use a live
  database. PostgreSQL 15 was used for local migration, concurrency and rollback checks.
- Browser tests replace remote API/YouTube dependencies, exercise two isolated
  listeners and GUI/TUI continuity, and capture both themes at 390px/1440px.

Physical-device playback and deployment smoke checks are release gates, not
claims made by the local test suite.
