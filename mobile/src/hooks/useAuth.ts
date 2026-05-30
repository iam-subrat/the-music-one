import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import { API_BASE } from '../constants/config';
import { storeTokens } from '../lib/auth';
import { useAuth as useAuthContext } from '../contexts/AuthContext';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleSignIn() {
  const { setUser, setProfile } = useAuthContext();

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'musicone' });

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: 'google', // Supabase handles the actual clientId
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      scopes: ['openid', 'email', 'profile'],
    },
    { authorizationEndpoint: `${API_BASE}/api/auth/mobile/authorize` }
  );

  const signIn = useCallback(async () => {
    const result = await promptAsync();
    if (result.type !== 'success') return;

    const res = await fetch(`${API_BASE}/api/auth/mobile/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        code: result.params.code,
        code_verifier: request?.codeVerifier ?? '',
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) throw new Error('Sign in failed');
    const data = await res.json();
    await storeTokens(data.access_token, data.refresh_token);
    setUser({ id: data.user.id });
    setProfile(data.user);
  }, [promptAsync, request, redirectUri, setUser, setProfile]);

  return { signIn, ready: !!request };
}
