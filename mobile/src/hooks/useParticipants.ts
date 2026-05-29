import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export interface Participant {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function useParticipants(sessionId: string | null) {
  const [participants, setParticipants] = useState<Participant[]>([]);

  const fetchParticipants = useCallback(async () => {
    if (!sessionId) return;
    const res = await api(`/sessions/${sessionId}/participants`);
    if (res.ok) setParticipants(await res.json());
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    fetchParticipants();
    let cleanup: (() => void) | undefined;
    openSSE(sessionId, {
      participants_changed: () => { fetchParticipants(); },
      onReconnect: () => { fetchParticipants(); },
    }).then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [sessionId, fetchParticipants]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        fetchParticipants();
      }
    });
    return () => sub.remove();
  }, [fetchParticipants]);

  return { participants, refresh: fetchParticipants };
}
