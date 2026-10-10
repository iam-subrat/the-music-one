import { expect, test } from '@playwright/test';

const session = { id: 'session-1', invite_code: 'room', host_user_id: 'dj-1', dj_user_id: 'dj-1', status: 'active', repeat_mode: 'none' };
const song = { id: 'song-1', position: 1, title: 'E2E Song', artist: 'Artist', status: 'playing', thumbnail_url: null, platform_links: { youtube: 'https://youtu.be/abc123def45' }, profiles: { display_name: 'DJ' } };

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/auth/me') ? { id: 'dj-1', display_name: 'DJ', email: 'dj@example.test' }
      : path.endsWith('/sessions/room') ? session
      : path.endsWith('/queue') ? [song]
      : path.endsWith('/participants') ? [{ id: 'dj-1', display_name: 'DJ' }]
      : [];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('https://www.youtube.com/iframe_api', route => route.abort());
});

test('preserves the Jam room while switching visual theme and terminal mode', async ({ page }) => {
  await page.route('**/api/sessions/session-1/queue', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([
    song,
    { ...song, id: 'song-2', position: 2, title: 'Midnight City', artist: 'M83', status: 'queued', profiles: { display_name: 'Alex' } },
    { ...song, id: 'song-3', position: 3, title: 'Sunset Lover', artist: 'Petit Biscuit', status: 'queued', profiles: { display_name: 'Sam' } },
  ]) }));
  await page.route('**/api/sessions/session-1/participants', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([
    { id: 'dj-1', display_name: 'DJ' }, { id: 'listener-1', display_name: 'Alex' }, { id: 'listener-2', display_name: 'Sam' },
  ]) }));
  await page.goto('/jam/room');
  await expect(page.locator('[class*="nowPlayingTitle"]')).toHaveText('E2E Song');
  await expect(page.getByRole('main', { name: 'Jam room' }).getByText('Midnight City')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Room details' }).getByText('Alex')).toBeVisible();
  await page.getByRole('button', { name: 'Studio' }).click({ force: true });
  await expect(page.getByRole('button', { name: 'Studio' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.getByRole('button', { name: 'Play playback' }).evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(38, 61, 42)');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Copy invite link' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
  await expect(page.getByText('playback', { exact: true })).toBeVisible();
});

test('keeps one seekbar and accessible icon controls in the graphical room', async ({ page }) => {
  await page.goto('/jam/room');
  await expect(page.locator('[class*="nowPlayingTitle"]')).toHaveText('E2E Song');
  await expect(page.getByRole('slider', { name: 'Playback position' })).toBeVisible();
  const seekTarget = await page.getByRole('slider', { name: 'Playback position' }).boundingBox();
  expect(seekTarget.height).toBeGreaterThanOrEqual(28);
  expect(await page.getByRole('slider', { name: 'Playback position' }).evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
  await expect(page.locator('.jam-persistent-player__progress')).toHaveCount(0);
  await expect(page.getByText('Song matching powered by')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy invite link' })).toBeVisible();
  await expect(page.getByLabel('DJ avatar')).toHaveText('D');
  await expect(page.getByRole('button', { name: 'Add', exact: true }).locator('svg')).toHaveCount(1);
  for (const name of ['Previous track', 'Play playback', 'Next track']) {
    const button = page.getByRole('button', { name });
    await expect(button.locator('svg')).toHaveCount(1);
    expect((await button.innerText()).trim()).toBe('');
  }
});

test('places the room mode switch within the shared player bar', async ({ page }) => {
  await page.goto('/jam/room');
  await expect(page.locator('[class*="nowPlayingTitle"]')).toHaveText('E2E Song');
  const bar = await page.locator('.jam-persistent-player').boundingBox();
  const toggle = await page.getByRole('button', { name: 'Toggle terminal interface' }).boundingBox();
  expect(bar).not.toBeNull();
  expect(toggle).not.toBeNull();
  expect(toggle.y).toBeGreaterThanOrEqual(bar.y);
  expect(toggle.y + toggle.height).toBeLessThanOrEqual(bar.y + bar.height);
  await expect(page.getByRole('button', { name: 'Toggle terminal interface' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
  await expect(page.getByRole('button', { name: 'Toggle terminal interface' })).toHaveAttribute('aria-pressed', 'true');
});

test('confirms the invite link after copying it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/jam/room');
  await page.getByRole('button', { name: 'Copy invite link' }).click();
  await expect(page.getByRole('button', { name: 'Invite link copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('http://127.0.0.1:4173/jam/room');
  await expect(page.getByRole('button', { name: 'Copy invite link' })).toBeVisible();
});

test('keeps the same iframe and playback position across both mode switches', async ({ page }) => {
  await page.route('**/api/sessions/session-1/queue', async route => {
    await new Promise(resolve => setTimeout(resolve, 120));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([song]) });
  });
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.__jamPlayers = [];
      window.YT = { PlayerState: { ENDED: 0 }, Player: class {
        constructor(element, options) {
          this.time = 87;
          this.state = 2;
          this.iframe = document.createElement('iframe');
          this.iframe.dataset.instance = String(window.__jamPlayers.length + 1);
          element.replaceWith(this.iframe);
          window.__jamPlayers.push(this);
          options.events.onReady?.();
        }
        playVideo() { this.state = 1; }
        pauseVideo() { this.state = 2; }
        seekTo(seconds) { this.time = seconds; }
        getCurrentTime() { return this.time; }
        getDuration() { return 180; }
        getPlayerState() { return this.state; }
        loadVideoById() { this.time = 0; }
        destroy() { this.iframe.remove(); }
      }};
      window.onYouTubeIframeAPIReady?.();`,
  }));

  await page.goto('/jam/room');
  const iframe = page.locator('.jam-persistent-player iframe');
  await expect(iframe).toHaveAttribute('data-instance', '1');
  const playerState = () => page.evaluate(() => ({
    instances: window.__jamPlayers.length,
    time: window.__jamPlayers.at(-1)?.getCurrentTime(),
  }));
  expect(await playerState()).toEqual({ instances: 1, time: 87 });

  await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
  await expect(page.getByText('playback', { exact: true })).toBeVisible();
  await expect(iframe).toHaveAttribute('data-instance', '1');
  expect(await playerState()).toEqual({ instances: 1, time: 87 });

  await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
  await expect(page.locator('[class*="nowPlayingTitle"]')).toHaveText('E2E Song');
  await expect(iframe).toHaveAttribute('data-instance', '1');
  expect(await playerState()).toEqual({ instances: 1, time: 87 });
});
