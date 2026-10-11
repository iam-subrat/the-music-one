import { describe, expect, it } from 'vitest';
import { eligibleItems, nextItem, previousItem, readCheckpoint } from './independentQueue';

const items = [
  { id: 'a', position: 1, status: 'played', resolve_status: 'resolved' },
  { id: 'b', position: 2, status: 'playing', resolve_status: 'resolved' },
  { id: 'c', position: 3, status: 'skipped', resolve_status: 'resolved' },
  { id: 'd', position: 4, status: 'queued', resolve_status: 'resolving' },
];
describe('independent queue policy', () => {
  it('keeps DJ history available and excludes room-skipped songs', () => {
    expect(eligibleItems(items).map(x => x.id)).toEqual(['a', 'b', 'd']);
  });
  it('advances by stable position without changing the catalog', () => {
    const before = structuredClone(items);
    expect(nextItem(items, items[1], 'none').id).toBe('d');
    expect(items).toEqual(before);
    expect(nextItem(items, items[3], 'none')).toBeNull();
    expect(nextItem(items, items[3], 'queue').id).toBe('a');
    expect(nextItem(items, items[1], 'song').id).toBe('d');
  });
  it('continues after a removed current song and excludes local failures', () => {
    expect(nextItem(items, { id: 'gone', position: 2 }, 'none', ['d'])).toBeNull();
  });
  it('selects the preceding item independently of global status', () => {
    expect(previousItem(items, items[1]).id).toBe('a');
    expect(previousItem(items, items[0]).id).toBe('a');
  });
  it('rejects malformed or old-epoch checkpoints and bounds restored time', () => {
    expect(readCheckpoint('{broken', 2)).toBeNull();
    expect(readCheckpoint(JSON.stringify({ schema: 1, epoch: 1, itemId: 'a' }), 2)).toBeNull();
    expect(readCheckpoint(JSON.stringify({ schema: 1, epoch: 2, itemId: 'a', time: -2, repeat: 'bad' }), 2))
      .toEqual({ itemId: 'a', time: 0, repeat: 'none' });
  });
});
