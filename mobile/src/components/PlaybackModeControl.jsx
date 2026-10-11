import { useState } from 'react';
import { setPlaybackMode } from '../lib/session';
export default function PlaybackModeControl({ session, userId, enabled, onChange, onRefresh }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mode = session.playback_mode ?? 'dj', host = session.host_user_id === userId;
  if (!enabled && mode === 'dj') return null;
  async function change(next) {
    if (!host || busy || mode === next || !window.confirm('Change room playback mode for everyone? Playback will pause; the queue stays available.')) return;
    setBusy(true); setError('');
    try { onChange(await setPlaybackMode(session.id, next, session.playback_mode_version ?? 0)); }
    catch (failure) { setError(failure.message); onRefresh(); }
    finally { setBusy(false); }
  }
  return <section className="mb-5" aria-label="Room playback mode">
    <div className="flex border-2 border-black rounded-lg overflow-hidden">
      {['dj', 'independent'].map(value => <button key={value} aria-pressed={mode === value}
        className={'flex-1 p-3 text-sm font-bold ' + (mode === value ? 'bg-black text-lime-accent' : 'bg-white')}
        disabled={!host || busy || (value === 'independent' && !enabled)} onClick={() => change(value)}>
        {value === 'dj' ? 'DJ-led' : 'Shared Queue'}</button>)}
    </div>
    <p className="text-xs font-medium text-gray-600 mt-2">{mode === 'independent' ? 'Independent on each device' : 'Room playback'}{!host && ' / Host control'}</p>
    {error && <p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}
  </section>;
}
