import { useState, useEffect, useCallback } from 'react';
import { api, setPlaybackModeVersion } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useSession(code) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    if (!code) return null;
    const res = await api(`/sessions/${code}`);
    if (res.ok) {
      const data = await res.json();
      setSession(prev => prev?.id === data.id && (prev.playback_mode_version ?? 0) > (data.playback_mode_version ?? 0) ? prev : data);
      return data;
    }
    setSession(null);
    return null;
  }, [code]);

  useEffect(() => { setPlaybackModeVersion(session?.playback_mode_version); }, [session?.playback_mode_version]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') fetchSession(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [fetchSession]);

  useEffect(() => {
    if (!code) return;
    fetchSession().finally(() => setLoading(false));
  }, [code, fetchSession]);

  useEffect(() => {
    if (!session?.id) return;
    return openSSE(session.id, {
      session_updated: (payload) => setSession(prev => (payload.playback_mode_version ?? prev?.playback_mode_version ?? 0) < (prev?.playback_mode_version ?? 0) ? prev : ({ ...prev, ...payload })),
      onReconnect: () => fetchSession(),
    });
  }, [session?.id, fetchSession]);

  return { session, loading, setSession, refresh: fetchSession };
}
