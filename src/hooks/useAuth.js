import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Returns { user, profile, loading, signInWithGoogle, signOut, setPreferredPlatform }.
 * user: Supabase auth user or null.
 * profile: profiles table row or null.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data ?? null);
    setLoading(false);
  }

  async function signInWithGoogle(redirectTo = window.location.href) {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  async function setPreferredPlatform(platform) {
    if (!user) return;
    await supabase.from('profiles').update({ preferred_platform: platform }).eq('id', user.id);
    setProfile(prev => ({ ...prev, preferred_platform: platform }));
  }

  return { user, profile, loading, signInWithGoogle, signOut, setPreferredPlatform };
}
