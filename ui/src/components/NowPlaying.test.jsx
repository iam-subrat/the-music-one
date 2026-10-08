import { forwardRef, useImperativeHandle } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import NowPlaying from "./NowPlaying";
import { JamPlaybackProvider } from "../playback/JamPlaybackContext";

const mocks = vi.hoisted(() => ({
  castSkipVote: vi.fn(),
  removeSkipVote: vi.fn(),
  setRepeatMode: vi.fn(),
  playSpecificSong: vi.fn(),
  flags: { AUTO_PLAY_QUEUE: true, YOUTUBE_EMBED: false, VOTE_TO_SKIP: false },
}));

const player = {
  play: vi.fn(),
  pause: vi.fn(),
  seek: vi.fn(),
  getTime: () => 0,
  getDuration: () => 180,
  getState: () => 1,
  isReady: () => true,
};

vi.mock("../components/YouTubeAutoPlayer", () => ({
  default: forwardRef(({ videoId }, ref) => {
    useImperativeHandle(ref, () => player);
    return <div data-testid="youtube-player" data-video-id={videoId} />;
  }),
}));
vi.mock("../hooks/useMediaSession", () => ({ useMediaSession: vi.fn() }));
vi.mock("../playback/useResolvedYouTubeVideo", () => ({
  useResolvedYouTubeVideo: (_item, isDJ) => ({ videoId: isDJ ? "video-123" : null, resolvedTitle: "Resolved song" }),
}));
vi.mock("../hooks/useSkipVotes", () => ({ useSkipVotes: () => ({ count: 0, hasVoted: false }) }));
vi.mock("../lib/analytics", () => ({ useAnalytics: () => ({ capture: vi.fn() }) }));
vi.mock("../lib/queue", () => ({ castSkipVote: mocks.castSkipVote, removeSkipVote: mocks.removeSkipVote, playNext: vi.fn(), playPrevious: vi.fn(), playSpecificSong: mocks.playSpecificSong }));
vi.mock("../lib/session", () => ({ setRepeatMode: mocks.setRepeatMode }));
vi.mock("./Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("./PlatformLinks", () => ({ default: () => null }));
vi.mock("../lib/flags", () => ({ FLAGS: mocks.flags }));

const playingProps = {
  nowPlaying: { id: "item-1", title: "Song", artist: "Artist", thumbnail_url: null, platform_links: {} },
  sessionId: "session-1",
  isDJ: true,
  preferredPlatform: null,
  participantCount: 2,
  userId: "user-1",
  onQueueChange: vi.fn(),
  repeatMode: "none",
  onRepeatModeChange: vi.fn(),
  queueItems: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.flags.VOTE_TO_SKIP = false;
});

describe("NowPlaying shared playback", () => {
  test("keeps the repeat control in its next state while the update is pending", () => {
    mocks.setRepeatMode.mockImplementationOnce(() => new Promise(() => {}));
    const onRepeatModeChange = vi.fn();
    render(<JamPlaybackProvider><NowPlaying {...playingProps} onRepeatModeChange={onRepeatModeChange} /></JamPlaybackProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Repeat: Off" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Song" }));

    expect(onRepeatModeChange).toHaveBeenCalledWith("song");
    expect(screen.getByRole("button", { name: "Repeat: Song" })).toBeDisabled();
  });

  test("previews the first queued song without audio and starts that song explicitly", async () => {
    const first = { ...playingProps.nowPlaying, status: "queued", position: 1 };
    render(<JamPlaybackProvider><NowPlaying {...playingProps} nowPlaying={null} queueItems={[first]} /></JamPlaybackProvider>);
    expect(screen.getByText("Song", { exact: true })).toBeVisible();
    expect(screen.getByText("Ready", { exact: true })).toBeVisible();
    expect(screen.queryByTestId("youtube-player")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous track" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next track" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
    await waitFor(() => expect(mocks.playSpecificSong).toHaveBeenCalledWith("session-1", "item-1", 0));
  });

  test("keeps a skip vote selected while its request is pending", () => {
    mocks.flags.VOTE_TO_SKIP = true;
    mocks.castSkipVote.mockImplementationOnce(() => new Promise(() => {}));
    render(<JamPlaybackProvider><NowPlaying {...playingProps} isDJ={false} /></JamPlaybackProvider>);

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));

    expect(screen.getByRole("button", { name: /unvote/i })).toBeDisabled();
  });

  test("registers an active GUI song with the single provider-owned player", async () => {
    render(<JamPlaybackProvider><NowPlaying {...playingProps} /></JamPlaybackProvider>);
    await waitFor(() => expect(screen.getByTestId("youtube-player")).toHaveAttribute("data-video-id", "video-123"));
    expect(screen.getAllByTestId("youtube-player")).toHaveLength(1);
  });

  test("does not enable shared playback for a non-DJ viewer", () => {
    render(<JamPlaybackProvider><NowPlaying {...playingProps} isDJ={false} /></JamPlaybackProvider>);
    expect(screen.queryByTestId("youtube-player")).not.toBeInTheDocument();
  });

  test("gives the DJ accessible transport controls", async () => {
    render(<JamPlaybackProvider><NowPlaying {...playingProps} /></JamPlaybackProvider>);

    await waitFor(() => expect(screen.getByTestId("youtube-player")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Previous track" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause playback" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Next track" })).toBeEnabled();
  });

  test("keeps the play button paused immediately after the DJ pauses", async () => {
    let syncTransport;
    const originalSetInterval = window.setInterval;
    vi.spyOn(window, "setInterval").mockImplementation((callback, delay, ...args) => {
      if (delay === 500) syncTransport = callback;
      return originalSetInterval(callback, delay, ...args);
    });
    render(<JamPlaybackProvider><NowPlaying {...playingProps} /></JamPlaybackProvider>);

    await waitFor(() => expect(screen.getByRole("button", { name: "Pause playback" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Pause playback" }));
    act(() => syncTransport());

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play playback" })).toBeEnabled();
  });

  test("lets the DJ seek using the labelled playback position slider", async () => {
    render(<JamPlaybackProvider><NowPlaying {...playingProps} /></JamPlaybackProvider>);

    await waitFor(() => expect(screen.getByTestId("youtube-player")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("slider", { name: "Playback position" })).toHaveAttribute("max", "180"));
    const seekbar = screen.getByRole("slider", { name: "Playback position" });
    expect(seekbar).toHaveAttribute("min", "0");
    expect(seekbar).toHaveAttribute("max", "180");
    expect(seekbar).toHaveAttribute("value", "0");
    expect(seekbar).toBeEnabled();

    fireEvent.change(seekbar, { target: { value: "73" } });
    expect(player.seek).toHaveBeenCalledWith(73);
  });

  test("keeps the viewer's transport read-only", () => {
    render(<JamPlaybackProvider><NowPlaying {...playingProps} isDJ={false} /></JamPlaybackProvider>);

    expect(screen.getByRole("slider", { name: "Playback position" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Previous track" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play playback" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause playback" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next track" })).not.toBeInTheDocument();
  });
});
