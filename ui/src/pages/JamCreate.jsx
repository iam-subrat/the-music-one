import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTui } from '../tui/TuiContext';
import { createSession } from '../lib/session';
import { FLAGS } from '../lib/flags';
import TerminalShell from '../tui/TerminalShell';
import s from '../styles/jam.module.css';
import t from '../tui/tui.module.css';

export default function JamCreate() {
  const auth = useAuth(), navigate = useNavigate();
  const { tuiMode, guiTheme } = useTui();
  const [mode, setMode] = useState('dj'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [input, setInput] = useState('');
  const submitting = useRef(false);
  useEffect(() => { if (!auth.loading && !auth.user) navigate('/login?next=/jam/new'); }, [auth.loading, auth.user, navigate]);
  async function create(target) {
    if (submitting.current || !auth.user) return;
    if (target === 'independent' && !(FLAGS.INDEPENDENT_PLAYBACK && FLAGS.YOUTUBE_EMBED)) { setError('Shared Queue is not enabled'); return; }
    submitting.current = true; setBusy(true); setError('');
    try { const room = await createSession(target); navigate(`/jam/${room.invite_code}`, { replace: true }); }
    catch (err) { setError(err.message); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (tuiMode) return <TerminalShell title="musicone.sh ~ jam/new" status={busy ? 'creating...' : 'create a jam'} auth={auth}>
    <p className={t.logLine}>create --mode dj</p>{FLAGS.INDEPENDENT_PLAYBACK && <p className={t.logLine}>create --mode independent</p>}
    <p className={`${t.logLine} ${t.dim}`}>default mode: dj</p>{error && <p role="alert" className={`${t.logLine} ${t.err}`}>{error}</p>}
    <form className={t.prompt} onSubmit={e => { e.preventDefault(); const match = /^create(?: --mode (dj|independent))?$/.exec(input.trim());
      if (match) create(match[1] || 'dj'); else setError('usage: create [--mode dj|independent]'); setInput(''); }}>
      <span className={t.promptSymbol}>musicone$</span><input aria-label="Creation command" className={t.promptInput} value={input} onChange={e => setInput(e.target.value)} disabled={busy || auth.loading} autoFocus autoComplete="off" /></form>
  </TerminalShell>;
  return <div className={`page ${s.jamRoom} ${s[guiTheme]}`}><main className={s.createRoom}>
    <a className={s.roomBrand} href="/">music<span>one</span></a><h1>Create a jam</h1>
    <form onSubmit={e => { e.preventDefault(); create(mode); }}><fieldset className={s.createOptions}><legend>Playback mode</legend>
      {['dj', ...(FLAGS.INDEPENDENT_PLAYBACK && FLAGS.YOUTUBE_EMBED ? ['independent'] : [])].map(value => <label key={value} className={s.createOption}>
        <input type="radio" name="playback-mode" value={value} checked={mode === value} onChange={() => setMode(value)} disabled={busy} />
        <span><strong>{value === 'dj' ? 'DJ-led' : 'Shared Queue'}</strong><small>{value === 'dj' ? 'The DJ controls the room queue.' : 'Everyone listens on their own device, at their own pace.'}</small></span></label>)}
    </fieldset>{error && <p className={s.playbackError} role="alert">{error}</p>}<button className="btn" disabled={busy || auth.loading || !auth.user}>{busy ? 'Creating...' : 'Create room'}</button></form>
  </main></div>;
}
