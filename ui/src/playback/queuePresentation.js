export function readySong(items = [], repeat = 'none') {
  return items.filter(item => (item.status === 'queued' || (repeat === 'queue' && item.status === 'played')) && item.resolve_status !== 'failed' && item.resolve_status !== 'resolving')
    .sort((a, b) => a.position - b.position)[0] ?? null;
}
