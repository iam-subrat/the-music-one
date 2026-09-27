import { forwardRef, useEffect, useImperativeHandle } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { JamPlaybackProvider, useJamPlayback } from "./JamPlaybackContext";

const player = { play: vi.fn(), pause: vi.fn(), seek: vi.fn(), getTime: () => 12, getDuration: () => 180, getState: () => 2, isReady: () => true };

vi.mock("../components/YouTubeAutoPlayer", () => ({
  default: forwardRef(({ videoId }, ref) => {
    useImperativeHandle(ref, () => player);
    return <div data-testid="youtube-player" data-video-id={videoId} />;
  }),
}));
vi.mock("../hooks/useMediaSession", () => ({ useMediaSession: vi.fn() }));

const active = { owner: "gui", isDJ: true, sessionId: "session-a", queueItemId: "item-a", videoId: "video-a", enabled: true, repeat: false, metadata: { title: "Song" }, onEnded: vi.fn() };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Registration({ descriptor }) {
  const { registerPlayback } = useJamPlayback();
  useEffect(() => registerPlayback(descriptor), [descriptor, registerPlayback]);
  return null;
}

function CommandProbe() {
  const { seek } = useJamPlayback();
  return <button type="button" onClick={() => seek(42)}>seek</button>;
}

function EndSessionProbe() {
  const { clearPlayback } = useJamPlayback();
  return <button type="button" onClick={() => clearPlayback("session-a")}>end session</button>;
}

describe("JamPlaybackProvider", () => {
  test("keeps one player mounted when a TUI registration replaces the GUI registration for the same item", () => {
    const view = render(<JamPlaybackProvider><Registration descriptor={active} /></JamPlaybackProvider>);
    const mountedPlayer = screen.getByTestId("youtube-player");

    view.rerender(<JamPlaybackProvider><Registration descriptor={{ ...active, onEnded: vi.fn() }} /></JamPlaybackProvider>);

    expect(screen.getByTestId("youtube-player")).toBe(mountedPlayer);
    expect(screen.getAllByTestId("youtube-player")).toHaveLength(1);
  });

  test("keeps the current player alive while the replacement mode resolves the same song", () => {
    const view = render(<JamPlaybackProvider><Registration descriptor={active} /></JamPlaybackProvider>);
    const mountedPlayer = screen.getByTestId("youtube-player");

    view.rerender(<JamPlaybackProvider><Registration descriptor={{ ...active, owner: "tui", videoId: null, enabled: false }} /></JamPlaybackProvider>);

    expect(screen.getByTestId("youtube-player")).toBe(mountedPlayer);
    expect(screen.getByTestId("youtube-player")).toHaveAttribute("data-video-id", "video-a");
  });

  test("keeps one player through repeated incomplete registrations for the same song", () => {
    const view = render(<JamPlaybackProvider><Registration descriptor={active} /></JamPlaybackProvider>);
    const mountedPlayer = screen.getByTestId("youtube-player");
    const incomplete = { ...active, owner: "tui", videoId: null, enabled: false };

    view.rerender(<JamPlaybackProvider><Registration descriptor={incomplete} /></JamPlaybackProvider>);
    view.rerender(<JamPlaybackProvider><Registration descriptor={{ ...incomplete, onEnded: vi.fn() }} /></JamPlaybackProvider>);

    expect(screen.getByTestId("youtube-player")).toBe(mountedPlayer);
    expect(screen.getByTestId("youtube-player")).toHaveAttribute("data-video-id", "video-a");
  });

  test("keeps playback alive during a TUI handoff before DJ identity resolves", () => {
    const view = render(<JamPlaybackProvider><Registration descriptor={active} /></JamPlaybackProvider>);
    const mountedPlayer = screen.getByTestId("youtube-player");

    view.rerender(<JamPlaybackProvider><Registration descriptor={{ ...active, owner: "tui", isDJ: false, sessionId: null, queueItemId: null, videoId: null, enabled: false, ready: false }} /></JamPlaybackProvider>);

    expect(screen.getByTestId("youtube-player")).toBe(mountedPlayer);
    expect(screen.getByTestId("youtube-player")).toHaveAttribute("data-video-id", "video-a");

    view.rerender(<JamPlaybackProvider><Registration descriptor={{ ...active, owner: "tui", ready: true }} /></JamPlaybackProvider>);
    expect(screen.getByTestId("youtube-player")).toBe(mountedPlayer);
  });

  test("keeps the active video when the replacement mode resolves the same queue item differently", () => {
    const view = render(<JamPlaybackProvider><Registration descriptor={active} /></JamPlaybackProvider>);
    const mountedPlayer = screen.getByTestId("youtube-player");

    view.rerender(<JamPlaybackProvider><Registration descriptor={{ ...active, owner: "tui", videoId: "late-video-id" }} /></JamPlaybackProvider>);

    expect(screen.getByTestId("youtube-player")).toBe(mountedPlayer);
    expect(screen.getByTestId("youtube-player")).toHaveAttribute("data-video-id", "video-a");
  });

  test("clears playback when the current DJ loses control", () => {
    const view = render(<JamPlaybackProvider><Registration descriptor={active} /></JamPlaybackProvider>);
    view.rerender(<JamPlaybackProvider><Registration descriptor={{ ...active, isDJ: false, videoId: null, enabled: false }} /></JamPlaybackProvider>);
    expect(screen.queryByTestId("youtube-player")).not.toBeInTheDocument();
  });

  test("changes the shared player when the active session changes", () => {
    const view = render(<JamPlaybackProvider><Registration descriptor={active} /></JamPlaybackProvider>);
    view.rerender(<JamPlaybackProvider><Registration descriptor={{ ...active, sessionId: "session-b", queueItemId: "item-b", videoId: "video-b" }} /></JamPlaybackProvider>);
    expect(screen.getByTestId("youtube-player")).toHaveAttribute("data-video-id", "video-b");
  });

  test("exposes stable player commands after registration changes", () => {
    render(<JamPlaybackProvider><Registration descriptor={active} /><CommandProbe /></JamPlaybackProvider>);
    fireEvent.click(screen.getByRole("button", { name: "seek" }));
    expect(player.seek).toHaveBeenCalledWith(42);
  });

  test("stops the shared player when an active session is cleared remotely", () => {
    render(<JamPlaybackProvider><Registration descriptor={active} /><EndSessionProbe /></JamPlaybackProvider>);
    fireEvent.click(screen.getByRole("button", { name: "end session" }));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("youtube-player")).not.toBeInTheDocument();
  });
});
