import TuiPlaybackIndicator from './TuiPlaybackIndicator';
import RepeatMenu from '../components/RepeatMenu';
import JamIcon from '../components/JamIcon';
import s from './tui.module.css';

export default function TuiPlayer({ item, snapshot, repeat, canControl, started, busy, error, scope, onCommand, children }) {
  const playing = started && snapshot.playerState === 1;
  return <section className={`${s.panel} ${s.panelSpan2} ${s.playerPanel}`} aria-label="Playback">
    <div className={s.playerHeading}><span className={s.panelLabel}>playback</span><span className={s.dim}>{scope}</span></div>
    {error && <div role="alert" className={s.err}>{error}</div>}
    {item ? <>
      <div className={s.nowPlayingBlock}>
        {item.thumbnail_url && <img src={item.thumbnail_url} alt="" />}
        <div className={s.playerMeta}>
          <div className={s.trackTitle}>▶ {item.title}</div>
          <div className={s.trackArtist}>{item.artist}</div>
          <div className={s.trackBy}>Added by {item.profiles?.display_name || 'someone'}</div>
          <TuiPlaybackIndicator playerState={started ? snapshot.playerState : -1} currentTime={snapshot.currentTime}
            duration={snapshot.duration} repeatMode={repeat} statusLabel={error ? 'UNAVAILABLE' : busy ? 'LOADING' : undefined} />
          {children}
        </div>
      </div>
      <div className={s.playerToolbar}>
        <div className={s.playerTransport}>
          {canControl && <>
            <button type="button" aria-label="Previous track" title="Previous track" disabled={busy} onClick={() => onCommand('prev')}><JamIcon name="previous" size={17} /></button>
            <button type="button" className={s.primaryPlay} aria-label={playing ? 'Pause playback' : 'Play playback'}
              title={playing ? 'Pause playback' : 'Play playback'} disabled={busy} onClick={() => onCommand(playing ? 'pause' : 'play')}><JamIcon name={playing ? 'pause' : 'play'} size={19} /></button>
            <button type="button" aria-label="Next track" title="Next track" disabled={busy} onClick={() => onCommand('next')}><JamIcon name="next" size={17} /></button>
          </>}
        </div>
        <RepeatMenu value={repeat} disabled={!canControl || busy} onChange={value => onCommand(`repeat ${value}`)} />
      </div>
    </> : <div className={s.mute}>No songs yet</div>}
  </section>;
}
