import { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Repeat } from 'lucide-react';
export default function IndependentControls({ local }) {
  const { getTime, getDuration, getState } = local;
  const [snapshot, setSnapshot] = useState({ time: 0, duration: 0, playing: false });
  useEffect(() => {
    const update = () => setSnapshot({ time: getTime(), duration: getDuration(), playing: getState() === 1 });
    update(); const timer = setInterval(update, 500); return () => clearInterval(timer);
  }, [getTime, getDuration, getState]);
  return <section className="border-y-2 border-black py-5 mb-6" aria-label="Your playback">
    <div className="flex justify-between items-center mb-3"><h2 className="font-black text-lg">Your playback</h2>
      <span className="text-xs font-bold text-gray-600">This device</span></div>
    <div className="flex gap-3 items-center mb-3">
      {local.state.item?.thumbnail_url && <img src={local.state.item.thumbnail_url} alt="" className="w-16 h-16 rounded object-cover shrink-0" />}
      <div className="min-w-0"><p className="font-bold truncate">{local.state.item?.title || 'No songs yet'}</p>
      <p className="text-sm text-gray-600 truncate">{local.state.item?.artist}</p></div>
    </div>
    <input aria-label="Your playback position" className="w-full accent-black" type="range" min="0" max={snapshot.duration || 0}
      value={Math.min(snapshot.time, snapshot.duration || 0)} disabled={!snapshot.duration} onChange={e => local.seek(Number(e.target.value))} />
    <div className="flex items-center justify-center gap-5 my-3">
      <button aria-label="Previous track" title="Previous track" disabled={local.state.loading || !local.state.item} className="p-3 disabled:opacity-40" onClick={local.previous}><SkipBack /></button>
      <button aria-label={snapshot.playing ? 'Pause playback' : 'Play playback'} title={snapshot.playing ? 'Pause' : 'Play'}
        disabled={local.state.loading || !local.state.item} className="p-4 bg-lime-accent border-2 border-black rounded-lg disabled:opacity-40"
        onClick={snapshot.playing ? local.pause : local.play}>{snapshot.playing ? <Pause /> : <Play />}</button>
      <button aria-label="Next track" title="Next track" disabled={local.state.loading || !local.state.item} className="p-3 disabled:opacity-40" onClick={local.next}><SkipForward /></button>
    </div>
    <label className="flex gap-2 items-center text-sm font-bold"><Repeat size={16} /> Repeat
      <select aria-label="Your repeat mode" value={local.state.repeat} onChange={e => local.repeat(e.target.value)}
        className="border-2 border-black rounded px-2 py-1"><option value="none">Off</option><option value="song">Song</option><option value="queue">Queue</option></select></label>
    {local.state.loading && <p role="status" className="text-sm mt-2">Finding playback link...</p>}
    {local.state.error && <p role="alert" className="text-red-700 mt-2 text-sm">{local.state.error} <button className="underline" onClick={local.play}>Retry</button></p>}
    {local.state.atEnd && <p role="status" className="text-sm mt-2">End of your queue</p>}
  </section>;
}
