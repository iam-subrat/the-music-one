import JamIcon from './JamIcon';
import SongVisualizer from './SongVisualizer';
import RepeatMenu from './RepeatMenu';
import s from '../styles/jam.module.css';

function time(value) {
  const sec = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// Presentation only: mode-specific controllers own every playback command.
export default function PlayerSurface({ item, status, playing, current = 0, duration = 0, canControl,
  started, busy, onPlay, onPause, onPrevious, onNext, onSeek, onSeekStart, onSeekEnd,
  repeat, onRepeat, repeatBusy, scope, actions, error, children, label = 'Playback' }) {
  const position = Math.min(Math.max(0, current), duration || 0);
  return <section className={s.nowPlaying} aria-label={label}>
    <div className={s.playerStatus} role="status" data-playing={!!playing}>
      <span className={s.statusIndicator} aria-hidden="true">
        <span className={s.statusDot} />
        <span className={s.statusEqualizer}><i /><i /><i /></span>
      </span>
      <span>{status}</span>
    </div>
    {item ? <div className={s.nowPlayingMeta} data-artwork={!!item.thumbnail_url}>
      <div className={s.artworkStage}>
        <SongVisualizer isPlaying={playing} artworkUrl={item.thumbnail_url} />
        {item.thumbnail_url ? <img className={s.thumb} src={item.thumbnail_url} alt="" /> : <div className={`${s.thumb} ${s.artworkPlaceholder}`} aria-hidden="true">{item.title?.slice(0, 1)}</div>}
      </div>
      <div className={s.nowPlayingText}>
        <div className={s.nowPlayingTitle}>{item.title}</div>
        <div className={s.nowPlayingArtist}>{item.artist}</div>
        <div className={s.nowPlayingAdded}>Added by {item.profiles?.display_name || 'someone'}</div>
      </div>
    </div> : <div className={s.playerEmpty}>No songs yet</div>}
    {item && <div className={s.transport} aria-label="Playback controls">
      <div className={s.timeRow}><span>{time(position)}</span><span>{time(duration)}</span></div>
      <input className={s.seekbar} aria-label="Playback position" type="range" min="0" max={duration || 0}
        value={position} step="0.1" disabled={!canControl || !started || !duration || busy}
        style={{ '--seek-progress': `${duration ? position / duration * 100 : 0}%` }}
        onChange={event => onSeek?.(Number(event.target.value))} onPointerDown={onSeekStart} onPointerUp={onSeekEnd} onBlur={onSeekEnd} />
      {canControl && <div className={s.transportButtons}>
        <button className={s.iconButton} type="button" aria-label="Previous track" title="Previous track" disabled={busy} onClick={onPrevious}><JamIcon name="previous" size={20} /></button>
        <button className={s.playButton} type="button" aria-label={playing ? 'Pause playback' : 'Play playback'}
          title={playing ? 'Pause playback' : 'Play playback'} disabled={busy} onClick={playing ? onPause : onPlay}><JamIcon name={playing ? 'pause' : 'play'} size={24} /></button>
        <button className={s.iconButton} type="button" aria-label="Next track" title="Next track" disabled={busy} onClick={onNext}><JamIcon name="next" size={20} /></button>
      </div>}
    </div>}
    <div className={s.playerFooter}><div className={s.playerOptions}>
      <RepeatMenu value={repeat} onChange={onRepeat} disabled={!canControl || repeatBusy} />{actions}
    </div><span className={s.modeScope}>{scope}</span></div>
    {error && <div className={s.playbackError} role="alert">{error}<button type="button" className={s.repeatBtn} disabled={busy} onClick={onPlay}>Retry</button></div>}
    {children}
  </section>;
}
