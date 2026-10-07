# Shared Queue Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution after design and plan approval. No product code should be written during this design review. This is a proposed plan based on the linked draft spec; reconcile approved changes before execution.

**Goal:** Add a host-selected Shared Queue room mode with independent per-device playback across GUI, TUI, and the checked-in mobile client.

**Architecture:** PostgreSQL owns room mode and the catalog; a persistent client provider owns personal playback. API/database guards prevent independent player actions or stale DJ clients changing global playback. Reuse existing SSE, queue hooks, YouTube resolver and persistent player instead of adding synchronization infrastructure.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL functions/RLS, React/Vite, Vitest, Playwright, and current Capacitor mobile client.

**Spec:** [Shared Queue behavior and UX](shared-queue-design.md)

## Global Constraints

- `dj` / `independent` are the only mode values; visible names are DJ-led / Shared Queue.
- Per-device progress never writes global queue status; global DJ lifecycle stays server-side and atomic.
- Host permission and DJ permission are separate; only host changes room mode.
- Preserve existing queue position identity, catalog history, auth, SSE and GUI themes.
- GUI/TUI use one player owner and one personal cursor. No new sync protocol or listener-progress database table.
- `INDEPENDENT_PLAYBACK` is default off; disabling it does not reinterpret existing rooms.
- Scope includes current Capacitor mobile, not an assumed Expo rewrite.
- New mode epochs and reloads require explicit Play. No automatic audio after a live mode change.
- This phase delivers design artifacts only. Tests listed below are execution requirements, not checks already run.

## Review Focus

- Delayed DJ mutations after switching away and back: version check and session lock must reject them.
- Playlist stubs resolving during a switch: metadata resolution must not skip or advance global status.
- Fast double Next/Ended and GUI/TUI remounts: current item transitions exactly once with one player.
- Cross-tab/user leakage: cursor is per tab/user/session and clears on logout; mode events still converge.
- Slow/offline devices and blocked autoplay: reconcile authoritative mode on reconnect, report paused/blocked state accurately.

## Repository Findings

- `ui/src/App.jsx` owns `/jam/new` and immediately calls `createSession`; there is no checked-in JamLobby component to extend.
- `ui/src/playback/JamPlaybackContext.jsx` keeps the iframe mounted while GUI/TUI swap. Its descriptor preservation is currently DJ-specific.
- `ui/src/playback/useResolvedYouTubeVideo.js` currently resolves only for the DJ and can persist a link.
- `ui/src/tui/TuiJamRoom.jsx` finds global `status === playing` and DJ-gates transport commands.
- Backend queue endpoints are in `api/app/routers/sessions.py` and `items.py`, not a separate queue router.
- Backend `mark_failed` sets global `skipped`; independent resolution must avoid that method.
- Unlike the supplied AGENTS.md description, current UI has `npm run test` (Vitest) and `npm run test:e2e` (Playwright). Current mobile uses Capacitor/Vite.
- The queue catalog API already returns all statuses ordered by position; do not create another catalog endpoint unnecessarily.

## Delivery Order

Each task is a reviewable increment. New behavior remains behind its default-off flag until backend guards and all supported clients are ready. Use task-scoped commits during implementation, after passing each focused verification.

### Task 1: Mode Schema and Atomic Database Guards

**Modify:** `api/app/models/session.py`, `api/app/schemas/session.py`.
**Create:** a new Alembic revision under `api/migrations/versions/`, `api/tests/test_independent_mode_database.py`.
**Read first:** current Alembic head and latest versions of `play_next`, `play_specific_song`, `play_previous_song`, `cast_skip_vote`, `pass_dj_token`, `set_repeat_mode`, DJ leave trigger, and auto-pilot updates. Do not edit historical migrations.

**Produces:** mode columns, serialized mode transition and version-aware room control functions. The transition contract is `(session_id, actor_id, target_mode, expected_version) -> authoritative session`.

- [ ] Write PostgreSQL integration cases: default DJ/version 0; invalid mode rejected; host changes mode; nonhost/ended room fails; same mode no-ops; two changes with one expected version allow one success.
- [ ] Add cases for every global playback/vote mutation in independent mode, including internal `check_auth=false` calls and direct RPC use. Assert status, votes and position remain unchanged.
- [ ] Add switch `dj -> independent -> dj` case where a version-0 delayed request is rejected; no version accepted only in untouched version-0 DJ rooms.
- [ ] Add lock interleaving cases: advance versus mode change, vote versus mode change, link resolution versus mode change. Verify one serialized outcome without a partial queue mutation.
- [ ] Add model columns/checks and the migration. Acquire the session lock before mode/version checking in each touched mutation. Preserve previous function semantics in DJ mode.
- [ ] Run focused PostgreSQL tests with existing database fixtures. Apply migration to a staging copy and verify counts/status/order before and after both switches.
- [ ] Define downgrade: first require no independent rooms, drain/reject switched-room requests, then restore prior function bodies and drop columns. Never blindly drop mode columns on an active Shared Queue database.
- [ ] Commit the schema/guard increment after verification.

### Task 2: Mode API, Resolution API, and Event Contract

**Modify:** `api/app/routers/sessions.py`, `api/app/routers/items.py`, `api/app/services/session_service.py`, `api/app/services/queue_service.py`, `api/app/repositories/session_repo.py`, `api/app/repositories/queue_repo.py`, `api/app/schemas/session.py`.
**Test:** extend `api/tests/test_sessions.py`, `api/tests/test_queue_service.py`, `api/tests/test_participant_authz.py`; create `api/tests/test_independent_playback.py`.

**Consumes:** task 1 mode/version database contract and existing SongService/YouTube lookup.
**Produces:** optional creation mode; full session mode responses; host mode PATCH; participant resolution endpoint; committed SSE event.

- [ ] Write API tests using these exact requests: no-body create, `{playback_mode:'independent'}` create, mode PATCH `{mode:'independent',expected_version:0}`, stale PATCH, unsupported mode, outsider, ended room.
- [ ] Assert accepted mode PATCH publishes `session_updated` only after commit, with mode/version/DJ/auto-pilot fields; failures publish nothing.
- [ ] Write resolution tests for direct link, search link, playlist stub, unknown item, nonparticipant, inactive room, duplicate callers, failure and mode change during lookup. Assert global status/position and votes are unchanged.
- [ ] Add active-participant validation to search additions; exercise URL/search/batch uniformly. Error status must map to actionable 403/409, not an unhandled 500.
- [ ] Implement creation and mode mutation schemas using literal mode values and nonnegative expected version. Map database conflicts consistently to 409.
- [ ] Read `X-Playback-Mode-Version` on global control mutations and pass it to atomic guards. Guard before recommendation/resolution work and recheck under lock when committing.
- [ ] Implement participant resolution by reusing existing metadata and YouTube lookup services. Metadata failure changes resolution state only; never global lifecycle. Persist canonical link conditionally and handle cross-worker concurrent results.
- [ ] Run focused API tests; confirm old no-body creation and untouched DJ controls stay compatible. Commit.

### Task 3: Shared Personal Playback Controller

**Modify:** `ui/src/playback/JamPlaybackContext.jsx`, `ui/src/playback/useResolvedYouTubeVideo.js`, `ui/src/components/YouTubeAutoPlayer.jsx`, `ui/src/hooks/useMediaSession.js`.
**Create:** `ui/src/playback/independentQueue.js`, `ui/src/playback/useIndependentPlayback.js` and corresponding Vitest tests.
**Test:** extend `ui/src/playback/JamPlaybackContext.test.jsx` and resolver tests.

**Consumes:** catalog items sorted by position, authoritative mode/version, task 2 resolution endpoint.
**Produces:** shared local transport API for GUI/TUI; mode-aware playback descriptor; versioned checkpoint; accurate player readiness/error/blocked status.

- [ ] Write selection tests: played/playing remain eligible; skipped/failed excluded; duplicate titles remain distinct; Next uses stable position; repeat wraps; explicit Next overrides repeat song; Previous uses three-second rule; removed current retains position.
- [ ] Write race tests: Ended twice, Next during resolution, mode epoch change during resolution, stale callback after GUI/TUI swap. Exactly one current-item change; zero global mutations.
- [ ] Write persistence cases for tab/user/session isolation, malformed checkpoint, missing ID, logout, session end, reload paused, and large/expired history. Use bounded storage and recover gracefully when storage is unavailable.
- [ ] Extract pure selection logic and use it from one provider/controller. Avoid duplicating cursor state in pages.
- [ ] Extend descriptor with `playbackMode`, `modeVersion`, transport callbacks, and player readiness. Remove the assumption that only a DJ descriptor can preserve playback across surface changes.
- [ ] Resolve ready selected items via task 2; invalidate old promises by selection token plus epoch. Try failed candidates at most once per advancement.
- [ ] Extend player events to expose ready/buffering/playing/paused/error/autoplay-blocked. Support cueing without autoplay for new epochs/reload; retain iframe when swapping surfaces.
- [ ] Connect media-session Next/Previous to local transport in independent mode and retain DJ behavior otherwise. Prevent natural repeat and explicit Next from sharing the same callback.
- [ ] Run `npm run test -- src/playback` from `ui/`; expand to component tests changed by the descriptor. Commit.

### Task 4: GUI Creation, Room Mode, and Personal Controls

**Modify:** `ui/src/App.jsx`, `ui/src/pages/JamRoom.jsx`, `ui/src/lib/session.js`, `ui/src/lib/queue.js`, `ui/src/hooks/useSession.js`, `ui/src/styles/jam.module.css`, existing NowPlaying/QueueList components where applicable.
**Create:** `ui/src/pages/JamCreate.jsx`, `ui/src/components/PlaybackModeControl.jsx` and focused component tests.

**Consumes:** task 2 APIs and task 3 local controller. **Produces:** proposed GUI mock flows with existing styling and real permissions.

- [ ] Write creation tests for default DJ, explicit independent, login return, submit failure, double-click prevention, and flag disabled.
- [ ] Write mode-control cases for host versus DJ versus participant; confirm/cancel; stale response; session ended while confirming; disabled during request; read-only participant selection.
- [ ] Write independent room transport tests: row Play, Next, personal Repeat and Seek call only local controller; catalog updates never jump current audio. Keep mode-independent membership/add/import behaviors.
- [ ] Implement creation chooser replacing immediate `/jam/new` side effect. Respect successful server response and existing invite route.
- [ ] Put the segmented mode control beside room identity with responsive wrapping. Use existing icon conventions/tooltips for transport; keep GUI/TUI toggle visually separate.
- [ ] Render Your playback and full eligible catalog in Shared Queue; hide votes/DJ token/room auto-pilot. Render idle/loading/error/blocked/end-of-queue states from the controller.
- [ ] On accepted remote mode version change pause/invalidate/cue as specified. Ignore older SSE mode versions; fetch authoritative mode on reconnect/foreground return.
- [ ] Run focused component tests and production UI build. Check dark/studio GUI themes at desktop and mobile widths. Commit.

### Task 5: TUI Creation and Mode-Aware Commands

**Modify:** `ui/src/tui/TuiJamRoom.jsx`, `ui/src/tui/TerminalShell.jsx` only if the status surface needs extension, `ui/src/tui/tui.module.css`, new JamCreate surface from task 4.
**Create/Test:** `ui/src/tui/TuiJamRoom.test.jsx` and mode-command parser tests if extracting the parser removes actual duplication.

**Consumes:** same APIs/controller as GUI. **Produces:** mode commands, terminal creation and local playback command scope.

- [ ] Write command cases: `mode`, valid/invalid target, nonhost, y/N, role/session/version changes while confirming, stale PATCH, strict `play N`, negative/relative seeks and unknown commands.
- [ ] Write independent `play/pause/next/prev/seek/seekend/repeat/skip` cases asserting no global queue/vote/repeat request. Assert `dj`/`unvote`/auto-pilot are unavailable and mode-aware help matches execution.
- [ ] Write GUI -> TUI -> GUI case while playing to prove same current ID, time, repeat and iframe instance.
- [ ] Implement terminal creation commands on creation screen; keep in-room commands separate.
- [ ] Add permanent mode/scope status; local row marker YOU; pending mode confirmation carries expected version and displays only confirmed server success.
- [ ] Keep aliases and history/focus conventions. Distinguish `skip` local success text from ordinary Next; preserve DJ-led voting behavior.
- [ ] Run TUI/component tests and existing playback E2E suite. Commit.

### Task 6: Current Mobile Client Parity

**Modify:** `mobile/src/App.jsx`, `mobile/src/pages/JamRoom.jsx`, `mobile/src/components/PlayerControls.jsx`, `mobile/src/lib/session.js`, `mobile/src/lib/queue.js`, actual mobile player/resolver and flag files located at execution time.
**Create:** mobile JamCreate and independent controller adapter following existing client boundaries. Add an appropriate focused test harness only where existing tooling cannot verify the new controller; do not rewrite mobile infrastructure.

**Consumes:** same backend contracts/selection semantics; no cross-device checkpoint. **Produces:** room-mode chooser and independent local mobile playback.

- [ ] Locate actual mobile player ownership and lifecycle before edits; share the pure selection policy through an existing supported module boundary or use explicit parity cases rather than adding a new packaging system.
- [ ] Implement local per-tab/WebView session cursor, mode/version transitions, personal controls and resolution. Treat older rooms without mode field as DJ-led.
- [ ] Add visible/read-only mode control with host confirmation; preserve invite/auth flows and local playback after returning from foreground.
- [ ] Check two device contexts choosing different songs, local Next, blocked autoplay, resolution failure, reload paused, and remote mode switch.
- [ ] Run `npm run build` and `npm run lint` from `mobile/`. Verify on a physical iOS device or simulator/WebView with current Capacitor tooling; record any unavailable device check explicitly.
- [ ] Commit. No Expo documentation/dependencies needed unless the target branch changes to Expo.

### Task 7: Flags, Cross-Client Proof, and Rollout

**Modify:** `ui/src/lib/flags.js`, `ui/vite.config.js`, equivalent mobile flag config, backend flag declarations, flag documentation/deployment config using existing paths discovered before editing.
**Create/Test:** `ui/e2e/independent-playback.spec.js`; extend migration/API regressions and feature documentation.

**Consumes:** tasks 1-6. **Produces:** acceptance evidence and a safely enabled feature.

- [ ] Wire default-off `INDEPENDENT_PLAYBACK` through static/runtime/backend gates. Assert existing independent rooms remain playable when disabled, and switching back to DJ remains allowed.
- [ ] Build two Playwright browser contexts with separate authenticated fixtures. A plays item 1 and B item 3; A pause/seek/Next/Ended leaves B's cursor and database queue statuses unchanged. Stub player timing deterministically; also perform one real embedded-player smoke check.
- [ ] Add integrated switch/cancel/conflict/nonhost tests, delayed old mutations, resolving imports, additions at end, unavailable rows, SSE reconnect, logout/end, checkpoint reload, media buttons, and GUI/TUI iframe continuity.
- [ ] Check screenshots and overflow at 1440x900, 768x1024, 390x844, 320x740 for GUI room/create/dialog and TUI room/create. Exercise keyboard focus and confirmation cancellation.
- [ ] Run `uv run pytest` from `api/` with PostgreSQL configured; `npm run test`, `npm run build`, `npm run test:e2e` from `ui/`; mobile build/lint and recorded device proof. Diagnose failures before expanding scope.
- [ ] Deploy schema then backend guards with flag off; deploy compatible web/mobile; enable staging; verify real participant flow and log errors; then enable production gradually.
- [ ] Record mode changes/conflicts, resolution successes/failures and local player failures through existing logs/analytics. Avoid logging URLs, tokens, personal listening history or per-second progress. No new analytics vendor or dashboard is required.
- [ ] Rollback by disabling creation/transition into independent mode while retaining working compatible clients/backend. Do not revert clients or downgrade schema while active independent rooms exist. To fully revert, end/convert those rooms with explicit host action first and verify none remain.
- [ ] Update docs with final API/command contracts and actual acceptance evidence; commit final integration increment.

## Completion Evidence Required

Record tested commit, commands and results, PostgreSQL migration/concurrency proof, screenshots, two-context isolation, same-player GUI/TUI proof, and mobile device outcome. Unit mocks alone cannot establish actual browser autoplay behavior, audio continuity or database locking correctness.

## Review Gate

Review mocks and proposed defaults in the spec first. Revise this plan to match selected behavior; it intentionally does not contain invented final code bodies before those UX choices are settled. Implementation starts only after the user approves the design and plan. Recommended execution is inline, following the task order above.
