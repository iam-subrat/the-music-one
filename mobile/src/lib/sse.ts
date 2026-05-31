import EventSource from 'react-native-sse';
import { API_BASE } from '../constants/config';
import { getAccessToken } from './auth';

export async function openSSE(
  sessionId: string,
  handlers: Record<string, (payload: unknown) => void> & { onReconnect?: () => void }
): Promise<() => void> {
  const token = await getAccessToken();
  const es = new EventSource(`${API_BASE}/api/sessions/${sessionId}/stream`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  es.addEventListener('message', (event) => {
    try {
      const data = (event as unknown as { data?: string }).data ?? '';
      const { type, payload } = JSON.parse(data);
      (handlers as Record<string, (p: unknown) => void>)[type]?.(payload);
    } catch { /* malformed event */ }
  });

  es.addEventListener('error', () => {
    handlers.onReconnect?.();
  });

  return () => es.close();
}
