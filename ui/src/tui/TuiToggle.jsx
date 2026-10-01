import { useTui } from './TuiContext';
import s from './tui.module.css';
import JamIcon from '../components/JamIcon';

export default function TuiToggle() {
  const { tuiMode, toggleTui } = useTui();
  return (
    <button
      type="button"
      onClick={toggleTui}
      className={`${s.toggle} ${tuiMode ? s.toggleOn : ''}`}
      title={tuiMode ? 'Switch to graphical UI' : 'Switch to terminal UI'}
      aria-label="Toggle terminal interface"
      aria-pressed={tuiMode}
    >
      <span className={s.toggleTrack}>
        <span className={s.toggleThumb} />
        <span className={s.toggleChoice}><JamIcon name="monitor" size={14} /> GUI</span>
        <span className={s.toggleChoice}><JamIcon name="terminal" size={14} /> TUI</span>
      </span>
    </button>
  );
}
