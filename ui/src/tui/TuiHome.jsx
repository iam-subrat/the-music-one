import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import TerminalShell from './TerminalShell';
import { api } from '../lib/api';
import { PLATFORM_META } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { useAuth } from '../hooks/useAuth';
import { useAnalytics } from '../lib/analytics';
import s from './tui.module.css';

const HELP_LINES = [
  ['lookup <url>',        'find song on every platform (alias: l, search)'],
  ['paste <url>',         'same as lookup; just paste & press enter'],
  ['jam new',             'start a new jam session'],
  ['jam join <code>',     'join an existing jam by 6-char code'],
  ['share',               'copy current page link'],
  ['clear',               'clear the terminal output'],
  ['help',                'show this help'],
];

export default function TuiHome() {
  const [input, setInput] = useState('');
  const [log, setLog] = useState(() => [
    { kind: 'info',   text: 'musicone v1.0 — terminal interface ready.' },
    { kind: 'dim',    text: 'type `help` and press enter, or paste a streaming URL.' },
  ]);
  const [song, setSong] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cmdHistory, setCmdHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { capture } = useAnalytics();
  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const u = p.get('url');
    if (u) {
      append({ kind: 'dim', text: `↻ restoring last query — ${u}` });
      runLookup(u);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [log, song, busy]);

  function append(...lines) {
    setLog(prev => [...prev, ...lines]);
  }

  async function runLookup(url) {
    capture('lookup_started');
    setBusy(true);
    setSong(null);
    append({ kind: 'ok', text: `→ GET /api/song?url=${url}` });
    try {
      const res = await api(`/song/?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`song lookup failed (HTTP ${res.status})`);
      const meta = await res.json();
      setSong(meta);
      append(
        { kind: 'ok',  text: `✓ matched: ${meta.title} — ${meta.artist}` },
        { kind: 'dim', text: `  ${Object.keys(meta.platformLinks ?? {}).length} direct link(s) resolved` },
        { kind: 'songResult', song: meta },
      );
      capture('lookup_succeeded', { platform_count: Object.keys(meta.platformLinks ?? {}).length });
      window.history.replaceState({}, '', `?url=${encodeURIComponent(url)}`);
    } catch (err) {
      append({ kind: 'err', text: `✗ ${err.message}` });
      capture('lookup_failed', { error: err.message });
    } finally {
      setBusy(false);
    }
  }

  function renderSongResult(song) {
    const q = `${song.title} ${song.artist}`;
    return (
      <>
        <div className={s.divider}>──────────── result ────────────</div>
        <div className={s.songMeta}>
          {song.thumbnailUrl && <img src={song.thumbnailUrl} alt="" className={s.songArt} />}
          <div>
            <span className={s.field}><b>title  ·</b> {song.title}</span>
            <span className={s.field}><b>artist ·</b> {song.artist}</span>
            {song.album && <span className={s.field}><b>album  ·</b> {song.album}</span>}
          </div>
        </div>
        <div className={s.divider}>──────────── platforms ─────────</div>
        <div className={s.platforms}>
          {Object.entries(PLATFORM_META).map(([key, p]) => {
            const direct = song?.platformLinks?.[key];
            const href = direct || p.searchUrl(q);
            const isDirect = !!direct;
            return (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={s.platformRow}>
                <span className={`${s.platformBullet} ${isDirect ? '' : s.search}`}>
                  {isDirect ? '▶' : '?'}
                </span>
                <span className={s.platformName}>{p.name}</span>
                <span className={`${s.platformTag} ${isDirect ? s.direct : s.search}`}>
                  {isDirect ? 'open' : 'search'}
                </span>
              </a>
            );
          })}
        </div>
      </>
    );
  }

  function execute(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    append({ kind: 'normal', text: `guest@musicone:~$ ${cmd}` });
    setCmdHistory(h => [...h, cmd]);
    setHistIdx(-1);

    if (/^https?:\/\//i.test(cmd)) { runLookup(cmd); return; }

    const [head, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(' ');

    switch (head.toLowerCase()) {
      case 'help':
      case '?':
        append({ kind: 'info', text: 'available commands:' });
        HELP_LINES.forEach(([c, d]) => append({ kind: 'dim', text: `  ${c.padEnd(20)} ${d}` }));
        break;
      case 'clear':
      case 'cls':
        setLog([]); setSong(null); break;
      case 'lookup':
      case 'l':
      case 'search':
      case 'paste':
        if (!arg) { append({ kind: 'warn', text: 'usage: lookup <url>' }); break; }
        runLookup(arg); break;
      case 'share':
        navigator.clipboard.writeText(location.href).then(
          () => append({ kind: 'ok',  text: '✓ link copied to clipboard' }),
          () => append({ kind: 'err', text: '✗ clipboard unavailable' }),
        ); break;
      case 'jam': {
        if (!FLAGS.JAM_SESSION) { append({ kind: 'err', text: '✗ jam sessions are disabled' }); break; }
        const [sub, code] = arg.split(/\s+/);
        if (sub === 'new') {
          if (!user) { navigate('/login?next=/jam/new'); return; }
          navigate('/jam/new');
        } else if (sub === 'join') {
          if (!code) { append({ kind: 'warn', text: 'usage: jam join <code>' }); break; }
          navigate(`/jam/${code.toUpperCase()}`);
        } else {
          append({ kind: 'warn', text: 'usage: jam new | jam join <code>' });
        }
        break;
      }
      default:
        append({ kind: 'err', text: `command not found: ${head}. try \`help\`.` });
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault(); execute(input); setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!cmdHistory.length) return;
      const next = histIdx < 0 ? cmdHistory.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next); setInput(cmdHistory[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx < 0) return;
      const next = histIdx + 1;
      if (next >= cmdHistory.length) { setHistIdx(-1); setInput(''); }
      else { setHistIdx(next); setInput(cmdHistory[next]); }
    } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); setLog([]);
    }
  }

  return (
    <TerminalShell
      title="musicone.sh ~ home"
      status={busy ? 'querying…' : (song ? 'idle · 1 result' : 'idle')}
      showBanner
      tagline={<>paste any streaming link · listen on every platform · <b>type `help` for commands</b></>}
      onScreenClick={() => inputRef.current?.focus()}
    >
      <div className={s.log}>
        {log.map((line, i) => (
          line.kind === 'songResult'
            ? <div key={i}>{renderSongResult(line.song)}</div>
            : <div key={i} className={`${s.logLine} ${s[line.kind] || ''}`}>{line.text}</div>
        ))}
      </div>

      {busy && (
        <div className={`${s.logLine} ${s.dim}`}>
          <span className={s.spin}>◴</span> resolving platforms…
        </div>
      )}

      <div className={s.divider}>────────────────────────────────</div>

      <form onSubmit={e => { e.preventDefault(); execute(input); setInput(''); }} className={s.prompt}>
        <span className={s.promptSymbol}>guest@musicone:~$</span>
        <input
          ref={inputRef}
          autoFocus
          className={s.promptInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="paste a URL or type `help`"
          spellCheck="false"
          autoComplete="off"
        />
        <span className={s.cursor} />
      </form>

      <div className={s.hint}>
        <kbd>↑</kbd> <kbd>↓</kbd> history · <kbd>⌘L</kbd> clear · <kbd>enter</kbd> run
      </div>

      <div ref={bottomRef} />
    </TerminalShell>
  );
}
