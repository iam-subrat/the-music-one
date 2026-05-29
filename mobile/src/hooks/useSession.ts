import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { api } from '../lib/api';
import { openSSE } from '../lib/sse';
import { SessionData } from '../lib/session';

export function useSession(code: string | null) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    if (!code) return null;
    const res = await api(`/sessions/${code}`);
    if (res.ok) {
      const data: SessionData = await res.json();
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
    let cleanup: (() => void) | undefined;
    openSSE(session.id, {
      session_updated: (payload) =>
        setSession((prev) => (prev ? { ...prev, ...(payload as Partial<SessionData>) } : prev)),
      onReconnect: () => { fetchSession(); },
    }).then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [session?.id, fetchSession]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        fetchSession();
      }
    });
    return () => sub.remove();
  }, [fetchSession]);

  return { session, loading, setSession };
}
