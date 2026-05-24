import { useState, useEffect, useRef } from 'react';
import { api, API_BASE } from '../lib/api';
import { useAnalytics } from '../lib/analytics';

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const { capture, identify, reset } = useAnalytics();
  const identifiedRef = useRef(false);

  useEffect(() => {
    api('/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setUser({ id: data.id });
          setProfile(data);
          if (!identifiedRef.current) {
            identify(data.id, {
              email:        data.email,
              display_name: data.display_name,
            });
            capture('user_signed_in', { auth_provider: 'google' });
            identifiedRef.current = true;
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function signInWithGoogle() {
    window.location.href = `${API_BASE}/api/auth/google`;
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    capture('user_signed_out');
    reset();
    identifiedRef.current = false;
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
      capture('preferred_platform_set', { platform });
    }
  }

  return { user, profile, loading, signInWithGoogle, signOut, setPreferredPlatform };
}
