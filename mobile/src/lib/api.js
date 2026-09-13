export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

const TOKEN_KEY = 'musicone_access_token';
const REFRESH_TOKEN_KEY = 'musicone_refresh_token';

function getCookie(name) {
  try {
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function getAccessToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) return token;
  const cookie = getCookie('access_token');
  if (cookie) {
    try { localStorage.setItem(TOKEN_KEY, cookie); } catch {}
    return cookie;
  }
  return null;
}

export function getRefreshToken() {
  const token = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (token) return token;
  const cookie = getCookie('refresh_token');
  if (cookie) {
    try { localStorage.setItem(REFRESH_TOKEN_KEY, cookie); } catch {}
    return cookie;
  }
  return null;
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
    try {
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
    } catch {}
  }

  // Fallback to cookie refresh (web / WebKit)
  try {
    const resCookie = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: CSRF_HEADER,
    });

    if (resCookie.ok) {
      const data = await resCookie.json().catch(() => null);
      if (data?.access_token) {
        setAuthTokens(data);
      } else {
        // Cookie refresh succeeded (cookie set with new token);
        // clear stale expired Bearer access token so retry uses refreshed cookie.
        localStorage.removeItem(TOKEN_KEY);
      }
      return true;
    }
  } catch {}

  // If both refresh mechanisms failed, purge stale auth tokens
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
