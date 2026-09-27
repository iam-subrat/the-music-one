import { forwardRef, useImperativeHandle } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import NowPlaying from "./NowPlaying";
import { JamPlaybackProvider } from "../playback/JamPlaybackContext";

vi.mock("../components/YouTubeAutoPlayer", () => ({
  default: forwardRef(({ videoId }, ref) => {
    useImperativeHandle(ref, () => ({ play: vi.fn(), pause: vi.fn(), seek: vi.fn(), getTime: () => 0, getDuration: () => 180, getState: () => 1, isReady: () => true }));
    return <div data-testid="youtube-player" data-video-id={videoId} />;
  }),
}));
vi.mock("../hooks/useMediaSession", () => ({ useMediaSession: vi.fn() }));
vi.mock("../playback/useResolvedYouTubeVideo", () => ({
  useResolvedYouTubeVideo: (_item, isDJ) => ({ videoId: isDJ ? "video-123" : null, resolvedTitle: "Resolved song" }),
}));
vi.mock("../hooks/useSkipVotes", () => ({ useSkipVotes: () => ({ count: 0, hasVoted: false }) }));
vi.mock("../lib/analytics", () => ({ useAnalytics: () => ({ capture: vi.fn() }) }));
vi.mock("../lib/queue", () => ({ castSkipVote: vi.fn(), removeSkipVote: vi.fn(), playNext: vi.fn(), playPrevious: vi.fn(), playSpecificSong: vi.fn() }));
vi.mock("../lib/session", () => ({ setRepeatMode: vi.fn() }));
vi.mock("./Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("./PlatformLinks", () => ({ default: () => null }));
vi.mock("../lib/flags", () => ({ FLAGS: { AUTO_PLAY_QUEUE: true, YOUTUBE_EMBED: false, VOTE_TO_SKIP: false } }));

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
});

describe("NowPlaying shared playback", () => {
  test("registers an active GUI song with the single provider-owned player", async () => {
    render(<JamPlaybackProvider><NowPlaying {...playingProps} /></JamPlaybackProvider>);
    await waitFor(() => expect(screen.getByTestId("youtube-player")).toHaveAttribute("data-video-id", "video-123"));
    expect(screen.getAllByTestId("youtube-player")).toHaveLength(1);
  });

  test("does not enable shared playback for a non-DJ viewer", () => {
    render(<JamPlaybackProvider><NowPlaying {...playingProps} isDJ={false} /></JamPlaybackProvider>);
    expect(screen.queryByTestId("youtube-player")).not.toBeInTheDocument();
  });
});
