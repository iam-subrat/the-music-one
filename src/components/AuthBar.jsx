import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import s from '../styles/authbar.module.css';

export default function AuthBar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className={s.bar}>
        <button className={`btn btn-ghost ${s.signInBtn}`} onClick={() => navigate('/login')}>
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
      <span className={s.name}>{profile?.display_name}</span>
      <button className={`btn btn-ghost ${s.signOutBtn}`} onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
