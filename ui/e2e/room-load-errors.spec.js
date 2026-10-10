import { expect, test } from '@playwright/test';

for (const surface of ['gui', 'tui', 'mobile']) {
  test(`${surface}: room API failures are retryable, not missing rooms`, async ({ page }, testInfo) => {
    if (surface === 'tui') await page.addInitScript(() => localStorage.setItem('musicone:tui-mode', '1'));
    let failed = true;
    const room = { id: 'room', invite_code: 'ERRORS', host_user_id: 'host', dj_user_id: 'host',
      status: 'active', playback_mode: 'independent', playback_mode_version: 0, repeat_mode: 'none' };
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
      if (path.endsWith('/auth/me')) return json({ id: 'host', display_name: 'Host' });
      if (path.endsWith('/flags/')) return json([{ key: 'INDEPENDENT_PLAYBACK', enabled: true }]);
      if (path.endsWith('/sessions/ERRORS')) return failed
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Service unavailable"}' })
        : json(room);
      if (path.endsWith('/participants')) return json([{ id: 'host', display_name: 'Host' }]);
      if (path.endsWith('/queue')) return json([]);
      if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: '' });
      return json({});
    });
    await page.goto(surface === 'mobile' ? 'http://127.0.0.1:4185/jam/ERRORS' : '/jam/ERRORS');
    await expect(page.getByText('Could not load the room. Please try again.', { exact: true })).toBeVisible();
    await expect(page.getByText('Session not found.', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('room-load-error.png'), fullPage: true });
    failed = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByText('Could not load the room. Please try again.', { exact: true })).toHaveCount(0);
    await expect(page.getByText(surface === 'tui' ? 'playback' : 'Shared Queue', { exact: true }).first()).toBeVisible();
  });
}
