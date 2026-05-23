import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import s from './login.module.css';

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/';

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [user, loading]);

  const handleGoogle = () => {
    signInWithGoogle(window.location.origin + next);
  };

  return (
    <div className={`page ${s.page}`} style={{ justifyContent: 'center' }}>
      <div className={s.wrapper}>
        <header className={s.header}>
          <div className={s.logoMark}>
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="13" stroke="url(#lg)" strokeWidth="2"/>
              <circle cx="14" cy="14" r="5" fill="url(#lg)"/>
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#fff"/>
                  <stop offset="1" stopColor="var(--accent)"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className={s.appName}>MusicOne</h1>
        </header>

        <div className={`card ${s.card}`}>
          <h2 className={s.title}>Welcome back</h2>
          <p className={s.subtitle}>
            Sign in to create or join a jam session.<br/>
            Your preferred platform is saved automatically.
          </p>

          <button
            className={`btn btn-ghost ${s.googleBtn}`}
            onClick={handleGoogle}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <a href="/" className={s.backLink}>← Back to home</a>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
