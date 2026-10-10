import { useState, useEffect, useCallback, useRef } from 'react';
import { api, setPlaybackModeVersion } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useSession(code) {
  const [storedSession, setSession] = useState(null);
  const [clock, setClock] = useState(Date.now);
  const expiry = storedSession?.expires_at ? Date.parse(storedSession.expires_at) : NaN;
  const session = storedSession?.status === 'active' && expiry <= Date.now()
    ? { ...storedSession, status: 'ended', expired: true } : storedSession;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (storedSession?.status !== 'active' || !Number.isFinite(expiry) || expiry <= Date.now()) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(expiry - Date.now(), 2147483647));
    return () => window.clearTimeout(timer);
  }, [storedSession?.id, storedSession?.status, expiry, clock]);

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
    if (!session?.id || session.status !== 'active') return;
    const id = session.id;
    let disposed = false, inFlight = false;
    const timer = window.setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await api(`/sessions/${id}/heartbeat`, { method: 'POST' });
        if (disposed) return;
        if (res.ok) {
          const data = await res.json();
          if (!disposed && data.expires_at) setSession(prev => prev?.id === id &&
            Date.parse(data.expires_at) > Date.parse(prev.expires_at || '') ? { ...prev, expires_at: data.expires_at } : prev);
        } else if (res.status === 409) await fetchSession();
      } catch { /* A transient heartbeat failure must not erase the room. */ }
      finally { inFlight = false; }
    }, 30000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [session?.id, session?.status, fetchSession]);

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
