import { createRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import YouTubeAutoPlayer from "./YouTubeAutoPlayer";

let player;

beforeEach(() => {
  player = {
    seekTo: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 180),
    getPlayerState: vi.fn(() => 1),
    destroy: vi.fn(),
    loadVideoById: vi.fn(),
  };

  window.YT = {
    PlayerState: { ENDED: 0 },
    Player: vi.fn(function Player(_element, options) {
      player.onStateChange = options.events.onStateChange;
      options.events.onReady();
      return player;
    }),
  };
});

afterEach(() => {
  delete window.YT;
  vi.restoreAllMocks();
});

describe("YouTubeAutoPlayer", () => {
  test("replays the current video and accepts its next natural end event", () => {
    const ref = createRef();
    const onEnded = vi.fn();
    render(<YouTubeAutoPlayer ref={ref} videoId="video-1" onEnded={onEnded} repeat={false} />);

    act(() => window.onYouTubeIframeAPIReady());

    act(() => player.onStateChange({ data: window.YT.PlayerState.ENDED }));
    expect(onEnded).toHaveBeenCalledTimes(1);

    act(() => ref.current.replay());
    expect(player.seekTo).toHaveBeenCalledWith(0, true);
    expect(player.playVideo).toHaveBeenCalledTimes(1);

    act(() => player.onStateChange({ data: window.YT.PlayerState.ENDED }));
    expect(onEnded).toHaveBeenCalledTimes(2);
  });
});
