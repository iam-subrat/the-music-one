import { FLAGS } from '../lib/flags';
import { passDjToken } from '../lib/session';
import { useToast } from './Toast';
import { NeuButton } from './base';

export default function ParticipantList({ participants, session, currentUserId }) {
  const toast = useToast();
  const isHost = session.host_user_id === currentUserId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)' }}>
        In this jam ({participants.length})
      </div>
      {participants.map(p => (
        <div key={p.id} style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          boxShadow: 'var(--raised-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {p.avatar_url ? (
            <img src={p.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', boxShadow: 'var(--raised-sm)', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              boxShadow: 'var(--raised-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {(p.display_name || 'G')[0].toUpperCase()}
            </div>
          )}
          <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.display_name || 'Guest'}
          </span>
          {p.id === session.dj_user_id && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--surface)', borderRadius: 20, padding: '3px 8px',
              boxShadow: 'var(--recessed)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
              DJ
            </span>
          )}
          {FLAGS.DJ_TOKEN && isHost && p.id !== currentUserId && p.id !== session.dj_user_id && (
            <NeuButton
              variant="ghost"
              style={{ fontSize: '0.72rem', padding: '4px 10px' }}
              onClick={() => passDjToken(session.id, p.id).then(() => toast('DJ token passed!'))}
            >
              Make DJ
            </NeuButton>
          )}
        </div>
      ))}
    </div>
  );
}
