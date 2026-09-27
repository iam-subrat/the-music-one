import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { resolveYouTubeVideo } from "./resolveYouTubeVideo";
import { useResolvedYouTubeVideo } from "./useResolvedYouTubeVideo";
import { api } from "../lib/api";
import { patchYouTubeLink } from "../lib/queue";

vi.mock("../lib/api", () => ({ api: vi.fn() }));
vi.mock("../lib/queue", () => ({ patchYouTubeLink: vi.fn() }));

function Probe({ item, isDJ = true }) {
  const { videoId } = useResolvedYouTubeVideo(item, isDJ);
  return <output>{videoId || "empty"}</output>;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveYouTubeVideo", () => {
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
    expect(result).toEqual({ videoId: "fallback000", title: "Resolved title", persisted: true });
  });
});

describe("useResolvedYouTubeVideo", () => {
  test("ignores a late result for the previous queue item", async () => {
    const first = deferred();
    api
      .mockResolvedValueOnce({ ok: true, json: () => first.promise })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "new-video" }) });
    const oldItem = { id: "old", title: "Old Song", artist: "Artist", platform_links: {} };
    const newItem = { id: "new", title: "New Song", artist: "Artist", platform_links: {} };

    const view = render(<Probe item={oldItem} />);
    view.rerender(<Probe item={newItem} />);
    first.resolve({ id: "old-video" });

    await waitFor(() => expect(screen.getByText("new-video")).toBeInTheDocument());
    expect(screen.queryByText("old-video")).not.toBeInTheDocument();
    expect(patchYouTubeLink).toHaveBeenCalledWith("new", "https://www.youtube.com/watch?v=new-video");
  });
});
