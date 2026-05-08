// VITE_API_URL: set to FastAPI origin in production (e.g. https://api.yourdomain.com).
// Empty string in local dev — Vite proxy handles /api → localhost:8000.
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

export async function api(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const res = await fetch(`${API_BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...CSRF_HEADER, ...headers },
    ...rest,
  });

  if (res.status === 401) {
    const refreshed = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: CSRF_HEADER,
    });
    if (!refreshed.ok) return res;
    return fetch(`${API_BASE}/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...CSRF_HEADER, ...headers },
      ...rest,
    });
  }

  return res;
}
