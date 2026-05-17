// ui/src/components/AuthBar.jsx
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AuthBar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

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

  if (!user) {
    return (
      <div style={pillStyle}>
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
