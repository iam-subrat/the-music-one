import { expect, test } from 'vitest';
import { readySong } from './queuePresentation';

test('previews the first ready queued track in position order without mutating items', () => {
  const items = [{ id: 'pending', position: 1, status: 'queued', resolve_status: 'resolving' },
    { id: 'last', position: 3, status: 'queued' }, { id: 'first', position: 2, status: 'queued' }];
  expect(readySong(items).id).toBe('first');
  expect(items.map(item => item.id)).toEqual(['pending', 'last', 'first']);
  expect(items.every(item => item.status === 'queued')).toBe(true);
});

test('allows restarting a completed repeat queue without previewing failed or skipped tracks', () => {
  const items = [{ id: 'failed', position: 1, status: 'played', resolve_status: 'failed' },
    { id: 'skipped', position: 2, status: 'skipped' }, { id: 'played', position: 3, status: 'played' }];
  expect(readySong(items, 'queue')?.id).toBe('played');
  expect(readySong(items, 'none')).toBeNull();
});
