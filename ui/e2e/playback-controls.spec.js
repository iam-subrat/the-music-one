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
    votes: new Map(),
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
    if (/\/items\/[^/]+\/votes$/.test(pathname)) {
      const id = pathname.split('/').at(-2);
      if (!state.votes.has(id)) state.votes.set(id, new Set());
      const votes = state.votes.get(id);
      if (method === "GET") return json({ count: votes.size, user_ids: [...votes] });
      if (method === "POST") {
        votes.add(currentUser);
        return json({ skipped: false });
      }
      if (method === "DELETE") {
        votes.delete(currentUser);
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

for (const theme of ['pulse', 'studio']) {
  for (const width of [390, 1440]) {
    test(`Delete voting layout: ${theme} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 960 });
      await page.addInitScript(theme => localStorage.setItem('musicone:gui-theme', theme), theme);
      await installJamFixture(page);
      await page.goto('/jam/room', { waitUntil: 'domcontentloaded' });
      const button = page.getByRole('button', { name: /delete next track/i });
      await expect(button).toHaveText('Delete0/2 votes');
      await button.click();
      await expect(button).toHaveText('Delete1/2 votes');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('delete-votes.png'), fullPage: true });
      await button.click();
      await expect(button).toHaveText('Delete0/2 votes');
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
      await expect(page.getByText(/delete votes:/)).toBeVisible();
      await expect(page.getByText(/you voted/)).toHaveCount(0);
    });
  }
}

test("Delete keeps its label, increases its vote count, and allows withdrawing the vote", async ({ page }) => {
  await installJamFixture(page);
  await page.goto("/jam/room");

  // This catches removing the hook refresh after a successful non-majority vote.
  const nowPlayingControls = page.getByRole('region', { name: 'Playback', exact: true });
  const button = nowPlayingControls.getByRole("button", { name: /delete current track/i });
  await expect(button).toHaveText('Delete0/2 votes');
  await expect(button).toHaveAttribute('title', /Vote to remove/);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveText('Delete1/2 votes');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveText('Delete0/2 votes');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test("DJ can advance, go back, and select repeat mode", async ({ page }) => {
  await installJamFixture(page);
  await page.goto("/jam/room");
  await expect(page.getByRole("main", { name: "Jam room" }).getByText("Current Track", { exact: true })).toBeVisible();

  await Promise.all([
    page.waitForRequest((request) => request.url().endsWith("/api/sessions/session-1/queue/next") && request.method() === "POST"),
    page.getByRole("button", { name: 'Next track', exact: true }).click(),
  ]);
  await expect(page.getByRole("main", { name: "Jam room" }).getByText("Next Track", { exact: true })).toBeVisible();

  await Promise.all([
    page.waitForRequest((request) => request.url().endsWith("/api/sessions/session-1/queue/previous") && request.method() === "POST"),
    page.getByRole("button", { name: 'Previous track', exact: true }).click(),
  ]);
  await expect(page.getByRole("main", { name: "Jam room" }).getByText("Previous Track", { exact: true })).toBeVisible();

  const repeat = page.getByRole("button", { name: /repeat/i });
  await repeat.click();
  await page.getByRole('menuitemradio', { name: 'Song', exact: true }).click();
  await expect(page.getByRole("button", { name: 'Repeat: Song' })).toBeVisible();
  await page.getByRole("button", { name: 'Repeat: Song' }).click();
  await page.getByRole('menuitemradio', { name: 'Queue', exact: true }).click();
  await expect(page.getByRole("button", { name: 'Repeat: Queue' })).toBeVisible();
});

test("listener cannot access DJ-only transport or queue-play controls", async ({ page }) => {
  await installJamFixture(page, { currentUser: "listener-1", djUser: "dj-1" });
  await page.goto("/jam/room");

  await expect(page.getByRole("button", { name: /prev/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^next/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /repeat/i })).toBeDisabled();
  await expect(page.locator('button[title="Play this song"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /delete current track/i })).toHaveText('Delete0/2 votes');
});
