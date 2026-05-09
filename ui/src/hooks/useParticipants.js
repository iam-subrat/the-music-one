import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useParticipants(sessionId) {
  const [participants, setParticipants] = useState([]);

  const fetchParticipants = useCallback(async () => {
    if (!sessionId) return;
    const res = await api(`/sessions/${sessionId}/participants`);
    if (res.ok) setParticipants(await res.json());
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    fetchParticipants();
    const cleanup = openSSE(sessionId, {
      participants_changed: () => fetchParticipants(),
      onReconnect: () => fetchParticipants(),
    });
    return cleanup;
  }, [sessionId, fetchParticipants]);

  return { participants, refresh: fetchParticipants };
}
