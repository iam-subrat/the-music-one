# Shared Queue: Proposed Behavior and UX

Status: design review draft. No product implementation is authorized by this document.

## Goal

People contribute to one room queue and listen independently on their own devices. Nobody needs to hold the DJ token to play. There is no clock synchronization, shared playback position, or promise that listeners hear the same song at the same time.

Review the clickable prototype in [shared-queue-mocks.html](shared-queue-mocks.html). It simulates behavior; it does not play audio or connect to the backend. The decorative record is illustrative, not real album artwork.

## Recommended Mode Control

- Room-level `playback_mode`: `dj` (visible label: DJ-led) or `independent` (visible label: Shared Queue).
- The host selects the mode during creation and can change it later. Participants see the current selection as read-only.
- This is separate from GUI/TUI presentation and local player settings. Changing GUI/TUI never changes the room mode.
- A visible two-option segmented control lives beside room identity in the GUI. On narrow screens it moves below the title, above playback. Keep it visible rather than hiding it inside settings.
- Creation uses mutually exclusive radio options: DJ-led / Shared Queue. DJ-led remains the default to preserve existing behavior.
- Existing `/jam/new` currently creates immediately. Replace that automatic action with a small creation form; retain login redirect behavior and disable repeated submission.
- No separate no-DJ boolean or third synchronized mode. The labels explain the two distinct experiences without promising sync.

Alternative considered: immutable mode at creation. This is safer and smaller, but changing a room's listening style would require another invite. Proposed default is live switching with the transition safeguards below. Alternative considered: per-person independence toggle inside a DJ room. This mixes two queue lifecycles and makes global versus local controls ambiguous, so it is outside this feature.

## GUI States

Shared Queue: heading "Your playback"; every signed-in participant has Play/Pause, Previous, Next, Seek, and personal Repeat. Each row has Play and can show "On your device" for the local current item. The entire eligible list stays visible; finishing a song does not remove it. Participants retain identity and host badges; DJ badges and skip-vote controls are hidden.

DJ-led: retain the existing DJ player, token passing, voting, room repeat, and auto-pilot behavior. This mode does not gain synchronization through this feature. The host may be different from the DJ; room-mode permission follows the host, not the DJ.

The prototype's host is also DJ in the DJ-led example. Production must independently evaluate those two roles.

Shared Queue idle: select the earliest eligible item and show it cued, with Play enabled when resolution is ready. Joining never starts audible playback automatically. Empty queue shows "No songs yet" and the existing add/import controls.

Loading: "Finding playback link"; keep controls disabled until ready. A resolution or player error shows "Couldn't play this song", Retry, and Next. A blocked autoplay state shows "Press Play to continue". Do not report success merely because a play command was issued.

Queue end: "End of your queue"; keep the selected song and allow choosing another. New additions appear immediately but do not restart a stopped player. While playing, additions after the current position are considered when Next or Ended is processed.

No participant listening presence is added in v1. The people list shows membership, not inferred playback. "What everyone is listening to" would require an explicit presence protocol and is a separate follow-up.

## TUI States and Commands

Persistent header: `mode=independent | playback=device` or `mode=dj | playback=dj`. Keep role independently visible. Label the local player "Your playback" and mark its row `YOU`; do not display a global playing status as local playback.

- `mode`: show the current room mode and control scope.
- `mode independent` / `mode dj`: host-only; ask `confirm (y/N)>` before changing an existing room.
- Creation at `/jam/new`: render a terminal creation prompt. `create --mode independent` and `create --mode dj` select explicitly; bare `create` uses DJ-led. This command exists only on the creation screen.
- `play [N]`, `resume`, `pause`, `prev`, `next`, `seek`, `seekend`: local in Shared Queue; preserve DJ restrictions in DJ-led.
- `skip`: alias for local Next in Shared Queue. Its successful output explicitly says "Skipped on this device". In DJ-led preserve vote-to-skip behavior.
- `repeat none|song|queue`: local repeat in Shared Queue; existing room repeat in DJ-led.
- `unvote`, `dj`, room auto-pilot: print "Unavailable in Shared Queue mode". Do not call their backend mutations.
- `add`, playlist import, `invite`, `who`, `clear`, `leave`, `end`: preserve existing scope and permissions. End remains host-only.
- `help` is mode-aware. Reject incomplete numeric input such as `play 2abc`; keep existing aliases and seek syntax.

Confirmation captures the target mode and expected mode version. A role or mode change, session ending, or a stale server response cancels the pending confirmation. Echo the server-accepted mode; do not optimistically announce a room change.

## Independent Playback Lifecycle

One persistent playback owner per client application. GUI and TUI consume the same independent controller; neither owns a second player. Playback is per browser tab/device, not per account. Separate devices and tabs can choose different songs.

Store current item ID, stable position, play intent, repeat mode, and bounded local history in the provider. Persist a versioned checkpoint to `sessionStorage`, keyed by user and session. Save on selection, pause, throttled progress, page hide, and explicit leaving. Refresh restores the selected item and position paused. Never persist tokens or queue metadata into this checkpoint. Logging out clears that user's local playback.

Eligibility in Shared Queue: all non-skipped items, including legacy `queued`, `playing`, and `played`, with successful metadata/playback resolution. Global queue status is historical DJ state; it is never used as independent progress. New additions remain `queued`. Failed/resolving rows are visible but unavailable until resolution succeeds. No bulk reset of existing statuses when changing mode.

Next selects the lowest eligible position greater than the local current position. Repeat Queue wraps to the first eligible item. Repeat Song repeats on natural ending; an explicit Next always goes forward. Previous restarts after more than three seconds, otherwise selects local history/the preceding eligible position. Positions and IDs, not array indices or titles, determine identity. Repeated additions of the same song are distinct items.

At an unavailable next candidate, skip only the local candidate and continue through each candidate at most once. Stop after exhausting the bounded candidate set; do not retry forever or write global `skipped`. Explicit Retry can try the unavailable item again. Local transient failure state can expire/retry on a later manual selection.

Rows that become globally unavailable during listening do not interrupt the loaded current song; retain a local metadata snapshot until it finishes, then choose the next eligible position. Switching mode, leaving, logout, or session ending does interrupt playback. V1 adds no new removal/reorder API; this rule also handles existing skipped/failed rows and future removal events.

SSE queue updates and reconnect fetches change available songs, never the local current track or position. Reconcile checkpoint IDs against the latest queue. If a restored item disappeared, select the first eligible item paused. If a currently loaded item disappears, let it finish. Preserve known current position to locate Next even if its row is missing.

## Live Mode Transitions

Mode changes are serialized with a session row lock and an incrementing `playback_mode_version`. Request: target mode plus expected version. Same-mode requests are idempotent and do not increment or pause. A competing change returns conflict and current state; the client refreshes instead of applying its optimistic choice.

DJ-led to Shared Queue: freeze existing DJ statuses, preserve songs and positions, invalidate old player callbacks and room mutation requests, and pause the current DJ player on receipt of the update. Each device cues the previous global playing item if eligible, otherwise the earliest eligible item, at zero. Repeat defaults to none for a new independent epoch. Nobody starts until they press Play.

Shared Queue to DJ-led: pause local players on receipt of the update; invalidate pending resolution/Ended callbacks; assign the active host as DJ; preserve DJ status history and any previous global playing item. If there is none, the DJ can start the first queued item using existing lifecycle controls. The retained global song is cued at zero; the DJ explicitly resumes/starts. Disable auto-pilot on either direction of mode change. Preserve room repeat setting for returning to DJ-led, but keep it dormant in Shared Queue.

Switching is not simultaneous across disconnected devices. An offline client may continue its already loaded audio until it reconnects. On reconnect or foreground return, fetch authoritative session mode before acting on further queue playback. The feature promises eventual mode convergence, not simultaneous stopping. Stop immediately when a client learns the session ended or reached its known expiration.

## Backend and Database Contract

Add `sessions.playback_mode text NOT NULL DEFAULT 'dj'` with a check constraint and `playback_mode_version integer NOT NULL DEFAULT 0` with a nonnegative check. No listener progress table, synchronized timeline, or playback event stream is needed.

Existing queue storage remains the shared catalog. Keep `play_next`, `play_specific_song`, `play_previous_song`, and `cast_skip_vote` atomic. Guard these functions, token passing, repeat mutation, and auto-pilot against independent mode. Mode check and mutation must share the session lock. Include internal/check_auth=false paths: bypassing user checks must not bypass mode checks.

Legacy room-control requests after a room has switched must supply the expected mode version to avoid an old DJ request succeeding after a switch away and back. Proposed header: `X-Playback-Mode-Version`. Missing version stays backward compatible only for untouched version-0 DJ rooms; mode-version mismatch or independent room returns 409 with an actionable refresh message. Update all modern GUI/TUI/mobile callers. Keep GETs, adding songs, membership, and resolution free of this requirement.

Add an authenticated host-only mode mutation RPC/service. It checks active room, membership, host identity, expected version, and target mode under lock; commits before publishing `session_updated`. Include mode, version, DJ ID, auto-pilot and status in the event. Clients ignore older mode versions and refetch on reconnect. A client getting a future-version queue/control conflict must refetch session state.

- `POST /api/sessions/`: optional body `{playback_mode: "dj" | "independent"}`. No body still creates DJ-led; the old call passes an unused user ID and should be updated carefully.
- Session responses add mode and version. Modern clients treat missing mode as DJ-led for deployment compatibility.
- `PATCH /api/sessions/{id}/playback-mode`: `{mode, expected_version}`; returns full authoritative session response. 401 unauthenticated, 403 unauthorized, 404 missing, 409 ended/stale, 422 invalid mode.
- `POST /api/items/{id}/resolve-playback`: signed-in participant; active Shared Queue room; returns `{item_id, video_id, youtube_url}` or actionable failure. Reuse SongService and YouTube lookup services; validate item/session ownership and direct video ID. Resolve playlist stubs without invoking global play/skip. Persist metadata/link only after checking current mode version again; a mode change while resolving returns conflict without touching queue status. Resolution writes must preserve global status; a failed attempt must not call current `mark_failed` because that writes `skipped`.

Bound concurrent resolution work with existing caching plus an item-scoped lock/cache; verify cross-worker contention and use conditional persistence so one result cannot overwrite a newer canonical link. Reuse existing resolution instead of implementing a second search algorithm. Restrict metadata/link writes to authorized participants; public queue reads retain existing policy.

Existing `add_by_search` does not check membership while URL/batch paths do. Bring search insertion into the same active-participant validation as part of this feature's shared catalog write contract.

## Flags, Compatibility, and Mobile

New flag `INDEPENDENT_PLAYBACK` controls creation/switching into the mode. It is additive and default off. Wire compile-time defaults, backend flags, runtime override, and flag docs in both web and mobile using existing mechanisms. Playback also respects existing YouTube/embed capability configuration. Shared Queue cannot be enabled where playable embeds are disabled.

Turning the feature flag off blocks new independent rooms and transitions into them; already independent rooms remain readable/playable and can switch back to DJ-led. Never reinterpret an existing Shared Queue room as DJ-led because the flag is off.

The checked-in `mobile/` is React/Vite + Capacitor, with `mobile/src/pages/JamRoom.jsx` and `PlayerControls`, not the Expo TypeScript architecture described in AGENTS.md. Plan against these files. Preserve auth/SSE/navigation integrations; avoid adding Expo dependencies. A native device check is still required for WebView user gestures, resume, background behavior, and safe-area controls. If implementation targets another Expo branch instead, revise that adapter plan before coding it.

Old clients cannot offer independent playback. The DB/API mode guards prevent their global commands changing independent rooms. Deploy upgraded clients before enabling the flag; surface a refresh/update message on unsupported-room conflicts. Previously installed mobile clients may require a release/update path.

## Acceptance Conditions

1. Two signed-in participants play different songs/positions. Pause/seek/next/repeat/Ended from A changes neither B nor global queue statuses, votes, DJ role, or room repeat.
2. GUI/TUI switches preserve the same player instance, selected item, position and repeat with no duplicate audio or duplicate Ended handling.
3. Host-only mode transitions confirm, preserve catalog/order, increment version once, pause affected players on receipt, and require explicit resume. Participant attempts fail server-side.
4. Stale requests/callbacks across a switch away and back cannot mutate the queue or restart audio.
5. Existing DJ-led queue controls, votes, repeat, auto-pilot and token passing continue to pass regression tests.
6. Join/reload/end-of-queue never causes unsolicited audio. Resolving/error/blocked/empty/stale states have actionable GUI and TUI output.
7. Playlist imports and metadata/link resolution remain usable by participants without changing queue lifecycle status.
8. Ending/leaving/logout clear playback; reconnect reconciles mode while preserving valid independent progress.
9. Desktop, 390px mobile and keyboard use have no clipped controls or horizontal overflow. GUI themes retain current tokens and TUI retains terminal styling.
10. Migration, staged enablement, backend guards and rollback policy are verified against PostgreSQL; mocks are insufficient proof.

## Review Decisions

Proposed defaults awaiting review: host-controlled live switching; creation chooser with DJ-led default; new independent epoch cues former DJ song at zero; personal state stored per tab; skip alias is local; room votes/auto-pilot unavailable independently; native mobile parity in the same feature rollout; no listening presence or new moderation tools.

After this review, revise the spec and execution plan together, then implement. The implementation plan is a proposed end-to-end breakdown, not a claim that these API signatures or product decisions already exist.
