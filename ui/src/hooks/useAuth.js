// ui/src/hooks/useAuth.js — full file replacement
import { useState, useEffect } from 'react';
import { api, API_BASE } from '../lib/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setUser({ id: data.id });
          setProfile(data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function signInWithGoogle(redirectTo = window.location.href) {
    window.location.href = `${API_BASE}/api/auth/google`;
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setProfile(null);
  }

  async function setPreferredPlatform(platform) {
    if (!user) return;
    const res = await api('/profiles/me', {
      method: 'PATCH',
      body: JSON.stringify({ preferred_platform: platform }),
    });
    if (res.ok) {
      setProfile(prev => ({ ...prev, preferred_platform: platform }));
    }
  }

  return { user, profile, loading, signInWithGoogle, signOut, setPreferredPlatform };
}
