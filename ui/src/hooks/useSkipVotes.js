import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useSkipVotes(queueItemId, userId, sessionId) {
  const [count, setCount] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);

  function applyVotes({ queue_item_id, count: c, user_ids }) {
    if (String(queue_item_id) !== String(queueItemId)) return;
    setCount(c ?? 0);
    setHasVoted(userId ? user_ids?.includes(userId) : false);
  }

  useEffect(() => {
    if (!queueItemId) { setCount(0); setHasVoted(false); return; }
    if (!sessionId) return;
    const cleanup = openSSE(sessionId, {
      votes_changed: applyVotes,
      onReconnect: () => { setCount(0); setHasVoted(false); },
    });
    return cleanup;
  }, [queueItemId, userId, sessionId]);

  return { count, hasVoted };
}
