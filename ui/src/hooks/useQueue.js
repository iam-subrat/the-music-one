// ui/src/hooks/useQueue.js — full file replacement
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useQueue(sessionId) {
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const res = await api(`/sessions/${sessionId}/queue`);
    if (!res.ok) { console.warn('[useQueue] refresh failed', res.status); return; }
    const data = await res.json();
    const playing = data.find((i) => i.status === 'playing');
    console.log('[useQueue] refresh', { count: data.length, playingId: playing?.id, title: playing?.title });
    setItems(data);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    refresh();
    const cleanup = openSSE(sessionId, {
      queue_changed: () => { console.log('[useQueue] queue_changed received'); refresh(); },
      onReconnect: () => { console.log('[useQueue] onReconnect'); refresh(); },
    });
    return cleanup;
  }, [sessionId]);

  const addItem = useCallback((item) => {
    setItems(prev => [...prev, item]);
  }, []);

  return { items, refresh, addItem };
}
