import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useSkipVotes(queueItemId) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!queueItemId) { setCount(0); return; }

    supabase.from('skip_votes').select('*', { count: 'exact', head: true }).eq('queue_item_id', queueItemId)
      .then(({ count: c }) => setCount(c ?? 0));

    const channel = supabase.channel(`skipvotes:${queueItemId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'skip_votes', filter: `queue_item_id=eq.${queueItemId}` },
        () => supabase.from('skip_votes').select('*', { count: 'exact', head: true }).eq('queue_item_id', queueItemId)
          .then(({ count: c }) => setCount(c ?? 0)))
      .subscribe();

    return () => channel.unsubscribe();
  }, [queueItemId]);

  return count;
}
