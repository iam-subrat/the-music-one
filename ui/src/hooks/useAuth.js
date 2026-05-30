import { useState, useEffect } from 'react';
import { api, API_BASE } from '../lib/api';
import { useAnalytics } from '../lib/analytics';

let _identifiedUserId = null; // module-level: shared across all useAuth() instances

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const { capture, identify, reset } = useAnalytics();

  useEffect(() => {
    api('/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setUser({ id: data.id });
          setProfile(data);
          if (_identifiedUserId !== data.id) {
            identify(data.id, {
              email:        data.email,
              display_name: data.display_name,
            });
            capture('user_signed_in', { auth_provider: 'google' });
            _identifiedUserId = data.id;
            try {
              const returnTo = sessionStorage.getItem('musicone:post-login');
              if (returnTo) {
                sessionStorage.removeItem('musicone:post-login');
                // Accept only same-origin paths. Anything that isn't a clean
                // "/path" or "<origin>/path" is treated as junk (e.g. an
                // event object accidentally stringified to "[object Object]").
                const origin = window.location.origin;
                const isPath   = /^\/[^/]/.test(returnTo) || returnTo === '/';
                const isOurUrl = returnTo.startsWith(origin + '/') || returnTo === origin;
                if ((isPath || isOurUrl) && returnTo !== window.location.href) {
                  window.location.replace(returnTo);
                }
              }
            } catch {}
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function signInWithGoogle(returnTo) {
    if (typeof returnTo === 'string' && returnTo) {
      try { sessionStorage.setItem('musicone:post-login', returnTo); } catch {}
    }
    window.location.href = `${API_BASE}/api/auth/google`;
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    capture('user_signed_out');
    reset();
    _identifiedUserId = null;
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
