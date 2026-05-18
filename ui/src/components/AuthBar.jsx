// ui/src/components/AuthBar.jsx
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function AuthBar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const pillStyle = {
    position: 'fixed',
    top: 18,
    right: 20,
    background: 'var(--surface)',
    borderRadius: 40,
    padding: '9px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    boxShadow: 'var(--raised-sm)',
    zIndex: 100,
  };

  const toggleBtnStyle = {
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
  };

  if (!user) {
    return (
      <div style={pillStyle}>
        <button style={toggleBtnStyle} onClick={toggle} aria-label="Toggle theme">
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            fontSize: '0.83rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: 0,
          }}
          onClick={() => navigate('/login')}
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div style={pillStyle}>
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={profile.display_name}
          style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', boxShadow: 'var(--raised-sm)' }}
        />
      ) : (
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
          boxShadow: 'var(--raised-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.72rem', fontWeight: 700, color: '#fff',
        }}>
          {(profile?.display_name || 'U')[0].toUpperCase()}
        </div>
      )}
      <span className="authBarName">{profile?.display_name}</span>
      <button style={toggleBtnStyle} onClick={toggle} aria-label="Toggle theme">
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
      <button
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--muted)',
          fontSize: '0.82rem',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          padding: 0,
        }}
        onClick={signOut}
      >
        Sign out
      </button>
    </div>
  );
}
