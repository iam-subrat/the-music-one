# Persistent Player Jam Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship dark and light graphical Jam Room themes plus the existing TUI, all controlled by one YouTube iframe that continues playing through every in-page mode or theme switch.

**Architecture:** Extract YouTube resolution and persistent-player ownership from the two Jam Room surfaces into a `JamPlaybackProvider` mounted above the routes. The active GUI or TUI registers the same session-scoped playback descriptor with that provider; the provider owns the only `YouTubeAutoPlayer`, Media Session binding, and persistent host. The graphical room remains a presentation surface with a locally persisted light/dark theme, while TUI continues to register controls without mounting a player.

**Tech Stack:** React 18, React Context, Vite, Vitest, React Testing Library, YouTube IFrame API, CSS modules.

**Spec:** `docs/superpowers/specs/2026-09-27-persistent-player-jam-room-design.md`

## Global Constraints

- Keep queue changes server-authoritative through existing `playNext`, `playPrevious`, and `playSpecificSong` APIs.
- Render exactly one `YouTubeAutoPlayer` per page; neither `NowPlaying` nor `TuiJamRoom` may mount it.
- The persistent player is keyed by `sessionId` and `queueItemId`; stale mode registrations must not load or advance another song.
- Pulse is dark with lime accent; Studio is light with deep-green accent; TUI keeps its current terminal design.
- Persist only the selected GUI theme locally. Do not persist player position across browser reloads.
- Do not change the mobile application or the non-autoplay YouTube preview behavior.

## Review Focus

- A GUI ↔ TUI switch during an active song preserves the original player instance and does not call `loadVideoById` for the same `queueItemId`.
- A switch after DJ ownership changes clears controls and never lets a former DJ advance the queue.
- A delayed YouTube resolution for an old queue item cannot replace a newer active item.
- Paused playback remains paused through GUI dark ↔ Studio theme switches and GUI ↔ TUI switches.
- A fresh browser load uses the stored GUI theme but never applies GUI theming to TUI.
- Skip-vote state and its majority-triggered queue refresh remain correct after every GUI/TUI/theme transition.
- DJ transfer revokes the former DJ's player controls and enables the recipient's controls without replacing an active player for the same song.
- GUI seekbar dragging and TUI `seek`/`seekend` issue exactly one shared-player seek, retain the requested position through a mode switch, and never alter queue status.
- GUI and TUI retain URL adds, title/artist search adds, and playlist import selection without recreating the shared player or losing the active queue item.

## File structure

- Create: `ui/src/playback/resolveYouTubeVideo.js` — pure URL/query resolution helpers shared by GUI and TUI.
- Create: `ui/src/playback/useResolvedYouTubeVideo.js` — lifecycle-safe resolver hook keyed by queue item and DJ state.
- Create: `ui/src/playback/JamPlaybackContext.jsx` — provider, registration API, single player host, shared player commands, and Media Session owner.
- Create: `ui/src/playback/JamPlaybackContext.test.jsx` — regression proof for registration replacement and the one-player invariant.
- Create: `ui/src/playback/resolveYouTubeVideo.test.js` — resolver behavior for direct, search, fallback, and stale results.
- Modify: `ui/src/App.jsx` — mount `JamPlaybackProvider` once around the routed app.
- Modify: `ui/src/components/NowPlaying.jsx` — register GUI playback and use shared commands; remove local resolver, media session, and player mount.
- Modify: `ui/src/tui/TuiJamRoom.jsx` — register TUI playback and consume shared commands; remove local resolver, media session, and player mount.
- Modify: `ui/src/tui/TuiContext.jsx` — retain TUI toggle and add persisted GUI theme state without coupling it to playback.
- Modify: `ui/src/pages/JamRoom.jsx` — add the graphical theme switcher and player-centered layout hooks.
- Modify: `ui/src/styles/jam.module.css` — implement Pulse/Studio variables and responsive graphical layout.
- Modify: `ui/src/tui/tui.module.css` only if required to visually minimize the provider-owned host; do not restyle terminal panels.
- Modify: `ui/src/components/NowPlaying.test.jsx` (create if absent) — cover shared control rendering and theme-independent semantics.

### Task 1: Extract deterministic YouTube resolution

**Files:**
- Create: `ui/src/playback/resolveYouTubeVideo.js`
- Create: `ui/src/playback/resolveYouTubeVideo.test.js`
- Create: `ui/src/playback/useResolvedYouTubeVideo.js`

**Interfaces:**
- Consumes: `extractYouTubeId`, `isYouTubeSearchUrl`, `extractSearchQuery` from `ui/src/lib/platform.js`; `api` from `ui/src/lib/api.js`; `patchYouTubeLink` from `ui/src/lib/queue.js`.
- Produces: `resolveYouTubeVideo(item, request)` returning `Promise<{ videoId: string | null, title: string | null, persisted: boolean }>` and `useResolvedYouTubeVideo(item, isDJ)` returning `{ videoId, resolvedTitle }`.

- [x] **Step 1: Write failing resolver tests**

```js
import { describe, expect, test, vi } from "vitest";
import { resolveYouTubeVideo } from "./resolveYouTubeVideo";

test("returns a direct YouTube ID without requesting a search", async () => {
  const request = vi.fn();
  const result = await resolveYouTubeVideo(
    { id: "q1", platform_links: { youtube: "https://youtu.be/abc123def45" } },
    request,
  );
  expect(result).toEqual({ videoId: "abc123def45", title: null, persisted: false });
  expect(request).not.toHaveBeenCalled();
});

test("uses title and artist fallback and returns the resolved result", async () => {
  const request = vi.fn().mockResolvedValue({ id: "fallback000", title: "Resolved title" });
  const result = await resolveYouTubeVideo(
    { id: "q2", title: "Song", artist: "Artist", platform_links: {} },
    request,
  );
  expect(request).toHaveBeenCalledWith("Song Artist");
  expect(result).toMatchObject({ videoId: "fallback000", title: "Resolved title" });
});
```

- [x] **Step 2: Run the focused test and verify it fails because the resolver does not exist**

Run: `cd ui && npm test -- src/playback/resolveYouTubeVideo.test.js`

Expected: FAIL with an unresolved import for `./resolveYouTubeVideo`.

- [x] **Step 3: Implement the pure resolver and lifecycle-safe hook**

```js
export async function resolveYouTubeVideo(item, request) {
  const url = item.platform_links?.youtube || item.platform_links?.youtubemusic;
  const directId = extractYouTubeId(url);
  if (directId) return { videoId: directId, title: null, persisted: false };
  const query = url && isYouTubeSearchUrl(url)
    ? extractSearchQuery(url)
    : `${item.title} ${item.artist}`;
  if (!query) return { videoId: null, title: null, persisted: false };
  const result = await request(query);
  return { videoId: result.id || null, title: result.title || null, persisted: !isYouTubeSearchUrl(url) && !!result.id };
}
```

In `useResolvedYouTubeVideo`, keep an incrementing request token in a ref. Reset the displayed result when `item?.id` or `isDJ` changes; only commit a result when the current token still matches and invoke `patchYouTubeLink` only for the current fallback item.

- [x] **Step 4: Add the stale-result hook test before implementation is finalized**

```jsx
test("ignores a late result for the previous queue item", async () => {
  const first = deferred();
  mockApi.mockImplementationOnce(() => first.promise).mockResolvedValueOnce({ id: "new-video" });
  const { rerender } = render(<Probe item={oldItem} isDJ />);
  rerender(<Probe item={newItem} isDJ />);
  first.resolve({ id: "old-video" });
  await waitFor(() => expect(screen.getByText("new-video")).toBeInTheDocument());
  expect(screen.queryByText("old-video")).not.toBeInTheDocument();
});
```

- [x] **Step 5: Run focused tests and commit**

Run: `cd ui && npm test -- src/playback/resolveYouTubeVideo.test.js`

Expected: PASS.

```bash
git add ui/src/playback/resolveYouTubeVideo.js ui/src/playback/resolveYouTubeVideo.test.js ui/src/playback/useResolvedYouTubeVideo.js
git commit -m "refactor: share YouTube video resolution"
```

### Task 2: Build and prove the persistent playback provider

**Files:**
- Create: `ui/src/playback/JamPlaybackContext.jsx`
- Create: `ui/src/playback/JamPlaybackContext.test.jsx`
- Modify: `ui/src/App.jsx`

**Interfaces:**
- Consumes: `YouTubeAutoPlayer`, `useMediaSession`, `FLAGS.AUTO_PLAY_QUEUE`.
- Produces: `JamPlaybackProvider` and `useJamPlayback()` with `{ registerPlayback(descriptor), playerRef, play, pause, seek, getTime, getDuration, getState }`.
- `descriptor` shape: `{ sessionId, queueItemId, videoId, enabled, repeat, metadata, onEnded }`.

- [x] **Step 1: Write the player-lifetime regression test**

```jsx
vi.mock("../components/YouTubeAutoPlayer", () => ({
  default: forwardRef(({ videoId }, ref) => {
    useImperativeHandle(ref, () => ({ play: vi.fn(), pause: vi.fn(), seek: vi.fn(), getState: () => 1 }));
    return <div data-testid="youtube-player" data-video-id={videoId} />;
  }),
}));

test("keeps one player mounted when a TUI registration replaces the GUI registration for the same item", () => {
  const view = render(<JamPlaybackProvider><Registration mode="gui" descriptor={active} /></JamPlaybackProvider>);
  const player = screen.getByTestId("youtube-player");
  view.rerender(<JamPlaybackProvider><Registration mode="tui" descriptor={active} /></JamPlaybackProvider>);
  expect(screen.getByTestId("youtube-player")).toBe(player);
  expect(screen.getAllByTestId("youtube-player")).toHaveLength(1);
});
```

- [x] **Step 2: Run the focused test and verify it fails because the context does not exist**

Run: `cd ui && npm test -- src/playback/JamPlaybackContext.test.jsx`

Expected: FAIL with an unresolved import for `JamPlaybackContext`.

- [x] **Step 3: Implement provider registration without conditional player ownership**

```jsx
const PlaybackContext = createContext(null);

export function JamPlaybackProvider({ children }) {
  const playerRef = useRef(null);
  const [descriptor, setDescriptor] = useState(null);
  const registerPlayback = useCallback((next) => {
    setDescriptor(current => samePlayback(current, next) ? { ...current, ...next } : next);
  }, []);
  const api = useMemo(() => ({
    registerPlayback,
    playerRef,
    play: () => playerRef.current?.play(),
    pause: () => playerRef.current?.pause(),
    seek: (seconds) => playerRef.current?.seek(seconds),
    getTime: () => playerRef.current?.getTime() ?? 0,
    getDuration: () => playerRef.current?.getDuration() ?? 0,
    getState: () => playerRef.current?.getState() ?? -1,
  }), [registerPlayback]);
  return <PlaybackContext.Provider value={api}>{children}<PersistentPlayer descriptor={descriptor} playerRef={playerRef} /></PlaybackContext.Provider>;
}
```

`samePlayback` must compare `sessionId`, `queueItemId`, and `videoId`. `PersistentPlayer` renders no player until `descriptor.enabled && descriptor.videoId`; once mounted, it changes video only when those playback keys change. Its `onEnded` callback reads the latest descriptor from a ref, so the active surface can replace its handler without remounting the iframe. Move the existing `useMediaSession` call here with provider-owned metadata and controls.

- [x] **Step 4: Add mode replacement, stale descriptor, and paused-state tests**

```jsx
test("does not replace active playback with a descriptor from another session after cleanup", () => {
  // Register session A, unregister it, then deliver an old session-A update after session B.
  // Assert the player data-video-id remains session B's video.
});

test("leaves a paused shared player paused when the registering surface changes", () => {
  // Mock getState() as 2, replace GUI registration with identical TUI registration,
  // and assert no play() command was called.
});
```

- [x] **Step 5: Mount the provider once in `App` and run tests**

Wrap the route tree and global GUI chrome in `<JamPlaybackProvider>`. Do not key the provider by `tuiMode` or by route component, because either key would recreate the player.

Run: `cd ui && npm test -- src/playback/JamPlaybackContext.test.jsx`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add ui/src/playback/JamPlaybackContext.jsx ui/src/playback/JamPlaybackContext.test.jsx ui/src/App.jsx
git commit -m "feat: keep Jam playback alive across modes"
```

### Task 3: Migrate graphical Jam playback to the provider

**Files:**
- Modify: `ui/src/components/NowPlaying.jsx`
- Create: `ui/src/components/NowPlaying.test.jsx`

**Interfaces:**
- Consumes: `useResolvedYouTubeVideo` and `useJamPlayback` from Tasks 1–2.
- Produces: the same `NowPlaying` public props; it registers its descriptor in an effect and displays shared controls through provider methods.

- [x] **Step 1: Write the failing consumer test**

```jsx
test("registers the active GUI song without mounting its own YouTube player", async () => {
  render(<JamPlaybackProvider><ToastProvider><NowPlaying {...playingProps} /></ToastProvider></JamPlaybackProvider>);
  await waitFor(() => expect(screen.getByTestId("youtube-player")).toHaveAttribute("data-video-id", "video-123"));
  expect(screen.getAllByTestId("youtube-player")).toHaveLength(1);
});
```

- [x] **Step 2: Run the test and verify it fails against the local-player implementation**

Run: `cd ui && npm test -- src/components/NowPlaying.test.jsx`

Expected: FAIL because `NowPlaying` still imports and renders a local `YouTubeAutoPlayer`.

- [x] **Step 3: Replace local player ownership with descriptor registration**

Remove `YouTubeAutoPlayer`, `useMediaSession`, `ytPlayerRef`, and the duplicated resolver effect from `NowPlaying`. Obtain `{ videoId, resolvedTitle }` from `useResolvedYouTubeVideo(nowPlaying, isDJ)` and register:

```jsx
useEffect(() => registerPlayback({
  sessionId,
  queueItemId: nowPlaying?.id ?? null,
  videoId,
  enabled: !!(FLAGS.AUTO_PLAY_QUEUE && isDJ && nowPlaying && videoId),
  repeat: repeatMode === "song",
  metadata: nowPlaying && { title: nowPlaying.title, artist: nowPlaying.artist, artwork: nowPlaying.thumbnail_url },
  onEnded: handleEnded,
}), [sessionId, nowPlaying?.id, videoId, isDJ, repeatMode, registerPlayback, handleEnded]);
```

Use the shared `seek`, `play`, and `getTime` methods in previous/next and repeat controls. Preserve the current queue fallback behavior and analytics events exactly.

- [x] **Step 4: Add an empty-queue and non-DJ registration test**

```jsx
test("does not enable shared playback when a viewer is not the DJ", async () => {
  render(<JamPlaybackProvider><ToastProvider><NowPlaying {...playingProps} isDJ={false} /></ToastProvider></JamPlaybackProvider>);
  expect(screen.queryByTestId("youtube-player")).not.toBeInTheDocument();
});
```

- [x] **Step 5: Run focused tests and commit**

Run: `cd ui && npm test -- src/components/NowPlaying.test.jsx src/playback/JamPlaybackContext.test.jsx`

Expected: PASS.

```bash
git add ui/src/components/NowPlaying.jsx ui/src/components/NowPlaying.test.jsx
git commit -m "refactor: connect graphical Jam controls to shared player"
```

### Task 4: Migrate TUI commands to the provider

**Files:**
- Modify: `ui/src/tui/TuiJamRoom.jsx`
- Modify: `ui/src/playback/JamPlaybackContext.test.jsx`

**Interfaces:**
- Consumes: `useResolvedYouTubeVideo`, `useJamPlayback`, current TUI queue/session hooks.
- Produces: TUI `play`, `pause`, `seek`, `seekend`, `prev`, and `next` commands backed by the provider-owned player.

- [x] **Step 1: Extend the provider test with a TUI command probe**

```jsx
test("exposes a stable seek command after GUI registration is replaced by TUI", () => {
  render(<JamPlaybackProvider><Registration descriptor={active} /><CommandProbe /></JamPlaybackProvider>);
  fireEvent.click(screen.getByRole("button", { name: "seek" }));
  expect(mockPlayer.seek).toHaveBeenCalledWith(42);
});
```

- [x] **Step 2: Run it and verify it fails before TUI consumes the shared commands**

Run: `cd ui && npm test -- src/playback/JamPlaybackContext.test.jsx`

Expected: FAIL until the provider command API is complete.

- [x] **Step 3: Remove TUI-local player and resolution state**

Delete `YouTubeAutoPlayer`, `useMediaSession`, `ytPlayerRef`, `ytId`, `ytResolveKey`, and the duplicated YouTube-resolution effect from `TuiJamRoom`. Resolve the video through `useResolvedYouTubeVideo(nowPlaying, isDJ)` and register the same descriptor with its TUI-specific `onEnded` function. Replace every `ytPlayerRef.current` use with the matching `useJamPlayback()` command/method.

- [x] **Step 4: Verify no TUI render owns a player and test provider behavior**

Run: `rg -n "YouTubeAutoPlayer|useMediaSession|ytPlayerRef" ui/src/tui/TuiJamRoom.jsx`

Expected: no matches.

Run: `cd ui && npm test -- src/playback/JamPlaybackContext.test.jsx`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add ui/src/tui/TuiJamRoom.jsx ui/src/playback/JamPlaybackContext.test.jsx
git commit -m "refactor: route TUI commands through shared player"
```

### Task 5: Add persisted GUI themes and player-centered graphical layout

**Files:**
- Modify: `ui/src/tui/TuiContext.jsx`
- Modify: `ui/src/pages/JamRoom.jsx`
- Modify: `ui/src/styles/jam.module.css`
- Modify: `ui/src/components/NowPlaying.jsx`
- Modify: `ui/src/components/NowPlaying.test.jsx`

**Interfaces:**
- Consumes: `useTui()`.
- Produces: `guiTheme: "pulse" | "studio"` and `setGuiTheme(theme)` alongside existing `tuiMode`, `toggleTui`, and `setTui`.

- [x] **Step 1: Write failing theme-persistence tests**

```jsx
test("restores Studio as the graphical theme", () => {
  localStorage.setItem("musicone:gui-theme", "studio");
  render(<TuiProvider><ThemeProbe /></TuiProvider>);
  expect(screen.getByText("studio")).toBeInTheDocument();
});

test("does not set graphical theme markup while terminal mode is active", () => {
  render(<TuiProvider><ThemeProbe /></TuiProvider>);
  // Toggle TUI, then assert the probe exposes tuiMode and no JamRoom theme class is applied by the provider.
});
```

- [x] **Step 2: Run the focused test and verify it fails because GUI theme is absent**

Run: `cd ui && npm test -- src/components/NowPlaying.test.jsx`

Expected: FAIL with missing `guiTheme`/`setGuiTheme` context values.

- [x] **Step 3: Add theme state and the GUI switcher**

Add a second storage key, `musicone:gui-theme`, in `TuiContext`. Validate the initial value so any unknown stored value becomes `"pulse"`. Persist only valid selections. In `JamRoom`, add an accessible two-option toggle with labels `Pulse` and `Studio`, `aria-pressed` state, and `setGuiTheme`. Apply `${s.jamRoom} ${s[guiTheme]}` to the graphical room root; do not apply it to `TerminalShell`.

- [x] **Step 4: Implement responsive Pulse and Studio CSS variables**

Define theme variables on `.jamRoom.pulse` and `.jamRoom.studio` for canvas, surface, foreground, muted foreground, border, and accent. Rework existing layout selectors to consume those variables: session header, now-playing artwork/meta/control block, queue, participant card, and provider-owned player host. At narrow widths stack the queue and participant surface; retain full-size text and accessible controls. Give Studio opaque light surfaces, deep-green controls, and readable secondary copy; give Pulse opaque near-black surfaces and lime active controls.

- [x] **Step 5: Keep the persistent player host visible only where appropriate**

Add a provider host class that renders as a compact bottom player bar for graphical Jam routes. When `document.documentElement.dataset.tui === "1"`, minimize it to an off-layout 1px host without using `display: none`, so the iframe remains active. Never conditionally render or key the host on GUI theme or `tuiMode`.

- [x] **Step 6: Run focused tests and commit**

Run: `cd ui && npm test -- src/components/NowPlaying.test.jsx src/playback/JamPlaybackContext.test.jsx`

Expected: PASS.

```bash
git add ui/src/tui/TuiContext.jsx ui/src/pages/JamRoom.jsx ui/src/styles/jam.module.css ui/src/components/NowPlaying.jsx ui/src/components/NowPlaying.test.jsx
git commit -m "feat: add Pulse and Studio Jam room themes"
```

### Task 6: Full verification and interaction smoke test

**Files:**
- Modify: only files required to correct verified test or build failures from Tasks 1–5.

**Interfaces:**
- Consumes: all completed tasks.
- Produces: a buildable UI with focused regression proof and documented manual playback verification.

- [x] **Step 1: Run the complete UI test suite**

Run: `cd ui && npm test`

Expected: PASS with no failing existing test.

- [x] **Step 2: Run the production build**

Run: `cd ui && npm run build`

Expected: Vite exits with code 0 and emits `ui/dist/`.

- [x] **Step 3: Manually validate the user-facing mode matrix**

With an active DJ session and a direct YouTube queue item, start playback and verify:

1. GUI Pulse → GUI Studio keeps the same audible position and play/pause state.
2. GUI Studio → TUI keeps the same audible position and play/pause state.
3. TUI → GUI Pulse keeps the same audible position and play/pause state.
4. Pausing before any transition remains paused after all transitions.
5. Selecting a new queue item changes the shared player video exactly once.
6. Cast and remove a skip vote before and after GUI Pulse → TUI; verify the vote count and threshold state refresh correctly.
7. Transfer DJ to a second participant while a song is playing; verify the former DJ cannot pause, seek, advance, or force-skip, and the new DJ can do so without a player remount.
8. Drag the GUI seekbar and run TUI `seek +15` and `seekend 10`; verify each action seeks the shared player once and leaves the queue item in `playing` status.
9. In GUI, add one track by streaming URL and one by title plus artist; verify both appear in the queue while the current player remains mounted.
10. In TUI, add one track by URL and one by `add "title" artist`; verify both route through the existing queue API and refresh the queue.
11. Import a playlist in each surface, select a subset of tracks, confirm the add, and verify only that subset is queued while current playback continues.

- [x] **Step 4: Inspect the final diff and report verification-only corrections**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional files are present.

If a correction was needed during this task, include its exact files and the
failed command it corrected in the final implementation report. Do not create
an empty commit.

## Self-review

- Spec coverage: Tasks 1–4 implement the singleton player, active-registration handoff, stale-result protection, Media Session ownership, and GUI/TUI command routing. Task 5 implements both approved GUI themes, local theme persistence, and TUI visual isolation. Task 6 covers the required build and manual transition matrix.
- Placeholder scan: no unresolved design decisions or deferred implementation steps remain; all APIs, commands, tests, and expected outcomes are named.
- Type consistency: every playback consumer uses the same `descriptor` shape and every control comes from `useJamPlayback()`.
- Review focus: stale resolution is Task 1; singleton and paused state are Task 2; former-DJ behavior is Task 3’s `enabled` condition; theme persistence and TUI isolation are Task 5.
