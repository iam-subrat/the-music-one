# Session Expiry

Sessions expire after 15 days without activity, not 15 days after creation.
`expires_at` is the materialized deadline: `last_activity_at + 15 days`.

Authenticated participants send a heartbeat every 30 seconds while a room is
open in GUI, TUI, or mobile. A paused room therefore stays alive while someone
keeps it open and their heartbeats reach the API. Adding a queue item also
updates activity. Joining a still-active room renews its deadline immediately.
Merely retaining an invite link or participant row does not.

The database renewal trigger keeps deadlines consistent for all activity
writers, including older API instances during deployment. Heartbeats after
expiry cannot revive a room; manually ended rooms remain ended.

The API runs cleanup at startup and every 12 hours. Cleanup marks expired
rooms ended and publishes a room update. It retries logged failures and is safe
with multiple API workers. It does not require `pg_cron`; an existing hourly
cron job can coexist because both use the same deadline. Client expiry timers
remove playback controls at the deadline, even before cleanup updates status.
Without an existing cron job, persisted ended status and expiry notifications
can lag the 15-day inactivity deadline by up to 12 hours. This delay does not
extend room usability or allow late activity to revive expired rooms.

Migration `011` repairs non-ended rooms using their last activity, falling back
to creation only for missing activity timestamps. Recently active legacy rooms
with outdated creation-based deadlines remain usable; truly inactive rooms are
ended. Already ended rooms are never reopened. Downgrade removes renewal and
restores creation-based deadlines for non-ended rooms, but preserves ended
status and timestamps.
