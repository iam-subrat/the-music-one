import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TerminalShell from './TerminalShell';
import { useAuth } from '../hooks/useAuth';
import s from './tui.module.css';

export default function TuiLogin() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/';
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [user, loading]);

  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 450);
    return () => clearInterval(id);
  }, []);

  return (
    <TerminalShell title="musicone.sh ~ login" status="awaiting auth">
      <div className={s.log}>
        <div className={`${s.logLine} ${s.info}`}>$ auth --provider google</div>
        <div className={`${s.logLine} ${s.dim}`}>  redirect target: <code style={{ color: 'var(--tui-amber)' }}>{next}</code></div>
        <div className={`${s.logLine} ${s.dim}`}>  authentication required to host or join jam sessions</div>
        <div className={`${s.logLine} ${s.mute}`}>  press the button below to begin oauth handshake{dots}</div>
      </div>

      <button
        type="button"
        onClick={() => signInWithGoogle(window.location.origin + next)}
        className={s.authBtn}
        style={{ padding: '10px 18px', fontSize: 13, marginTop: 10 }}
      >
        ▶ continue with google
      </button>

      <div className={s.hint} style={{ marginTop: 14 }}>
        or <a href="/" style={{ color: 'var(--tui-accent)' }}>cd ~</a> to return home
      </div>
    </TerminalShell>
  );
}
