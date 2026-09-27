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
  await page.goto('/jam/room');
  await expect(page.locator('[class*="nowPlayingTitle"]')).toHaveText('E2E Song');
  await page.getByRole('button', { name: 'Studio' }).click({ force: true });
  await expect(page.getByRole('button', { name: 'Studio' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
  await expect(page.getByText(/now playing/i)).toBeVisible();
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
  await expect(page.getByText(/now playing/i)).toBeVisible();
  await expect(iframe).toHaveAttribute('data-instance', '1');
  expect(await playerState()).toEqual({ instances: 1, time: 87 });

  await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
  await expect(page.locator('[class*="nowPlayingTitle"]')).toHaveText('E2E Song');
  await expect(iframe).toHaveAttribute('data-instance', '1');
  expect(await playerState()).toEqual({ instances: 1, time: 87 });
});
