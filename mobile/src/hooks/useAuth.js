import { useState, useEffect } from 'react';
import { api, API_BASE, clearAuthTokens } from '../lib/api';
import { useAnalytics } from '../lib/analytics';

let _identifiedUserId = null; // module-level: shared across all useAuth() instances

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem('musicone_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [profile, setProfile] = useState(() => {
    try {
      const cached = localStorage.getItem('musicone_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const { capture, identify, reset } = useAnalytics();

  useEffect(() => {
    api('/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setUser({ id: data.id });
          setProfile(data);
          try {
            localStorage.setItem('musicone_user', JSON.stringify({ id: data.id }));
            localStorage.setItem('musicone_profile', JSON.stringify(data));
          } catch {}
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
        } else {
          setUser(null);
          setProfile(null);
          try {
            localStorage.removeItem('musicone_user');
            localStorage.removeItem('musicone_profile');
          } catch {}
        }
      })
      .finally(() => setLoading(false));
  }, [capture, identify]);

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
    clearAuthTokens();
    try {
      localStorage.removeItem('musicone_user');
      localStorage.removeItem('musicone_profile');
    } catch {}
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
