import { expect, test } from '@playwright/test';

const session = {
  id: 'session-1',
  invite_code: 'room',
  host_user_id: 'dj-1',
  dj_user_id: 'dj-1',
  status: 'active',
  repeat_mode: 'none',
};

const playingSong = {
  id: 'song-1',
  position: 1,
  title: 'E2E Song',
  artist: 'Artist',
  status: 'playing',
  thumbnail_url: null,
  platform_links: { youtube: 'https://youtu.be/abc123def45' },
  profiles: { display_name: 'DJ' },
};

const playlistTracks = [
  { title: 'Playlist One', artist: 'First Artist', url: 'https://open.spotify.com/track/one' },
  { title: 'Playlist Two', artist: 'Second Artist', url: 'https://open.spotify.com/track/two' },
  { title: 'Playlist Three', artist: 'Third Artist', url: 'https://open.spotify.com/track/three' },
];

/**
 * Routes every browser request the Jam room needs through a stateful in-memory
 * API. That keeps assertions on the request body and post-add queue UI fully
 * deterministic, without a Supabase session or a backend process.
 */
async function installJamApi(page) {
  const queue = [playingSong];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();

    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (pathname === '/api/flags/') {
      return json([
        { key: 'SONG_SEARCH', enabled: true },
        { key: 'PLAYLIST_IMPORT', enabled: true },
      ]);
    }
    if (pathname === '/api/auth/me') {
      return json({ id: 'dj-1', display_name: 'DJ', email: 'dj@example.test' });
    }
    if (pathname === '/api/sessions/room') return json(session);
    if (pathname === '/api/sessions/session-1/participants') {
      return json([{ id: 'dj-1', display_name: 'DJ' }]);
    }
    if (pathname === '/api/sessions/session-1/queue' && method === 'GET') {
      return json(queue);
    }
    if (pathname === '/api/sessions/session-1/queue' && method === 'POST') {
      const body = request.postDataJSON();
      const item = {
        id: `queued-${queue.length}`,
        position: queue.length + 1,
        title: body.name ?? 'URL Result',
        artist: body.artist ?? 'Resolved Artist',
        status: 'queued',
        thumbnail_url: null,
        platform_links: {},
      };
      queue.push(item);
      return json(item);
    }
    if (pathname === '/api/playlists/preview') {
      return json({ name: 'Fixture Playlist', platform: 'spotify', tracks: playlistTracks });
    }
    if (pathname === '/api/sessions/session-1/queue/batch' && method === 'POST') {
      const body = request.postDataJSON();
      const added = body.tracks.map((track, index) => ({
        id: `playlist-${queue.length + index}`,
        position: queue.length + index + 1,
        ...track,
        status: 'queued',
        platform_links: {},
      }));
      queue.push(...added);
      return json({ added });
    }
    if (pathname === '/api/sessions/session-1/join' && method === 'POST') return json({});
    if (pathname === '/api/profiles/me' && method === 'PATCH') return json({});
    return json({});
  });
  await page.route('https://www.youtube.com/iframe_api', (route) => route.abort());

}

test.beforeEach(async ({ page }) => {
  await installJamApi(page);
  await page.goto('/jam/room', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[class*="nowPlayingTitle"]')).toHaveText('E2E Song');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
});

test('adds a streaming URL through the graphical queue form', async ({ page }) => {
  const requestPromise = page.waitForRequest((request) =>
    request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/sessions/session-1/queue',
  );

  await page.getByPlaceholder('Paste a song or playlist URL…').fill('https://open.spotify.com/track/fixture');
  await page.getByRole('button', { name: 'Add', exact: true }).click({ force: true });

  const request = await requestPromise;
  expect(request.postDataJSON()).toEqual({ url: 'https://open.spotify.com/track/fixture' });
  await expect(page.getByText('"URL Result" added to queue')).toBeVisible();
});

test('adds a title and artist through the graphical song search form', async ({ page }) => {
  const requestPromise = page.waitForRequest((request) =>
    request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/sessions/session-1/queue',
  );

  await page.getByRole('button', { name: 'Search', exact: true }).click({ force: true });
  await page.getByPlaceholder('Song name…').fill('Midnight Fixture');
  await page.getByPlaceholder('Artist (optional)…').fill('The Test Artists');
  await page.getByRole('button', { name: 'Search & Add', exact: true }).click({ force: true });

  const request = await requestPromise;
  expect(request.postDataJSON()).toEqual({ name: 'Midnight Fixture', artist: 'The Test Artists' });
  await expect(page.getByText('"Midnight Fixture" added to queue')).toBeVisible();
});

test('adds only the selected playlist tracks through the graphical playlist picker', async ({ page }) => {
  const batchRequest = page.waitForRequest((request) =>
    request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/sessions/session-1/queue/batch',
  );

  await page.getByPlaceholder('Paste a song or playlist URL…').fill('https://open.spotify.com/playlist/fixture');
  await page.getByRole('button', { name: 'Add', exact: true }).click({ force: true });

  await expect(page.getByText('Fixture Playlist', { exact: true })).toHaveText('Fixture Playlist');
  const secondTrack = page.getByRole('checkbox').nth(1);
  await secondTrack.dispatchEvent('click');
  const addSelected = page.getByRole('button', { name: 'Add 2 Selected', exact: true });
  await expect(addSelected).toHaveText('Add 2 Selected');
  await addSelected.dispatchEvent('click');

  const request = await batchRequest;
  expect(request.postDataJSON()).toEqual({
    tracks: [playlistTracks[0], playlistTracks[2]],
  });
  await expect(page.getByText('Added 2 songs to queue.')).toBeVisible();
  await expect(page.getByText('Playlist One', { exact: true })).toBeVisible();
  await expect(page.getByText('Playlist Three', { exact: true })).toBeVisible();
  await expect(page.getByText('Playlist Two', { exact: true })).not.toBeVisible();
});
