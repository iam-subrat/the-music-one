export function readySong(items = [], repeat = 'none') {
  const eligible = (status) => items
    .filter(item => item.status === status && item.resolve_status !== 'failed' && item.resolve_status !== 'resolving')
    .sort((a, b) => a.position - b.position);

  const queued = eligible('queued')[0];
  if (queued) return queued;

  if (repeat === 'queue') {
    return eligible('played')[0] ?? null;
  }

  return null;
}
