import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getParticipants } from '../lib/session';

export function useParticipants(sessionId) {
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    if (!sessionId) return;
    getParticipants(sessionId).then(setParticipants);

    const channel = supabase.channel(`participants:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants', filter: `session_id=eq.${sessionId}` },
        () => getParticipants(sessionId).then(setParticipants))
      .subscribe();

    return () => channel.unsubscribe();
  }, [sessionId]);

  return participants;
}
