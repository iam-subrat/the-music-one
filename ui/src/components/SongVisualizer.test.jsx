import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import SongVisualizer from "./SongVisualizer";

afterEach(cleanup);

describe("SongVisualizer", () => {
  test("marks the visualizer active while the song is playing", () => {
    render(<SongVisualizer isPlaying artworkUrl="https://images.example.test/cover.jpg" />);

    const visualizer = screen.getByTestId("song-visualizer");
    expect(visualizer).toHaveAttribute("data-playing", "true");
    expect(visualizer).toHaveStyle({ "--visualizer-artwork": 'url("https://images.example.test/cover.jpg")' });
  });

  test("settles the visualizer when playback is paused", () => {
    render(<SongVisualizer isPlaying={false} />);

    const visualizer = screen.getByTestId("song-visualizer");
    expect(visualizer).toHaveAttribute("data-playing", "false");
    expect(visualizer).toHaveAttribute("data-motion", "paused");
  });

  test("marks its bars as a foreground artwork layer", () => {
    render(<SongVisualizer isPlaying />);

    expect(screen.getByTestId("song-visualizer")).toHaveAttribute("data-layer", "foreground");
  });

  test("gives the playing bars varied motion timing instead of one synchronized loop", () => {
    const { container } = render(<SongVisualizer isPlaying />);

    const durations = [...container.querySelectorAll("i")].map((bar) =>
      bar.style.getPropertyValue("--bar-duration"),
    );
    expect(new Set(durations).size).toBeGreaterThan(1);
  });
});
