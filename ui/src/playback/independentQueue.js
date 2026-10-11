export function eligibleItems(items = [], failed = []) {
  return items.filter(item => item.status !== 'skipped' && item.resolve_status !== 'failed' && !failed.includes(item.id))
    .sort((a, b) => a.position - b.position);
}

export function nextItem(items, current, repeat = 'none', failed = []) {
  const eligible = eligibleItems(items, failed);
  return eligible.find(item => !current || item.position > current.position)
    ?? (repeat === 'queue' ? eligible[0] : null) ?? null;
}

export function previousItem(items, current) {
  const eligible = eligibleItems(items);
  return eligible.filter(item => item.position < (current?.position ?? Infinity)).at(-1)
    ?? eligible[0] ?? null;
}

export function readCheckpoint(raw, epoch) {
  try {
    const value = JSON.parse(raw);
    if (value?.schema !== 1 || value.epoch !== epoch || typeof value.itemId !== 'string') return null;
    return { itemId: value.itemId, time: Number.isFinite(value.time) ? Math.max(0, value.time) : 0,
      repeat: ['none', 'song', 'queue'].includes(value.repeat) ? value.repeat : 'none' };
  } catch { return null; }
}
