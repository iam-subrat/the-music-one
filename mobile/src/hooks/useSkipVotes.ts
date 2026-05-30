import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

interface VotesPayload {
  count?: number;
  user_ids?: (string | number)[];
}

interface VotesChangedPayload {
  queue_item_id?: string | number;
}

export function useSkipVotes(
  queueItemId: string | null,
  userId: string | null,
  sessionId: string | null,
) {
  const [count, setCount] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const activeIdRef = useRef(queueItemId);

  useEffect(() => { activeIdRef.current = queueItemId; }, [queueItemId]);

  const fetchVotes = useCallback(async () => {
    if (!queueItemId) return;
    const targetId = queueItemId;
    const res = await api(`/items/${targetId}/votes`);
    if (!res.ok) return;
    const { count: c, user_ids }: VotesPayload = await res.json();
    if (activeIdRef.current !== targetId) return;
    setCount(c ?? 0);
    const ids = (user_ids ?? []).map(String);
    setHasVoted(userId ? ids.includes(String(userId)) : false);
  }, [queueItemId, userId]);

  useEffect(() => {
    if (!queueItemId) {
      setCount(0);
      setHasVoted(false);
      return;
    }
    fetchVotes();
  }, [fetchVotes, queueItemId]);

  useEffect(() => {
    if (!queueItemId || !sessionId) return;
    let cleanup: (() => void) | undefined;
    openSSE(sessionId, {
      votes_changed: (payload) => {
        const { queue_item_id } = payload as VotesChangedPayload;
        if (!queue_item_id || String(queue_item_id) === String(queueItemId)) {
          fetchVotes();
        }
      },
      onReconnect: () => { fetchVotes(); },
    }).then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [queueItemId, sessionId, fetchVotes]);

  return { count, hasVoted };
}
