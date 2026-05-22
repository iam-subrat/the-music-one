import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import s from './AuthBar.module.css';

export default function AuthBar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className={s.bar}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: '0.83rem', padding: '7px 14px' }}
          onClick={() => navigate('/login')}
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className={s.bar}>
      {profile?.avatar_url && (
        <img
          src={profile.avatar_url}
          alt={profile.display_name}
          className={s.avatar}
        />
      )}
      <span className={`authBarName ${s.name}`}>{profile?.display_name}</span>
      <button
        className="btn btn-ghost"
        style={{ fontSize: '0.8rem', padding: '6px 12px' }}
        onClick={signOut}
      >
        Sign out
      </button>
    </div>
  );
}
