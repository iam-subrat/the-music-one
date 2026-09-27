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
            : <div className={s.pAvatar} role="img" aria-label={`${p.display_name || 'Guest'} avatar`}>{(p.display_name || 'G').trim().charAt(0).toUpperCase()}</div>}
          <span className={s.pName}>{p.display_name || 'Guest'}</span>
          {p.id === session.host_user_id && <span className={s.pRole}>Host</span>}
          {p.id === session.dj_user_id && <span className={s.pDj}>DJ</span>}
          {FLAGS.DJ_TOKEN && canPassDJ && p.id !== currentUserId && p.id !== session.dj_user_id && (
            <button
              className="btn btn-ghost"
              aria-label={`Make ${p.display_name || 'Guest'} the DJ`}
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={() =>
                passDjToken(session.id, p.id).then(() => {
                  capture('dj_token_passed', { session_id: session.id });
                  capture('feature_used', { feature: 'dj_token' });
                  toast('DJ token passed!');
                }).catch((error) => toast(error.message || 'Could not pass DJ token.'))
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
