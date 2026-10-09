import { expect, test } from '@playwright/test';

const songs = [
  { id: 'a', position: 1, title: 'Midnight City', artist: 'M83', status: 'played' },
  { id: 'b', position: 2, title: 'Something About Us', artist: 'Daft Punk', status: 'queued' },
  { id: 'c', position: 3, title: 'Dreams', artist: 'Fleetwood Mac', status: 'queued' },
].map(item => ({ ...item, resolve_status: 'resolved', platform_links: {}, profiles: { display_name: 'Alex' } }));

async function fixture(page, user = 'host', theme = 'pulse', mode = 'independent') {
  const mutations = [];
  const queue = songs.map(item => ({ ...item, platform_links: { youtube: `https://youtu.be/${item.id}1234567890` } }));
  const session = { id: 'room', invite_code: 'SHARED', host_user_id: 'host', dj_user_id: 'host',
    status: 'active', playback_mode: mode, playback_mode_version: 1, repeat_mode: 'none' };
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
    if (path.endsWith('/queue')) return json(queue);
    if (path.endsWith('/repeat-mode')) { session.repeat_mode = request.postDataJSON().mode; return json(session); }
    if (/\/(next|previous)$/.test(path)) {
      const current = queue.findIndex(item => item.status === 'playing');
      const target = queue[current + (path.endsWith('/previous') ? -1 : 1)];
      if (target) queue.forEach(item => { if (item === target) item.status = 'playing'; else if (item.status === 'playing') item.status = 'played'; });
      return json({ next_item_id: target?.id ?? null });
    }
    if (/\/queue\/items\/[^/]+\/play$/.test(path)) {
      const id = path.split('/').at(-2);
      queue.forEach(item => { if (item.id === id) item.status = 'playing'; else if (item.status === 'playing') item.status = 'played'; });
      mutations.push(path);
      return json({ next_item_id: id });
    }
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

for (const mode of ['dj', 'independent']) {
  for (const surface of ['gui', 'tui']) {
    test(`loaded tracks can navigate before Play and after reload in ${mode} ${surface}`, async ({ page }) => {
      const { mutations } = await fixture(page, 'host', 'pulse', mode);
      await page.goto('/jam/SHARED');
      if (surface === 'tui') await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
      const selectedTitle = title => surface === 'tui' ? page.getByText(`▶ ${title}`, { exact: true })
        : page.getByRole('region', { name: mode === 'dj' ? 'Playback' : 'Your playback', exact: true }).getByText(title, { exact: true });
      const initial = mode === 'dj' ? 'Something About Us' : 'Midnight City';
      const next = mode === 'dj' ? 'Dreams' : 'Something About Us';
      await expect(selectedTitle(initial)).toBeVisible();
      await page.getByRole('button', { name: 'Next track', exact: true }).click();
      await expect(selectedTitle(next)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play playback', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Previous track', exact: true }).click();
      await expect(selectedTitle(initial)).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Next track', exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Previous track', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Play playback', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
      if (mode === 'independent') expect(mutations).toEqual([]);
    });
    test(`track navigation preserves playback in ${mode} ${surface}`, async ({ page }) => {
      await fixture(page, 'host', 'pulse', mode);
      await page.goto('/jam/SHARED');
      if (surface === 'tui') await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
      const selectedTitle = title => surface === 'tui'
        ? page.getByText(`▶ ${title}`, { exact: true })
        : page.getByRole('region', { name: mode === 'dj' ? 'Playback' : 'Your playback', exact: true }).getByText(title, { exact: true });
      await page.getByRole('button', { name: 'Play playback', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Next track', exact: true }).click();
      await expect(selectedTitle(mode === 'dj' ? 'Dreams' : 'Something About Us')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Previous track', exact: true }).click();
      await expect(selectedTitle(mode === 'dj' ? 'Something About Us' : 'Midnight City')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
      expect(await page.evaluate(() => window.playerCreations)).toBe(1);
      await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Play playback', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Next track', exact: true }).click();
      await expect(selectedTitle(mode === 'dj' ? 'Dreams' : 'Something About Us')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play playback', exact: true })).toBeVisible();
    });
  }
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
  await expect(first.getByText('playback', { exact: true })).toBeVisible();
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
    for (const mode of ['dj', 'independent']) {
      test(`Footer transport: ${mode} ${theme} at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 960 });
        const { mutations } = await fixture(page, 'host', theme, mode);
        await page.goto('/jam/SHARED');
        const player = page.getByRole('region', { name: mode === 'dj' ? 'Playback' : 'Your playback', exact: true });
        if (mode === 'dj') await player.getByRole('button', { name: 'Play playback', exact: true }).click();
        const footer = page.getByRole('group', { name: 'Now playing footer' });
        await expect(footer).toBeVisible();
        if (mode === 'independent') {
          await footer.getByRole('button', { name: 'Play current song' }).click();
          await expect(player.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
        }
        await footer.getByRole('button', { name: 'Pause current song' }).click();
        await expect(player.getByRole('button', { name: 'Play playback', exact: true })).toBeVisible();
        await footer.getByRole('button', { name: 'Play current song' }).click();
        await expect(player.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
        await player.getByRole('button', { name: 'Pause playback', exact: true }).click();
        await footer.locator('button').evaluate(button => button.click());
        await expect(player.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
        await player.getByRole('button', { name: 'Next track', exact: true }).click();
        await expect(footer.getByText(mode === 'dj' ? 'Dreams' : 'Something About Us', { exact: true })).toBeVisible();
        await expect(footer.getByRole('button', { name: 'Pause current song' })).toBeEnabled();
        const copy = await footer.locator('.jam-persistent-player__copy').boundingBox();
        const toggle = await page.getByRole('button', { name: 'Toggle terminal interface' }).boundingBox();
        expect(copy.x + copy.width).toBeLessThanOrEqual(toggle.x - 8);
        await page.screenshot({ path: testInfo.outputPath('footer-transport.png'), fullPage: true });
        await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
        await expect(footer).toBeHidden();
        await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
        await expect(footer.getByRole('button', { name: 'Pause current song' })).toBeEnabled();
        expect(await page.evaluate(() => window.playerCreations)).toBe(1);
        if (mode === 'independent') expect(mutations).toEqual([]);
      });
    }
    test(`Playback status spacing: ${theme} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 960 });
      await fixture(page, 'host', theme);
      await page.goto('/jam/SHARED');
      const player = page.getByRole('region', { name: 'Your playback' });
      const status = player.getByRole('status');
      await expect(status).toHaveText('Ready');
      const mode = await page.getByRole('button', { name: 'Shared Queue', exact: true }).evaluate(button => button.parentElement.parentElement.getBoundingClientRect().bottom);
      const label = status.locator(':scope > span').last();
      expect((await label.boundingBox()).y - mode).toBeGreaterThanOrEqual(16);
      await player.getByRole('button', { name: 'Play playback', exact: true }).click();
      await expect(status).toHaveText('Playing');
      const bars = status.locator('i');
      await expect(bars).toHaveCount(3);
      await expect(bars.first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('playing-status.png'), fullPage: true });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await bars.first().evaluate(bar => getComputedStyle(bar).animationName)).toBe('none');
      await player.getByRole('button', { name: 'Pause playback', exact: true }).click();
      await expect(status).toHaveText('Paused');
      await expect(bars.first()).toBeHidden();
      await page.getByRole('button', { name: 'DJ-led', exact: true }).click();
      await page.getByRole('button', { name: 'Change mode', exact: true }).click();
      const dj = page.getByRole('region', { name: 'Playback', exact: true });
      await dj.getByRole('button', { name: 'Play playback', exact: true }).click();
      await expect(dj.getByRole('status')).toHaveText('Playing');
      await expect(dj.getByRole('status').locator('i').first()).toBeVisible();
    });
    test(`Shared Queue layout: ${theme} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 960 });
      await fixture(page, 'host', theme);
      await page.goto('/jam/SHARED');
      await expect(page.getByRole('region', { name: 'Your playback' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Your playback' }).getByText('Ready', { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Your playback' }).getByRole('button', { name: 'Next track', exact: true })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('shared-queue.png'), fullPage: true });
      await page.getByRole('button', { name: 'Repeat: Off' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('repeat-menu.png'), fullPage: true });
      await page.getByRole('menu').press('Escape');
      await page.getByRole('button', { name: 'DJ-led', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('mode-confirmation.png'), fullPage: true });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: 'DJ-led', exact: true }).click();
      await page.getByRole('button', { name: 'Change mode', exact: true }).click();
      const dj = page.getByRole('region', { name: 'Playback', exact: true });
      await expect(dj.getByText('Something About Us', { exact: true })).toBeVisible();
      await expect(dj.getByRole('button', { name: 'Previous track', exact: true })).toBeEnabled();
      await expect(dj.getByRole('button', { name: 'Next track', exact: true })).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath('dj-ready.png'), fullPage: true });
      await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
      await expect(page.getByText('READY', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('tui-ready.png'), fullPage: true });
    });
  }
}

test('TUI cues the first DJ song, starts explicitly, and shares controls across modes', async ({ page }) => {
  await fixture(page, 'host', 'pulse', 'dj');
  await page.goto('/jam/SHARED');
  await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
  await expect(page.getByText('▶ Something About Us', { exact: true })).toBeVisible();
  await expect(page.getByText('READY', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next track', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.playerCreations)).toBe(0);
  await page.getByRole('button', { name: 'Play playback', exact: true }).click();
  await expect(page.getByText('PLAYING', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next track', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Repeat: Off' }).click();
  await page.getByRole('menuitemradio', { name: 'Queue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Repeat: Queue' })).toBeVisible();
});

test('pending first Play survives switching from GUI to TUI before the queue refresh', async ({ page }) => {
  await fixture(page, 'host', 'pulse', 'dj');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/queue/items/b/play', async route => {
    await gate;
    await route.fallback();
  });
  await page.goto('/jam/SHARED');
  await page.getByRole('region', { name: 'Playback', exact: true }).getByRole('button', { name: 'Play playback' }).click();
  await page.getByRole('button', { name: 'Toggle terminal interface' }).click();
  await expect(page.getByText('READY', { exact: true })).toBeVisible();
  release();
  await expect(page.getByText('PLAYING', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.playerCreations)).toBe(1);
});

test('the DJ can start the cued song from the shared queue row', async ({ page }) => {
  await fixture(page, 'host', 'pulse', 'dj');
  await page.goto('/jam/SHARED');
  await page.getByRole('button', { name: 'Play Something About Us', exact: true }).click();
  const player = page.getByRole('region', { name: 'Playback', exact: true });
  await expect(player.getByRole('button', { name: 'Pause playback' })).toBeVisible();
  await expect(player.getByText('Playing', { exact: true })).toBeVisible();
});
