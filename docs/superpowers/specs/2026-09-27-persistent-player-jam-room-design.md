# Persistent player and themed Jam Room design

## Goal

Switching between the graphical and terminal Jam Room must not interrupt the
currently playing YouTube video. The graphical room will offer two deliberate
themes—Pulse (dark) and Studio (light)—while TUI remains available as a third
mode.

## Experience

The graphical Jam Room has one music-player-centered composition:

- a session header with invite and end-session actions;
- a now-playing panel with artwork, metadata, source, progress, and DJ
  controls;
- a queue alongside a participant panel; and
- a compact persistent player bar that represents the actual YouTube player.

Pulse is a dark, high-contrast listening interface with a lime accent. Studio
is a light, calm interface with a deep-green accent. A GUI theme control
persists the selected theme locally. TUI does not change its visual language;
its current terminal appearance remains authoritative.

## Playback architecture

`App` owns a `JamPlaybackProvider` that outlives both `JamRoom` and
`TuiJamRoom`. It renders exactly one `YouTubeAutoPlayer` for the active jam
session and exposes a context API to the active surface.

Each surface registers the playback description it derives from its session:
the session ID, playing queue item, resolved YouTube ID, whether the viewer is
the DJ, repeat state, and its queue-advance handler. The provider uses only the
latest registration from the active mode. It clears the player when there is
no DJ-owned playable video or the session changes.

The provider also exposes a stable player ref and command methods (`play`,
`pause`, `seek`, `getTime`, `getDuration`, and `getState`). GUI controls,
terminal commands, Media Session integration, and end-of-song handling use
this shared interface. The iframe component is never conditionally mounted by
either Jam Room surface, so changing UI mode cannot reset video playback.

The player host is permanently rendered by the provider. In GUI it is styled
as the compact player bar; in TUI it is visually minimized without unmounting.
The video view itself is not duplicated in the terminal layout.

## Component boundaries

- `JamPlaybackProvider` owns player lifetime, current registration, player
  event dispatch, and the persistent host.
- `useJamPlayback()` is the sole access point for player registration and
  commands.
- `JamRoom` owns web session data, the graphical layout, queue mutations, and
  theme selection; it no longer mounts `YouTubeAutoPlayer` through
  `NowPlaying`.
- `TuiJamRoom` owns terminal session data and commands; it registers with the
  provider and no longer mounts its own player.
- `NowPlaying` becomes presentation plus calls to the shared player controls.

## State and failure behavior

The playback registration is keyed by session ID and queue-item ID. A stale
registration cannot advance another session or load an old video. If YouTube
resolution has not completed, the provider retains the current video until a
new active registration provides a resolved video ID; it does not destroy and
recreate a usable player during a normal mode switch.

Autoplay restrictions remain unchanged: the provider uses the existing
YouTube IFrame behavior, and no new user gesture requirement is introduced.
Queue status continues to be advanced only by the existing server APIs.

## Verification

- Add focused unit tests for the shared playback registration lifecycle:
  changing visual mode must not create a second player or call `loadVideoById`
  for the same active item.
- Test theme persistence and the GUI-theme toggle independently from TUI mode.
- Run the UI Vitest suite and `npm run build` from `ui/`.
- Manually verify active playback through GUI dark → GUI light → TUI → GUI
  transitions, covering both playing and paused states.

## Out of scope

- Changes to queue database functions, realtime hooks, mobile, authentication,
  or the standalone non-autoplay YouTube preview.
- Persisting a playback time across a browser reload; the uninterrupted-player
  guarantee applies to in-page mode and theme switches.
