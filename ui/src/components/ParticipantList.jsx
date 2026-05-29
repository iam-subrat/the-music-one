import s from '../styles/jam.module.css';
import { FLAGS } from '../lib/flags';
import { passDjToken } from '../lib/session';
import { useToast } from './Toast';
import { useAnalytics } from '../lib/analytics';

export default function ParticipantList({ participants, session, currentUserId }) {
  const toast = useToast();
  const { capture } = useAnalytics();
  const isHost = session.host_user_id === currentUserId;
  const isDJ = session.dj_user_id === currentUserId;
  const canPassDJ = isHost || isDJ;

  return (
    <div className={s.sidebarSection}>
      <div className={s.sidebarTitle}>In this jam ({participants.length})</div>
      {participants.map(p => (
        <div key={p.id} className={s.participant}>
          {p.avatar_url
            ? <img className={s.pAvatar} src={p.avatar_url} alt="" />
            : <div className={s.pAvatar} />}
          <span className={s.pName}>{p.display_name || 'Guest'}</span>
          {p.id === session.dj_user_id && <span className={s.pDj}>👑</span>}
          {FLAGS.DJ_TOKEN && canPassDJ && p.id !== currentUserId && p.id !== session.dj_user_id && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={() =>
                passDjToken(session.id, p.id).then(() => {
                  capture('dj_token_passed', { session_id: session.id });
                  capture('feature_used', { feature: 'dj_token' });
                  toast('DJ token passed!');
                })
              }
            >
              Make DJ
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
