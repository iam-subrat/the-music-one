import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getQueue } from '../lib/queue';

export function useQueue(sessionId) {
  const [items, setItems] = useState([]);

  const refresh = useCallback(() => {
    if (sessionId) getQueue(sessionId).then(setItems);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    getQueue(sessionId).then(setItems);

    const channel = supabase.channel(`queue:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_items', filter: `session_id=eq.${sessionId}` },
        () => getQueue(sessionId).then(setItems))
      .subscribe();

    return () => channel.unsubscribe();
  }, [sessionId]);

  return { items, refresh };
}
