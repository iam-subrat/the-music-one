import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { clearTokens, getAccessToken } from '../lib/auth';
import { authEvents } from '../lib/api';

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_platform: string | null;
}

interface AuthContextValue {
  user: { id: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  setUser: React.Dispatch<React.SetStateAction<{ id: string } | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) { setLoading(false); return; }
    const res = await api('/auth/me');
    if (res.ok) {
      const data: UserProfile = await res.json();
      setUser({ id: data.id });
      setProfile(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    const handler = () => { setUser(null); setProfile(null); };
    authEvents.on('auth-failed', handler);
    return () => { authEvents.off('auth-failed', handler); };
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    await clearTokens();
    setUser(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, setProfile, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
