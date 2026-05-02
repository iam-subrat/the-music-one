import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useSkipVotes(queueItemId, userId) {
  const [count, setCount] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    if (!queueItemId) { setCount(0); setHasVoted(false); return; }

    async function fetch() {
      const [{ count: c }, { data: vote }] = await Promise.all([
        supabase.from('skip_votes').select('*', { count: 'exact', head: true }).eq('queue_item_id', queueItemId),
        userId
          ? supabase.from('skip_votes').select('user_id').eq('queue_item_id', queueItemId).eq('user_id', userId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setCount(c ?? 0);
      setHasVoted(!!vote);
    }

    fetch();

    const channel = supabase.channel(`skipvotes:${queueItemId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'skip_votes', filter: `queue_item_id=eq.${queueItemId}` },
        fetch)
      .subscribe();

    return () => channel.unsubscribe();
  }, [queueItemId, userId]);

  return { count, hasVoted };
}
