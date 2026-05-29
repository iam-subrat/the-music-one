import { API_BASE } from '../constants/config';
import { getAccessToken, getRefreshToken, storeTokens, clearTokens } from './auth';
import { EventEmitter } from 'eventemitter3';

export const authEvents = new EventEmitter();

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
} as const;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/mobile/refresh`, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await storeTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function api(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    ...(options.headers as Record<string, string> ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newToken = await getAccessToken();
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
    } else {
      await clearTokens();
      authEvents.emit('auth-failed');
    }
  }

  return res;
}
