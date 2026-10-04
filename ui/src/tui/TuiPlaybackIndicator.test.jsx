import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import TuiPlaybackIndicator from "./TuiPlaybackIndicator";

afterEach(cleanup);

describe("TuiPlaybackIndicator", () => {
  test("shows animated playing status with elapsed time and queue repeat", () => {
    render(
      <TuiPlaybackIndicator
        playerState={1}
        currentTime={84}
        duration={261}
        repeatMode="queue"
      />,
    );

    expect(screen.getByRole("status")).toHaveAttribute("data-playing", "true");
    expect(screen.getByText("PLAYING")).toBeInTheDocument();
    expect(screen.getByText("1:24 / 4:21")).toBeInTheDocument();
    expect(screen.getByText("↻ queue")).toBeInTheDocument();
  });

  test("settles the indicator and labels song repeat when paused", () => {
    render(
      <TuiPlaybackIndicator
        playerState={2}
        currentTime={84}
        duration={261}
        repeatMode="song"
      />,
    );

    expect(screen.getByRole("status")).toHaveAttribute("data-playing", "false");
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    expect(screen.getByText("↻ song")).toBeInTheDocument();
  });
});
