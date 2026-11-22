import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TuiJamRoom from "./TuiJamRoom";

const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  pause: vi.fn(),
  seek: vi.fn(),
  requestStart: vi.fn(),
  getState: vi.fn(() => -1),
  isReady: vi.fn(() => true),
  getTime: vi.fn(() => 0),
  getDuration: vi.fn(() => 417),
}));

const queueMocks = vi.hoisted(() => ({
  playNext: vi.fn().mockResolvedValue({ next_item_id: "item-2" }),
  playPrevious: vi.fn().mockResolvedValue({ next_item_id: "item-prev" }),
  playSpecificSong: vi.fn().mockResolvedValue({}),
  addToQueue: vi.fn(),
  searchAndAddToQueue: vi.fn(),
  forceSkip: vi.fn(),
  castSkipVote: vi.fn(),
  removeSkipVote: vi.fn(),
  patchYouTubeLink: vi.fn(),
}));

vi.mock("../lib/queue", () => queueMocks);

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useParams: () => ({ code: "Q5M6DS" }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-dj" },
    profile: { display_name: "Subrat" },
    loading: false,
  }),
}));

const mockSession = {
  id: "session-1",
  invite_code: "Q5M6DS",
  status: "active",
  host_user_id: "user-dj",
  dj_user_id: "user-dj",
  repeat_mode: "queue",
  auto_pilot: false,
  playback_mode: "dj",
  playback_mode_version: 0,
};

const mockItem = {
  id: "item-1",
  title: "Sirf Tum",
  artist: "Youngveer",
  status: "playing",
  position: 1,
  profiles: { display_name: "Subrat" },
  thumbnail_url: "https://example.com/art.jpg",
};

let queueItemsState = [mockItem];

vi.mock("../hooks/useSession", () => ({
  useSession: () => ({
    session: mockSession,
    loading: false,
    error: null,
    setSession: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../hooks/useQueue", () => ({
  useQueue: () => ({
    items: queueItemsState,
    ready: true,
    refresh: vi.fn(),
    addItem: vi.fn(),
  }),
}));

vi.mock("../hooks/useParticipants", () => ({
  useParticipants: () => ({
    participants: [{ id: "user-dj", display_name: "Subrat" }],
    refresh: vi.fn(),
  }),
}));

vi.mock("../hooks/useSkipVotes", () => ({
  useSkipVotes: () => ({ count: 0, hasVoted: false }),
}));

vi.mock("../playback/useResolvedYouTubeVideo", () => ({
  useResolvedYouTubeVideo: () => ({
    videoId: "yt-video-1",
    resolvedTitle: "Sirf Tum",
  }),
}));

vi.mock("../lib/flags", () => ({
  FLAGS: { AUTO_PLAY_QUEUE: true, JAM_SESSION: true, YOUTUBE_EMBED: true },
}));

vi.mock("../playback/JamPlaybackContext", () => ({
  useJamPlayback: () => ({
    registerPlayback: vi.fn(),
    requestStart: mocks.requestStart,
    clearPlayback: vi.fn(),
    play: mocks.play,
    pause: mocks.pause,
    seek: mocks.seek,
    replay: vi.fn(),
    getTime: mocks.getTime,
    getDuration: mocks.getDuration,
    getState: mocks.getState,
    isReady: mocks.isReady,
  }),
}));

vi.mock("../playback/IndependentPlaybackContext", () => ({
  useIndependentPlayback: () => ({
    state: {
      item: null,
      started: false,
      loading: false,
      error: null,
      repeat: "none",
    },
    select: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    repeat: vi.fn(),
    seek: vi.fn(),
    getTime: () => 0,
    getDuration: () => 0,
    getState: () => -1,
  }),
}));

vi.mock("../lib/session", () => ({
  joinSession: vi.fn().mockResolvedValue({}),
  endSession: vi.fn(),
  passDjToken: vi.fn(),
  setRepeatMode: vi.fn(),
  setAutoPilot: vi.fn(),
  setPlaybackMode: vi.fn(),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  queueItemsState = [mockItem];
  mocks.getState.mockReturnValue(-1);
  mocks.isReady.mockReturnValue(true);
});

describe("TuiJamRoom playback commands", () => {
  test("allows play command when player is in state -1 (unstarted/ready)", async () => {
    render(
      <MemoryRouter>
        <TuiJamRoom />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/type `help` or `add <url>`/);
    await act(async () => {
      fireEvent.change(input, { target: { value: "play" } });
      fireEvent.submit(input.closest("form"));
    });

    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(screen.getByText("▶ resumed")).toBeInTheDocument();
    expect(screen.queryByText("~ no player active")).not.toBeInTheDocument();
  });

  test("allows play button in TuiPlayer when player is in state -1 (unstarted/ready)", async () => {
    render(
      <MemoryRouter>
        <TuiJamRoom />
      </MemoryRouter>,
    );

    const playBtn = screen.getByRole("button", { name: "Play playback" });
    await act(async () => {
      fireEvent.click(playBtn);
    });

    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(screen.getByText("▶ resumed")).toBeInTheDocument();
    expect(screen.queryByText("~ no player active")).not.toBeInTheDocument();
  });

  test("requests start when player is not ready yet during play command", async () => {
    mocks.isReady.mockReturnValue(false);

    render(
      <MemoryRouter>
        <TuiJamRoom />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/type `help` or `add <url>`/);
    await act(async () => {
      fireEvent.change(input, { target: { value: "play" } });
      fireEvent.submit(input.closest("form"));
    });

    expect(mocks.requestStart).toHaveBeenCalledWith("session-1", "item-1", 0);
    expect(mocks.play).not.toHaveBeenCalled();
    expect(screen.getByText("▶ starting playback...")).toBeInTheDocument();
    expect(screen.queryByText("~ no player active")).not.toBeInTheDocument();
  });

  test("next advances queue and registers pending start for the next track", async () => {
    render(
      <MemoryRouter>
        <TuiJamRoom />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/type `help` or `add <url>`/);
    await act(async () => {
      fireEvent.change(input, { target: { value: "next" } });
      fireEvent.submit(input.closest("form"));
    });

    expect(queueMocks.playNext).toHaveBeenCalledWith("session-1", 0);
    expect(mocks.requestStart).toHaveBeenCalledWith("session-1", "item-2", 0);
    expect(screen.getByText("✓ advanced queue")).toBeInTheDocument();
  });

  test("next followed by play does not play previous song before new song is ready", async () => {
    mocks.isReady.mockImplementation((id) => id === "item-1");

    const { rerender } = render(
      <MemoryRouter>
        <TuiJamRoom />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/type `help` or `add <url>`/);
    await act(async () => {
      fireEvent.change(input, { target: { value: "next" } });
      fireEvent.submit(input.closest("form"));
    });

    expect(queueMocks.playNext).toHaveBeenCalledWith("session-1", 0);
    expect(mocks.requestStart).toHaveBeenCalledWith("session-1", "item-2", 0);

    queueItemsState = [
      { ...mockItem, id: "item-1", status: "played" },
      {
        ...mockItem,
        id: "item-2",
        title: "Kya Tujhe Ab...",
        status: "playing",
        position: 2,
      },
    ];

    rerender(
      <MemoryRouter>
        <TuiJamRoom />
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.change(input, { target: { value: "play" } });
      fireEvent.submit(input.closest("form"));
    });

    expect(mocks.requestStart).toHaveBeenCalledWith("session-1", "item-2", 0);
    expect(mocks.play).not.toHaveBeenCalled();
    expect(screen.getByText("▶ starting playback...")).toBeInTheDocument();
  });

  test("pauses playback when player is active and ready", async () => {
    render(
      <MemoryRouter>
        <TuiJamRoom />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/type `help` or `add <url>`/);
    await act(async () => {
      fireEvent.change(input, { target: { value: "pause" } });
      fireEvent.submit(input.closest("form"));
    });

    expect(mocks.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByText("⏸ paused")).toBeInTheDocument();
  });

  test("shows '~ no player active' when queue is empty and play is invoked", async () => {
    queueItemsState = [];

    render(
      <MemoryRouter>
        <TuiJamRoom />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/type `help` or `add <url>`/);
    await act(async () => {
      fireEvent.change(input, { target: { value: "play" } });
      fireEvent.submit(input.closest("form"));
    });

    expect(mocks.play).not.toHaveBeenCalled();
    expect(screen.getByText("~ no player active")).toBeInTheDocument();
  });
});
