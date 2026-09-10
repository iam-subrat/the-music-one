const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const connections = new Map();

export function openSSE(sessionId, handlers) {
  let conn = connections.get(sessionId);
  if (!conn) {
    const es = new EventSource(`${API_BASE}/api/sessions/${sessionId}/stream`, { withCredentials: true });
    conn = { es, handlersSet: new Set(), lastReconnect: 0 };
    connections.set(sessionId, conn);

    es.onmessage = (e) => {
      try {
        const { type, payload } = JSON.parse(e.data);
        for (const h of conn.handlersSet) {
          h[type]?.(payload);
        }
      } catch { /* malformed event — ignore */ }
    };

    es.onerror = () => {
      const now = Date.now();
      if (now - conn.lastReconnect > 15000) {
        conn.lastReconnect = now;
        for (const h of conn.handlersSet) {
          h.onReconnect?.();
        }
      }
    };
  }

  conn.handlersSet.add(handlers);

  return () => {
    conn.handlersSet.delete(handlers);
    if (conn.handlersSet.size === 0) {
      conn.es.close();
      connections.delete(sessionId);
    }
  };
}
