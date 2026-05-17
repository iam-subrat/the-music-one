// ui/src/pages/Login.jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { NeuSurface, NeuButton } from '../components/base';

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/';

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [user, loading]);

  return (
    <div className="page" style={{ justifyContent: 'center', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-1px',
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 8,
        }}>MusicOne</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Sign in to create or join a jam session</p>
      </div>

      <NeuSurface size="lg" style={{ padding: 'clamp(24px,6vw,40px) clamp(20px,5vw,32px)', maxWidth: 380, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Welcome</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Sign in with Google to start jamming. Your preferred platform is saved automatically on first song add.
        </p>
        <NeuButton
          variant="ghost"
          style={{ width: '100%', color: 'var(--text)' }}
          onClick={() => signInWithGoogle(window.location.origin + next)}
          icon={<GoogleIcon />}
        >
          Continue with Google
        </NeuButton>
        <a href="/" style={{ color: 'var(--muted)', fontSize: '0.85rem', textDecoration: 'none' }}>← Back to home</a>
      </NeuSurface>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
