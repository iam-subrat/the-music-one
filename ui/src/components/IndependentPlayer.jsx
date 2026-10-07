import { useEffect, useState } from 'react';
import JamIcon from './JamIcon';
import SongVisualizer from './SongVisualizer';
import PlatformLinks from './PlatformLinks';
import s from '../styles/jam.module.css';

function time(value) { const sec = Math.max(0, Math.floor(value || 0)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
export default function IndependentPlayer({ local }) {
  const { state } = local;
  const [snapshot, setSnapshot] = useState({ time: 0, duration: 0, state: -1 });
  useEffect(() => {
    const update = () => setSnapshot({ time: local.getTime(), duration: local.getDuration(), state: local.getState() });
    update(); const id = setInterval(update, 500); return () => clearInterval(id);
  }, [local.getTime, local.getDuration, local.getState, state.item?.id]);
  const playing = snapshot.state === 1;
  const current = Math.min(snapshot.time, snapshot.duration || snapshot.time);
  return <section className={`${s.nowPlaying} ${s.independentPlayer}`} aria-label="Your playback">
    <div className={s.personalHeading}><span className={s.nowPlayingLabel}>Your playback</span>
      <span className={s.personalStatus}>{state.loading ? 'Finding playback link' : state.atEnd ? 'End of your queue' : playing ? 'Playing' : 'Paused'}</span></div>
    {state.item ? <div className={s.nowPlayingMeta}>
      <div className={s.artworkStage}><SongVisualizer isPlaying={playing} artworkUrl={state.item.thumbnail_url} />
        {state.item.thumbnail_url ? <img className={s.thumb} src={state.item.thumbnail_url} alt="" /> : <div className={s.thumb} />}</div>
      <div className={s.nowPlayingText}><div className={s.nowPlayingTitle}>{state.item.title}</div><div className={s.nowPlayingArtist}>{state.item.artist}</div>
        <div className={s.nowPlayingAdded}>Added by {state.item.profiles?.display_name || 'someone'}</div></div>
    </div> : <p className={s.modeScope}>No songs yet</p>}
    <div className={s.transport}>
      <div className={s.timeRow}><span>{time(current)}</span><span>{time(snapshot.duration)}</span></div>
      <input className={s.seekbar} type="range" min="0" max={snapshot.duration || 0} value={current} step="0.1"
        aria-label="Your playback position" disabled={!snapshot.duration || state.loading}
        style={{ '--seek-progress': `${snapshot.duration ? current / snapshot.duration * 100 : 0}%` }} onChange={e => local.seek(Number(e.target.value))} />
      <div className={s.transportButtons}>
        <button className={s.iconButton} title="Previous track on this device" aria-label="Previous track" disabled={!state.item || state.loading} onClick={local.previous}><JamIcon name="previous" size={20} /></button>
        <button className={s.playButton} title={playing ? 'Pause on this device' : 'Play on this device'} aria-label={playing ? 'Pause playback' : 'Play playback'} disabled={state.loading || !state.item}
          onClick={playing ? local.pause : local.play}><JamIcon name={playing ? 'pause' : 'play'} size={24} /></button>
        <button className={s.iconButton} title="Next track on this device" aria-label="Next track" disabled={!state.item || state.loading} onClick={local.next}><JamIcon name="next" size={20} /></button>
      </div>
    </div>
    <div className={s.personalFooter}><label className={s.personalRepeat}><JamIcon name="repeat" size={15} /> Repeat
      <select aria-label="Your repeat mode" value={state.repeat} onChange={e => local.repeat(e.target.value)}><option value="none">Off</option><option value="song">Song</option><option value="queue">Queue</option></select></label>
      <span className={s.modeScope}>This device</span></div>
    {state.error && <div className={s.playbackError} role="alert">{state.error} <button className={s.repeatBtn} onClick={local.play}>Retry</button></div>}
    {state.item && <details className={s.listenDetails}><summary>Listen on other platforms</summary><PlatformLinks platformLinks={state.item.platform_links} query={`${state.item.title} ${state.item.artist}`} /></details>}
  </section>;
}

export function IndependentQueue({ items, local }) {
  const visible = items.filter(item => item.status !== 'skipped').sort((a, b) => a.position - b.position);
  return <section className={s.queueSection} aria-labelledby="independent-queue-heading"><div className={s.sectionHeading}>
    <h3 id="independent-queue-heading">Shared Queue</h3><span className={s.queueCount}>{visible.length} songs</span></div>
    {!visible.length && <p className={s.modeScope}>No songs yet. Add one to the queue.</p>}
    <div className={s.queueList}>{visible.map((item, index) => <div key={item.id}
      className={`${s.queueCard} ${local.state.item?.id === item.id ? s.personalCurrent : ''}`}>
      <span className={s.queueIndex}>{index + 1}</span>
      {item.thumbnail_url && <img className={s.queueThumb} src={item.thumbnail_url} alt="" />}
      <div className={s.queueInfo}><div className={s.queueTitle}>{item.title}</div><div className={s.queueArtist}>{item.artist}</div></div>
      {local.state.item?.id === item.id && <span className={s.personalMarker}>On your device</span>}
      {item.resolve_status === 'failed' && <span className={s.modeScope}>Unavailable</span>}
      {item.resolve_status === 'resolving' && <span className={s.modeScope}>Pending</span>}
      <button className={s.queuePlayBtn} aria-label={`Play ${item.title}`} title={`Play ${item.title} on this device`}
        disabled={item.resolve_status === 'failed' || local.state.loading} onClick={() => local.select(item)}><JamIcon name="play" size={16} /></button>
    </div>)}</div>
  </section>;
}
