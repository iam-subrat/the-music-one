import { useTui } from '../tui/TuiContext';
import jamStyles from '../styles/jam.module.css';

export default function NotFound() {
  const { guiTheme } = useTui();
  return (
    <div className={`page ${jamStyles.jamRoom} ${jamStyles[guiTheme]}`} style={{ justifyContent: 'center', textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--jam-text)' }}>404</h2>
      <p style={{ color: 'var(--jam-muted)', marginTop: 8 }}>Page not found.</p>
      <a href="/" className="btn" style={{ marginTop: 20 }}>Go home</a>
    </div>
  );
}
