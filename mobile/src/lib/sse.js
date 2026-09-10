const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function openSSE(sessionId, handlers) {
  const es = new EventSource(`${API_BASE}/api/sessions/${sessionId}/stream`, { withCredentials: true });

  es.onmessage = (e) => {
    try {
      const { type, payload } = JSON.parse(e.data);
      handlers[type]?.(payload);
    } catch { /* malformed event — ignore */ }
  };

  es.onerror = () => {
    handlers.onReconnect?.();
  };

  return () => es.close();
}
