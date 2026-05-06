// ui/src/lib/sse.js

/**
 * Opens an SSE connection to /api/sessions/{sessionId}/stream.
 * handlers: { session_updated, queue_changed, participants_changed, votes_changed, onReconnect }
 * Returns a cleanup function.
 */
export function openSSE(sessionId, handlers) {
  const es = new EventSource(`/api/sessions/${sessionId}/stream`, { withCredentials: true });

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
