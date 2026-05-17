// ui/src/pages/NotFound.jsx
import { NeuSurface, NeuButton } from '../components/base';

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

export default function NotFound() {
  return (
    <div className="page" style={{ justifyContent: 'center', textAlign: 'center', gap: 24 }}>
      <NeuSurface size="lg" style={{ padding: 40, maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '-2px' }}>404</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>Page not found.</p>
        <NeuButton variant="ghost" icon={<HomeIcon />} onClick={() => window.location.href = '/'}>Go home</NeuButton>
      </NeuSurface>
    </div>
  );
}
