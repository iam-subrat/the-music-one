import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';
import { QueueItem } from '../lib/queue';

export function useQueue(sessionId: string | null) {
  const [items, setItems] = useState<QueueItem[]>([]);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const res = await api(`/sessions/${sessionId}/queue`);
    if (res.ok) setItems(await res.json());
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    refresh();
    let cleanup: (() => void) | undefined;
    openSSE(sessionId, {
      queue_changed: () => { refresh(); },
      onReconnect: () => { refresh(); },
    }).then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [sessionId, refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const addItem = useCallback((item: QueueItem) => {
    setItems((prev) => [...prev, item]);
  }, []);

  return { items, refresh, addItem };
}
