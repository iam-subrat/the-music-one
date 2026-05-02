import s from '../styles/jam.module.css';
import QueueCard from './QueueCard';
import AddSongForm from './AddSongForm';

export default function QueueList({ items, sessionId, userId, profile, onPlatformDetected }) {
  const nonPlaying = items.filter(i => i.status !== 'playing');
  return (
    <div className={s.queueSection}>
      <AddSongForm
        sessionId={sessionId}
        userId={userId}
        profile={profile}
        onPlatformDetected={onPlatformDetected}
      />
      <div className={s.queueList}>
        {nonPlaying.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '8px 0' }}>Queue is empty. Add a song above!</p>
          : nonPlaying.map(item => <QueueCard key={item.id} item={item} />)
        }
      </div>
    </div>
  );
}
