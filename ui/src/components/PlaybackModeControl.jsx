import { useEffect, useRef, useState } from 'react';
import { setPlaybackMode } from '../lib/session';
import { FLAGS } from '../lib/flags';
import s from '../styles/jam.module.css';

export default function PlaybackModeControl({ session, userId, onChange, onRefresh,
  enabled = FLAGS.INDEPENDENT_PLAYBACK && FLAGS.YOUTUBE_EMBED, changeMode = setPlaybackMode }) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const host = !!userId && session.host_user_id === userId;
  const mode = session.playback_mode ?? 'dj';
  useEffect(() => { setPending(null); setError(''); }, [session.playback_mode_version, session.status, host]);
  useEffect(() => {
    if (pending) dialog.current?.showModal?.();
  }, [pending]);
  if (!enabled && mode !== 'independent') return null;
  async function confirm() {
    if (busy || !host || !pending) return;
    setBusy(true); setError('');
    try {
      const updated = await changeMode(session.id, pending, session.playback_mode_version ?? 0);
      onChange?.(updated); setPending(null);
    } catch (err) { setError(err.message); onRefresh?.(); }
    finally { setBusy(false); }
  }
  return <div className={s.playbackMode}>
    <div className={s.modeSegment} role="group" aria-label="Room playback mode">
      {['dj', 'independent'].map(value => <button key={value} type="button"
        aria-pressed={mode === value} disabled={!host || busy || (value === 'independent' && !enabled)}
        title={host ? 'Change room playback mode' : 'Set by the host'}
        onClick={() => { if (mode !== value) setPending(value); }}>
        {value === 'dj' ? 'DJ-led' : 'Shared Queue'}
      </button>)}
    </div>
    <span className={s.modeScope}>{mode === 'independent' ? 'Independent on each device' : 'Room playback'}{!host ? ' / Host control' : ''}</span>
    {pending && <dialog open={typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal ? true : undefined}
      ref={dialog} className={s.modeDialog} aria-labelledby="mode-dialog-title" onCancel={() => setPending(null)}>
      <h2 id="mode-dialog-title">Switch to {pending === 'dj' ? 'DJ-led' : 'Shared Queue'}?</h2>
      <p>{pending === 'dj' ? 'Personal players will pause. The host becomes DJ and can resume the room queue.'
        : 'DJ playback will pause. Everyone can choose a song and press Play on their own device.'}</p>
      <p>The queue stays available.</p>
      {error && <p role="alert" className={s.playbackError}>{error}</p>}
      <div className={s.modeDialogActions}><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
        <button type="button" className="btn" disabled={busy} onClick={confirm}>{busy ? 'Changing...' : 'Change mode'}</button></div>
    </dialog>}
  </div>;
}
