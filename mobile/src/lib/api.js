export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

const TOKEN_KEY = 'musicone_access_token';
const REFRESH_TOKEN_KEY = 'musicone_refresh_token';

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens({ access_token, refresh_token }) {
  if (access_token) localStorage.setItem(TOKEN_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
}

export function clearAuthTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let refreshPromise = null;

async function doRefresh() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    // Mobile Bearer refresh
    const res = await fetch(`${API_BASE}/api/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CSRF_HEADER },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (res.ok) {
      const data = await res.json();
      setAuthTokens(data);
      return true;
    }
  }

  // Fallback to cookie refresh (web)
  const resCookie = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: CSRF_HEADER,
  });

  if (resCookie.ok) return true;

  clearAuthTokens();
  return false;
}

export async function api(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const token = getAccessToken();
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  const requestHeaders = {
    'Content-Type': 'application/json',
    ...CSRF_HEADER,
    ...authHeader,
    ...headers,
  };

  const res = await fetch(`${API_BASE}/api${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: requestHeaders,
    ...rest,
  });

  if (res.status === 401) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => {
        refreshPromise = null;
      });
    }

    const success = await refreshPromise;
    if (!success) return res;

    // Retry original request with updated token
    const newToken = getAccessToken();
    const newAuthHeader = newToken ? { Authorization: `Bearer ${newToken}` } : {};

    return fetch(`${API_BASE}/api${path}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...CSRF_HEADER,
        ...newAuthHeader,
        ...headers,
      },
      ...rest,
    });
  }

  return res;
}
