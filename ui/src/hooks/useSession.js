import { useState, useEffect } from 'react';
import { api, setPlaybackModeVersion } from '../lib/api';
import { openSSE } from '../lib/sse';

export function useSession(code) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchSession() {
    if (!code) return null;
    const res = await api(`/sessions/${code}`);
    if (res.ok) {
      const data = await res.json();
      setSession(prev => prev?.id === data.id && (prev.playback_mode_version ?? 0) > (data.playback_mode_version ?? 0) ? prev : data);
      return data;
    }
    setSession(null);
    return null;
  }

  useEffect(() => {
    if (!code) return;
    fetchSession().finally(() => setLoading(false));
  }, [code]);

  useEffect(() => { setPlaybackModeVersion(session?.playback_mode_version); }, [session?.id, session?.playback_mode_version]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') fetchSession(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [code]);

  // session?.id in dep array — React tracks state, not refs
  useEffect(() => {
    if (!session?.id) return;
    return openSSE(session.id, {
      session_updated: (payload) => setSession(prev => payload.playback_mode_version != null &&
        payload.playback_mode_version < (prev?.playback_mode_version ?? 0) ? prev : ({ ...prev, ...payload })),
      onReconnect: () => fetchSession(),
    });
  }, [session?.id]);

  return { session, loading, setSession, refresh: fetchSession };
}
