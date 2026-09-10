import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useSession(code) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    if (!code) return null;
    const res = await api(`/sessions/${code}`);
    if (res.ok) {
      const data = await res.json();
      setSession(data);
      return data;
    }
    setSession(null);
    return null;
  }, [code]);

  useEffect(() => {
    if (!code) return;
    fetchSession().finally(() => setLoading(false));
  }, [code, fetchSession]);

  useEffect(() => {
    if (!session?.id) return;
    return openSSE(session.id, {
      session_updated: (payload) => setSession(prev => ({ ...prev, ...payload })),
      onReconnect: () => fetchSession(),
    });
  }, [session?.id, fetchSession]);

  return { session, loading, setSession };
}
