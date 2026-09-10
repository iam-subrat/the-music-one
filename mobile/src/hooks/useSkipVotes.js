import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useSkipVotes(queueItemId, userId, sessionId) {
  const [count, setCount] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const activeIdRef = useRef(queueItemId);

  useEffect(() => { activeIdRef.current = queueItemId; }, [queueItemId]);

  const fetchVotes = useCallback(async () => {
    if (!queueItemId) return;
    const targetId = queueItemId;
    const res = await api(`/items/${targetId}/votes`);
    if (!res.ok) return;
    const { count: c, user_ids } = await res.json();
    if (activeIdRef.current !== targetId) return;
    setCount(c ?? 0);
    setHasVoted(userId ? (user_ids ?? []).map(String).includes(String(userId)) : false);
  }, [queueItemId, userId]);

  useEffect(() => {
    setCount(0);
    setHasVoted(false);
    if (!queueItemId) return;
    fetchVotes();
  }, [fetchVotes]);

  useEffect(() => {
    if (!queueItemId || !sessionId) return;
    return openSSE(sessionId, {
      votes_changed: ({ queue_item_id }) => {
        if (!queue_item_id || String(queue_item_id) === String(queueItemId)) {
          fetchVotes();
        }
      },
      onReconnect: fetchVotes,
    });
  }, [queueItemId, sessionId, fetchVotes]);

  return { count, hasVoted };
}
