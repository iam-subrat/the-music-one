// ui/src/hooks/useParticipants.js — full file replacement
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useParticipants(sessionId) {
  const [participants, setParticipants] = useState([]);

  async function fetchParticipants() {
    if (!sessionId) return;
    const res = await api(`/sessions/${sessionId}/participants`);
    if (res.ok) setParticipants(await res.json());
  }

  useEffect(() => {
    if (!sessionId) return;
    fetchParticipants();
    const cleanup = openSSE(sessionId, {
      participants_changed: () => fetchParticipants(),
      onReconnect: () => fetchParticipants(),
    });
    return cleanup;
  }, [sessionId]);

  return participants;
}
