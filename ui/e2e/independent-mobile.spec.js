import { expect, test } from '@playwright/test';

for (const userId of ['host', 'listener']) {
  test(`mobile Delete vote presentation for ${userId}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('https://themusic.one/bridge**', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      if (path.endsWith('/auth/me')) return json({ id: userId, display_name: 'Alex' });
      if (path.endsWith('/sessions/ROOM')) return json({ id: 'room', invite_code: 'ROOM', status: 'active', playback_mode: 'dj', playback_mode_version: 1, host_user_id: 'host', dj_user_id: 'host' });
      if (path.endsWith('/participants')) return json([{ id: 'host', display_name: 'Alex' }, { id: 'listener', display_name: 'Sam' }]);
      if (path.endsWith('/queue')) return json([{ id: 'a', position: 1, status: 'playing', title: 'Midnight City', artist: 'M83', platform_links: {} }, { id: 'b', position: 2, status: 'queued', title: 'Dreams', artist: 'Fleetwood Mac', platform_links: {} }]);
      if (path.endsWith('/votes')) return json({ count: 1, user_ids: [userId] });
      if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: '' });
      return json({});
    });
    await page.goto('http://127.0.0.1:4185/jam/ROOM', { waitUntil: 'domcontentloaded' });
    for (const title of ['Midnight City', 'Dreams']) {
      const button = page.getByRole('button', { name: new RegExp(`delete ${title}`, 'i') });
      await expect(button).toHaveText('Delete1/2 votes');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(button).toHaveAttribute('title', /Remove your vote/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.getByRole('heading', { name: 'Midnight City', exact: true }).boundingBox()).width).toBeGreaterThan(120);
    expect((await page.getByRole('heading', { name: 'Dreams', exact: true }).boundingBox()).width).toBeGreaterThan(120);
    if (userId === 'host') {
      const previous = await page.getByTitle('Previous', { exact: true }).boundingBox();
      const next = await page.getByTitle('Next', { exact: true }).boundingBox();
      expect(next.y).toBe(previous.y);
    }
    await page.screenshot({ path: testInfo.outputPath('mobile-delete-votes.png'), fullPage: true });
  });
}

test('Capacitor web view cues paused and uses local transport without DJ writes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = [];
  const room = { id: 'room', invite_code: 'SHARED', status: 'active',
    playback_mode: 'independent', playback_mode_version: 1, host_user_id: 'user', dj_user_id: 'user' };
  await page.route('https://themusic.one/bridge', route => route.fulfill({
    contentType: 'text/html',
    body: `<script>
      let videoId, state = 5;
      window.addEventListener('message', e => {
        const data = e.data;
        if (['LOAD', 'CUE'].includes(data.type)) { videoId = data.videoId; state = data.type === 'CUE' ? 5 : 1; }
        if (data.type === 'PLAY') state = 1;
        if (data.type === 'PAUSE') state = 2;
        parent.postMessage({type:'STATE_CHANGE', state, duration:180, videoId}, '*');
      });
      parent.postMessage({type:'READY', protocol:2}, '*');
    </script>`,
  }));
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    if (path.endsWith('/flags/')) return json([{ key: 'INDEPENDENT_PLAYBACK', enabled: true }]);
    if (path.endsWith('/auth/me')) return json({ id: 'user', display_name: 'Alex' });
    if (path.endsWith('/sessions/SHARED')) return json(room);
    if (path.endsWith('/playback-mode')) {
      expect(request.postDataJSON()).toEqual({ mode: 'dj', expected_version: 1 });
      room.playback_mode = 'dj'; room.playback_mode_version++;
      return json(room);
    }
    if (path.endsWith('/participants')) return json([{ id: 'user', display_name: 'Alex' }]);
    if (path.endsWith('/queue')) return json([{ id: 'a', position: 1, status: 'played', resolve_status: 'resolved', title: 'Midnight City', artist: 'M83' },
      { id: 'b', position: 2, status: 'queued', resolve_status: 'resolved', title: 'Dreams', artist: 'Fleetwood Mac' }]);
    if (path.endsWith('/resolve-playback')) return json({ video_id: path.split('/')[3] + '1234567890' });
    if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: '' });
    if (request.method() !== 'GET' && !/\/(join|heartbeat|leave)$/.test(path)) writes.push(path);
    return json({});
  });
  await page.goto('http://127.0.0.1:4185/jam/SHARED');
  const player = page.getByRole('region', { name: 'Your playback' });
  await expect(player.getByRole('button', { name: 'Play playback' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('mobile-shared-queue.png'), fullPage: true });
  await player.getByRole('button', { name: 'Play playback' }).click();
  await expect(player.getByRole('button', { name: 'Pause playback' })).toBeVisible();
  await player.getByRole('button', { name: 'Next track' }).click();
  await expect(player.getByText('Dreams', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'DJ-led', exact: true }).click();
  await expect(player).toHaveCount(0);
});
