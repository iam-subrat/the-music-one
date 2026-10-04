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

    expect(screen.getByTestId("song-visualizer")).toHaveAttribute("data-playing", "false");
  });
});
