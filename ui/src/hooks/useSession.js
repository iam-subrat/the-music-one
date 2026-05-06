// ui/src/hooks/useSession.js — full file replacement
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useSession(code) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionIdRef = useRef(null);

  async function fetchSession() {
    if (!code) return;
    const res = await api(`/sessions/${code}`);
    if (res.ok) {
      const data = await res.json();
      setSession(data);
      sessionIdRef.current = data.id;
      return data;
    }
    setSession(null);
  }

  useEffect(() => {
    if (!code) return;
    fetchSession().finally(() => setLoading(false));
  }, [code]);

  useEffect(() => {
    if (!sessionIdRef.current) return;
    const cleanup = openSSE(sessionIdRef.current, {
      session_updated: (payload) => setSession(prev => ({ ...prev, ...payload })),
      onReconnect: () => fetchSession(),
    });
    return cleanup;
  }, [sessionIdRef.current]);

  return { session, loading, setSession };
}
