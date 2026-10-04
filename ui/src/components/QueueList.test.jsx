import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import QueueList from "./QueueList";

afterEach(cleanup);

vi.mock("./AddSongForm", () => ({ default: () => null }));
vi.mock("../hooks/useSkipVotes", () => ({
  useSkipVotes: () => ({ count: 0, hasVoted: false, refresh: () => {} }),
}));

const queuedSong = {
  id: "song-1",
  position: 1,
  title: "Song removed after majority vote",
  artist: "Test Artist",
  status: "queued",
  resolve_status: "resolved",
  profiles: { display_name: "Student" },
};

function renderQueue(items, repeatMode = "none") {
  return render(
    <QueueList
      items={items}
      repeatMode={repeatMode}
      sessionId="session-1"
      userId="student-1"
      participantCount={3}
      profile={{}}
      isDj={false}
      onPlatformDetected={() => {}}
      onAdded={() => {}}
      onQueueChange={() => {}}
    />,
  );
}

describe("QueueList", () => {
  test("renders a previously played queue item with the normal card styling", () => {
    const playedView = renderQueue([{ ...queuedSong, status: "played" }], "queue");
    const playedCard = screen
      .getByText(queuedSong.title)
      .closest('[class*="queueCard"]');

    playedView.unmount();
    const queuedView = renderQueue([queuedSong], "queue");
    const queuedCard = screen
      .getByText(queuedSong.title)
      .closest('[class*="queueCard"]');

    expect(playedCard.className).toBe(queuedCard.className);
    queuedView.unmount();
  });

  test("offers Skip for a previously played song when repeating the queue", () => {
    renderQueue([{ ...queuedSong, status: "played" }], "queue");

    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
  });

  test("removes a majority-skipped queued song from the rendered queue", () => {
    const view = renderQueue([queuedSong]);

    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
    expect(screen.getByText(queuedSong.title)).toBeInTheDocument();

    view.rerender(
      <QueueList
        items={[{ ...queuedSong, status: "skipped" }]}
        repeatMode="none"
        sessionId="session-1"
        userId="student-1"
        participantCount={3}
        profile={{}}
        isDj={false}
        onPlatformDetected={() => {}}
        onAdded={() => {}}
        onQueueChange={() => {}}
      />,
    );

    expect(screen.queryByText(queuedSong.title)).not.toBeInTheDocument();
  });
});
