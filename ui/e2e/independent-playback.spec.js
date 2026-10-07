import { expect, test } from '@playwright/test';

const songs = [
  { id: 'a', position: 1, title: 'Midnight City', artist: 'M83', status: 'played' },
  { id: 'b', position: 2, title: 'Something About Us', artist: 'Daft Punk', status: 'queued' },
  { id: 'c', position: 3, title: 'Dreams', artist: 'Fleetwood Mac', status: 'queued' },
].map(item => ({ ...item, resolve_status: 'resolved', platform_links: {}, profiles: { display_name: 'Alex' } }));

async function fixture(page, user = 'host', theme = 'pulse') {
  const mutations = [];
  const session = { id: 'room', invite_code: 'SHARED', host_user_id: 'host', dj_user_id: 'host',
    status: 'active', playback_mode: 'independent', playback_mode_version: 1, repeat_mode: 'none' };
  await page.addInitScript(theme => {
    localStorage.setItem('musicone:gui-theme', theme);
    window.playerCreations = 0;
    window.YT = {
      PlayerState: { ENDED: 0, PLAYING: 1 },
      Player: function(element, options) {
        window.playerCreations++;
        let state = 5, time = 0;
        this.getCurrentTime = () => time; this.getDuration = () => 180; this.getPlayerState = () => state;
        this.playVideo = () => { state = 1; options.events.onStateChange({ data: 1 }); }; this.pauseVideo = () => { state = 2; };
        this.seekTo = value => { time = value; };
        this.loadVideoById = () => { state = 1; time = 0; options.events.onStateChange({ data: 1 }); };
        this.cueVideoById = () => { state = 5; time = 0; };
        this.destroy = () => {};
        window.endSong = () => options.events.onStateChange({ data: 0 });
        setTimeout(() => options.events.onReady(), 0);
      },
    };
  }, theme);
  await page.route('https://www.youtube.com/iframe_api', async route => {
    await route.fulfill({ contentType: 'text/javascript', body: 'window.onYouTubeIframeAPIReady();' });
  });
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (path.endsWith('/auth/me')) return json({ id: user, display_name: user === 'host' ? 'Alex' : 'Sam', email: user + '@example.test' });
    if (path.endsWith('/flags/')) return json([{ key: 'INDEPENDENT_PLAYBACK', enabled: true }]);
    if (path.endsWith('/sessions/SHARED')) return json(session);
    if (path.endsWith('/participants')) return json([{ id: 'host', display_name: 'Alex' }, { id: 'listener', display_name: 'Sam' }]);
    if (path.endsWith('/queue')) return json(songs);
    if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: '' });
    if (path.endsWith('/resolve-playback')) return json({ video_id: path.split('/')[3] + '1234567890' });
    if (path.endsWith('/playback-mode')) {
      const data = request.postDataJSON();
      expect(['dj', 'independent']).toContain(data.mode);
      session.playback_mode = data.mode; session.playback_mode_version++;
      return json(session);
    }
    if (!['GET', 'HEAD'].includes(request.method()) && !/\/(join|heartbeat|leave)$/.test(path)) mutations.push(path);
    if (path.endsWith('/votes')) return json({ count: 0, user_ids: [] });
    return json({});
  });
  return { mutations, session };
}

test('two listeners play independently, preserve player across GUI/TUI, and reload paused', async ({ browser }) => {
  const first = await browser.newPage(), second = await browser.newPage();
  const host = await fixture(first), guest = await fixture(second, 'listener');
  await Promise.all([first.goto('/jam/SHARED'), second.goto('/jam/SHARED')]);
  const personal = page => page.getByRole('region', { name: 'Your playback' });
  await expect(personal(first).getByText('Midnight City', { exact: true })).toBeVisible();
  await expect(personal(second).getByText('Midnight City', { exact: true })).toBeVisible();
  await expect(personal(first).getByRole('button', { name: 'Play playback' })).toBeEnabled();
  await personal(first).getByRole('button', { name: 'Play playback' }).click();
  await personal(first).getByRole('button', { name: 'Next track' }).click();
  await expect(personal(first).getByText('Something About Us', { exact: true })).toBeVisible();
  await expect(personal(second).getByText('Midnight City', { exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Toggle terminal interface' }).click();
  await expect(first.getByText('your playback', { exact: true })).toBeVisible();
  const command = first.getByPlaceholder('type `help` or `add <url>`');
  await command.fill('next'); await command.press('Enter');
  await expect(first.getByText('▶ Dreams', { exact: true })).toBeVisible();
  expect(await first.evaluate(() => window.playerCreations)).toBe(1);
  expect(host.mutations).toEqual([]); expect(guest.mutations).toEqual([]);
  await first.reload();
  await expect(first.getByText('▶ Dreams', { exact: true })).toBeVisible();
  await command.fill('play'); await command.press('Enter');
  await command.fill('mode dj'); await command.press('Enter');
  await expect(first.getByText(/Switch to DJ-led for everyone/)).toBeVisible();
  await command.fill('y'); await command.press('Enter');
  await expect(first.getByText('Room mode changed. Playback is paused.', { exact: true })).toBeVisible();
  await first.close(); await second.close();
});

for (const theme of ['pulse', 'studio']) {
  for (const width of [390, 1440]) {
    test(`Shared Queue layout: ${theme} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 960 });
      await fixture(page, 'host', theme);
      await page.goto('/jam/SHARED');
      await expect(page.getByRole('region', { name: 'Your playback' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('shared-queue.png'), fullPage: true });
      await page.getByRole('button', { name: 'DJ-led', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('mode-confirmation.png'), fullPage: true });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }
}
