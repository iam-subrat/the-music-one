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
