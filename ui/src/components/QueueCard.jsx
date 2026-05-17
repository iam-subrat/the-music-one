import { PlatformIcon } from './base';

export default function QueueCard({ item, index }) {
  const isPlayed = item.status === 'played' || item.status === 'skipped';
  const isResolving = item.resolve_status === 'resolving';
  const isFailed = item.resolve_status === 'failed';

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 'var(--radius-sm)',
      padding: '14px 18px',
      boxShadow: 'var(--raised-sm)',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      opacity: isPlayed ? 0.5 : 1,
      transition: 'opacity 0.2s',
    }}>
      {index != null && (
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--surface)', boxShadow: 'var(--recessed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', flexShrink: 0,
        }}>
          {index}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.artist}
        </div>
        {item.profiles?.display_name && (
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
            by {item.profiles.display_name}
          </div>
        )}
      </div>
      {isResolving && (
        <span style={{
          fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4,
          background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0,
        }}>
          Resolving…
        </span>
      )}
      {isFailed && (
        <span style={{
          fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4,
          background: 'rgba(192,57,43,0.1)', color: '#c0392b', flexShrink: 0,
        }}>
          Failed
        </span>
      )}
    </div>
  );
}
