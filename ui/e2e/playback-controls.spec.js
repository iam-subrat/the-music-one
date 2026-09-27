import { expect, test } from "@playwright/test";

const currentSong = {
  id: "song-current",
  position: 2,
  title: "Current Track",
  artist: "Current Artist",
  status: "playing",
  thumbnail_url: null,
  platform_links: { youtube: "https://youtu.be/abc123def45" },
  profiles: { display_name: "DJ" },
};

const previousSong = {
  id: "song-previous",
  position: 1,
  title: "Previous Track",
  artist: "Previous Artist",
  status: "played",
  thumbnail_url: null,
  platform_links: { youtube: "https://youtu.be/previous123" },
  profiles: { display_name: "DJ" },
};

const nextSong = {
  id: "song-next",
  position: 3,
  title: "Next Track",
  artist: "Next Artist",
  status: "queued",
  thumbnail_url: null,
  platform_links: { youtube: "https://youtu.be/nexttrack12" },
  profiles: { display_name: "Listener" },
};

/**
 * Exercise the browser against the real app while replacing only its remote
 * FastAPI and YouTube dependencies. The mutable state makes UI assertions
 * observe the same refetches the production hooks use.
 */
async function installJamFixture(page, { currentUser = "dj-1", djUser = "dj-1" } = {}) {
  const state = {
    votes: new Set(),
    queue: [previousSong, currentSong, nextSong].map((item) => ({ ...item })),
    repeatMode: "none",
  };

  await page.route("https://www.youtube.com/iframe_api", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    const json = (data, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

    if (pathname.endsWith("/auth/me")) {
      return json({ id: currentUser, display_name: currentUser === "dj-1" ? "DJ" : "Listener", email: `${currentUser}@example.test` });
    }
    if (pathname.endsWith("/sessions/room")) {
      return json({
        id: "session-1",
        invite_code: "room",
        host_user_id: "host-1",
        dj_user_id: djUser,
        status: "active",
        repeat_mode: state.repeatMode,
      });
    }
    if (pathname.endsWith("/sessions/session-1/queue") && method === "GET") return json(state.queue);
    if (pathname.endsWith("/sessions/session-1/participants")) {
      return json([
        { id: "dj-1", display_name: "DJ" },
        { id: "listener-1", display_name: "Listener" },
      ]);
    }
    if (pathname.endsWith("/sessions/session-1/stream")) {
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
    }
    if (pathname.endsWith("/sessions/session-1/join") || pathname.endsWith("/sessions/session-1/heartbeat")) return json({});
    if (pathname.endsWith("/items/song-current/votes")) {
      if (method === "GET") return json({ count: state.votes.size, user_ids: [...state.votes] });
      if (method === "POST") {
        state.votes.add(currentUser);
        return json({ skipped: false });
      }
      if (method === "DELETE") {
        state.votes.delete(currentUser);
        return json({});
      }
    }
    if (pathname.endsWith("/sessions/session-1/repeat-mode") && method === "PATCH") {
      state.repeatMode = JSON.parse(request.postData() || "{}").mode;
      return json({ repeat_mode: state.repeatMode });
    }
    if (pathname.endsWith("/sessions/session-1/queue/next") && method === "POST") {
      state.queue = state.queue.map((item) => item.id === "song-current"
        ? { ...item, status: "played" }
        : item.id === "song-next" ? { ...item, status: "playing" } : item);
      return json({ next_item_id: "song-next" });
    }
    if (pathname.endsWith("/sessions/session-1/queue/previous") && method === "POST") {
      state.queue = state.queue.map((item) => item.id === "song-current"
        ? { ...item, status: "queued" }
        : item.id === "song-previous" ? { ...item, status: "playing" } : item);
      return json({ next_item_id: "song-previous" });
    }
    return json({});
  });
}

test("skip vote immediately becomes unvote and can be removed", async ({ page }) => {
  await installJamFixture(page);
  await page.goto("/jam/room");

  // This catches removing the hook refresh after a successful non-majority vote.
  const nowPlayingControls = page.locator('[class*="nowPlaying"] > [class*="djControls"]');
  const skip = nowPlayingControls.getByRole("button", { name: /skip \(0\/2\)/i });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(nowPlayingControls.getByRole("button", { name: /unvote \(1\/2\)/i })).toBeVisible();

  await nowPlayingControls.getByRole("button", { name: /unvote \(1\/2\)/i }).click();
  await expect(nowPlayingControls.getByRole("button", { name: /skip \(0\/2\)/i })).toBeVisible();
});

test("DJ can advance, go back, and cycle repeat mode", async ({ page }) => {
  await installJamFixture(page);
  await page.goto("/jam/room");
  await expect(page.getByRole("main", { name: "Jam room" }).getByText("Current Track", { exact: true })).toBeVisible();

  await Promise.all([
    page.waitForRequest((request) => request.url().endsWith("/api/sessions/session-1/queue/next") && request.method() === "POST"),
    page.getByRole("button", { name: /next/i }).click(),
  ]);
  await expect(page.getByRole("main", { name: "Jam room" }).getByText("Next Track", { exact: true })).toBeVisible();

  await Promise.all([
    page.waitForRequest((request) => request.url().endsWith("/api/sessions/session-1/queue/previous") && request.method() === "POST"),
    page.getByRole("button", { name: /prev/i }).click(),
  ]);
  await expect(page.getByRole("main", { name: "Jam room" }).getByText("Previous Track", { exact: true })).toBeVisible();

  const repeat = page.getByRole("button", { name: /repeat/i });
  await repeat.click();
  await expect(page.getByRole("button", { name: /repeat song/i })).toBeVisible();
  await page.getByRole("button", { name: /repeat song/i }).click();
  await expect(page.getByRole("button", { name: /repeat queue/i })).toBeVisible();
});

test("listener cannot access DJ-only transport or queue-play controls", async ({ page }) => {
  await installJamFixture(page, { currentUser: "listener-1", djUser: "dj-1" });
  await page.goto("/jam/room");

  await expect(page.getByRole("button", { name: /prev/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^next/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /repeat/i })).toHaveCount(0);
  await expect(page.locator('button[title="Play this song"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /skip \(0\/2\)/i }).first()).toBeVisible();
});
