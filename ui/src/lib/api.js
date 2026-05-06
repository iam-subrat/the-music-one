// ui/src/lib/api.js
const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

export async function api(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...CSRF_HEADER, ...headers },
    ...rest,
  });

  if (res.status === 401) {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: CSRF_HEADER,
    });
    if (!refreshed.ok) return res;
    return fetch(`/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...CSRF_HEADER, ...headers },
      ...rest,
    });
  }

  return res;
}
