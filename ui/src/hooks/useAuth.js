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
    let { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!data) {
      // Profile missing — create from auth metadata (handles deleted profiles + trigger failures)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: created } = await supabase.from('profiles').upsert({
        id: userId,
        display_name: authUser?.user_metadata?.full_name ?? authUser?.email?.split('@')[0] ?? null,
        avatar_url: authUser?.user_metadata?.avatar_url ?? null,
      }).select().maybeSingle();
      data = created;
    }
    if (!data) {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } else {
      setProfile(data);
    }
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
