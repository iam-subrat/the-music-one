import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getSessionByCode } from '../lib/session';

export function useSession(code) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    getSessionByCode(code).then(s => { setSession(s); setLoading(false); });

    const channel = supabase.channel(`session:${code}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `invite_code=eq.${code}` },
        payload => setSession(prev => ({ ...prev, ...payload.new })))
      .subscribe();

    return () => channel.unsubscribe();
  }, [code]);

  return { session, loading, setSession };
}
