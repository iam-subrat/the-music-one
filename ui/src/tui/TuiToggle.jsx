import { useTui } from './TuiContext';
import s from './tui.module.css';

export default function TuiToggle() {
  const { tuiMode, toggleTui } = useTui();
  return (
    <button
      type="button"
      onClick={toggleTui}
      className={`${s.toggle} ${tuiMode ? s.toggleOn : ''}`}
      title={tuiMode ? 'Switch to graphical UI' : 'Switch to terminal UI'}
      aria-label="Toggle terminal interface"
    >
      <span className={s.toggleTrack}>
        <span className={s.toggleLabel} data-side="left">GUI</span>
        <span className={s.toggleLabel} data-side="right">TUI</span>
        <span className={s.toggleThumb}>
          {tuiMode ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M4 6l2 2-2 2M7.5 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 14h6M8 11.5V14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          )}
        </span>
      </span>
    </button>
  );
}
