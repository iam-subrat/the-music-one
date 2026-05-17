import { useToast } from './Toast';
import { NeuButton } from './base';

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  );
}

export default function InviteBadge({ code }) {
  const toast = useToast();
  const url = `${window.location.origin}/jam/${code}`;

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 40,
      padding: '8px 16px',
      boxShadow: 'var(--raised-sm)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontSize: '0.83rem',
      color: 'var(--muted)',
    }}>
      <span>Invite:</span>
      <span style={{
        background: 'var(--surface)', borderRadius: 8, padding: '2px 8px',
        boxShadow: 'var(--recessed)', fontWeight: 700, color: 'var(--text)',
        letterSpacing: '0.5px', fontFamily: 'monospace', fontSize: '0.9rem',
      }}>
        {code}
      </span>
      <NeuButton
        variant="ghost"
        icon={<CopyIcon />}
        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
        onClick={() => navigator.clipboard.writeText(url).then(() => toast('Invite link copied!'))}
      >
        Copy
      </NeuButton>
    </div>
  );
}
