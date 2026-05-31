import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { storeTokens } from '../lib/auth';
import { useAuth as useAuthContext } from '../contexts/AuthContext';
import { API_BASE } from '../constants/config';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleSignIn() {
  const { setUser, setProfile } = useAuthContext();

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'musicone' });
  console.log('[auth] redirectUri =', redirectUri);

  const signIn = useCallback(async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) throw new Error(error?.message ?? 'OAuth init failed');

    console.log('[auth] opening URL:', data.url);
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
    console.log('[auth] browser result:', JSON.stringify(result));

    if (result.type !== 'success') return;

    // iOS deep-link sometimes appends an encoded `#` to the code value.
    // Strip it before exchanging, else Supabase rejects with "invalid flow state".
    const qs = result.url.split('?')[1] ?? '';
    const codeMatch = /[?&]code=([^&#]+)/.exec('?' + qs);
    const code = decodeURIComponent(codeMatch?.[1] ?? '').replace(/#+$/, '');
    if (!code) throw new Error('No code in callback URL');

    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !sessionData.session) {
      throw new Error(exchangeError?.message ?? 'Code exchange failed');
    }

    const { access_token, refresh_token, user } = sessionData.session;
    await storeTokens(access_token, refresh_token);

    // Fetch full profile from backend
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const profile = res.ok ? await res.json() : null;

    setUser({ id: user.id });
    setProfile(profile ?? { id: user.id, email: user.email });
  }, [redirectUri, setUser, setProfile]);

  return { signIn, ready: true };
}
