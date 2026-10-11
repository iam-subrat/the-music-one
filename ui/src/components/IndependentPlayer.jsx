import { useEffect, useState } from 'react';
import PlayerSurface from './PlayerSurface';
import PlayerLinks from './PlayerLinks';

export default function IndependentPlayer({ local, preferredPlatform }) {
  const { state } = local;
  const [snapshot, setSnapshot] = useState({ time: 0, duration: 0, state: -1 });
  useEffect(() => {
    const update = () => setSnapshot({ time: local.getTime(), duration: local.getDuration(), state: local.getState() });
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [local.getTime, local.getDuration, local.getState, state.item?.id]);
  const playing = snapshot.state === 1;
  const started = !!state.started;
  const status = state.loading ? 'Loading' : state.error ? 'Unavailable' : state.atEnd ? 'Queue finished'
    : playing ? 'Playing' : started ? 'Paused' : state.item ? 'Ready' : 'Empty queue';
  return <PlayerSurface item={state.item} label="Your playback" status={status} playing={playing}
    current={snapshot.time} duration={snapshot.duration} canControl started={started} busy={state.loading}
    onPlay={local.play} onPause={local.pause} onPrevious={local.previous} onNext={local.next} onSeek={local.seek}
    repeat={state.repeat} onRepeat={local.repeat} scope="This device" error={state.error}>
    <PlayerLinks item={state.item} preferredPlatform={preferredPlatform} />
  </PlayerSurface>;
}
