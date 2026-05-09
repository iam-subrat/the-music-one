// ui/src/hooks/useQueue.js — full file replacement
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useQueue(sessionId) {
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const res = await api(`/sessions/${sessionId}/queue`);
    if (res.ok) setItems(await res.json());
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    refresh();
    const cleanup = openSSE(sessionId, {
      queue_changed: () => refresh(),
      onReconnect: () => refresh(),
    });
    return cleanup;
  }, [sessionId]);

  const addItem = useCallback((item) => {
    setItems(prev => [...prev, item]);
  }, []);

  return { items, refresh, addItem };
}
