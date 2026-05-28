import s from '../styles/jam.module.css';
import QueueCard from './QueueCard';
import AddSongForm from './AddSongForm';

export function getUpcoming(items, repeatMode) {
  if (repeatMode !== 'queue') return items.filter(i => i.status === 'queued');
  const playing = items.find(i => i.status === 'playing');
  const eligible = items.filter(i => i.status !== 'skipped' && i.status !== 'playing');
  if (!playing) return eligible;
  const after = eligible.filter(i => i.position > playing.position);
  const before = eligible.filter(i => i.position < playing.position);
  return [...after, ...before];
}

export default function QueueList({ items, repeatMode, sessionId, userId, profile, onPlatformDetected, onAdded }) {
  const upcoming = getUpcoming(items, repeatMode);
  return (
    <div className={s.queueSection}>
      <AddSongForm
        sessionId={sessionId}
        userId={userId}
        profile={profile}
        onPlatformDetected={onPlatformDetected}
        onAdded={onAdded}
      />
      <div className={s.queueList}>
        {upcoming.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '8px 0' }}>Queue is empty. Add a song above!</p>
          : upcoming.map((item, i) => <QueueCard key={item.id} item={item} index={i + 1} />)
        }
      </div>
    </div>
  );
}
