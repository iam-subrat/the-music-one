import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useSession(code) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchSession() {
    if (!code) return null;
    const res = await api(`/sessions/${code}`);
    if (res.ok) {
      const data = await res.json();
      setSession(data);
      return data;
    }
    setSession(null);
    return null;
  }

  useEffect(() => {
    if (!code) return;
    fetchSession().finally(() => setLoading(false));
  }, [code]);

  // session?.id in dep array — React tracks state, not refs
  useEffect(() => {
    if (!session?.id) return;
    return openSSE(session.id, {
      session_updated: (payload) => setSession(prev => ({ ...prev, ...payload })),
      onReconnect: () => fetchSession(),
    });
  }, [session?.id]);

  return { session, loading, setSession };
}
