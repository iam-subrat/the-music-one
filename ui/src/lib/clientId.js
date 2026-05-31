const KEY = 'musicone_client_id';

export function getClientId() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return 'legacy';
  }
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionStorage.setItem(KEY, id);
  }
  return id;
}
