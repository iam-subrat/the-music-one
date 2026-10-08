import { useState, useEffect, useCallback, useRef } from 'react';
import { api, setPlaybackModeVersion } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useSession(code) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const fetchSession = useCallback(async () => {
    const id = ++requestId.current;
    try {
      if (!code) return null;
      const res = await api(`/sessions/${code}`);
      if (id !== requestId.current) return null;
      if (res.status === 404) {
        setSession(null);
        setError(null);
        return null;
      }
      if (!res.ok) throw new Error('Room request failed');
      const data = await res.json();
      if (id !== requestId.current) return null;
      setSession(prev => prev?.id === data.id && (prev.playback_mode_version ?? 0) > (data.playback_mode_version ?? 0) ? prev : data);
      setError(null);
      return data;
    } catch {
      if (id === requestId.current) setError('Could not load the room. Please try again.');
      return null;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    setSession(null);
    setError(null);
    setLoading(true);
    fetchSession();
    return () => { requestId.current += 1; };
  }, [fetchSession]);

  useEffect(() => { setPlaybackModeVersion(session?.playback_mode_version); }, [session?.id, session?.playback_mode_version]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') fetchSession(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [fetchSession]);

  useEffect(() => {
    if (!session?.id) return;
    return openSSE(session.id, {
      session_updated: (payload) => setSession(prev => prev && payload.playback_mode_version != null &&
        payload.playback_mode_version < (prev.playback_mode_version ?? 0) ? prev : (prev ? { ...prev, ...payload } : prev)),
      onReconnect: fetchSession,
    });
  }, [session?.id, fetchSession]);

  return { session, loading, error, setSession, refresh: fetchSession };
}
