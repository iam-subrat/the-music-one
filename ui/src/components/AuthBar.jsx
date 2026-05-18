import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AuthBar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <button className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '8px 14px' }}
          onClick={() => navigate('/login')}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
      {profile?.avatar_url && (
        <img src={profile.avatar_url} alt={profile.display_name}
          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
      )}
      <span className="authBarName">{profile?.display_name}</span>
      <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '6px 12px' }}
        onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
