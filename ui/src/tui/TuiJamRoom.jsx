import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TerminalShell from './TerminalShell';
import { useAuth } from '../hooks/useAuth';
import { useSession } from '../hooks/useSession';
import { useQueue } from '../hooks/useQueue';
import { useParticipants } from '../hooks/useParticipants';
import { useSkipVotes } from '../hooks/useSkipVotes';
import { joinSession, endSession, passDjToken, setRepeatMode } from '../lib/session';
import { addToQueue, searchAndAddToQueue, playNext, forceSkip, castSkipVote, removeSkipVote, patchYouTubeLink } from '../lib/queue';
import { API_BASE, api } from '../lib/api';
import { useAnalytics } from '../lib/analytics';
import { FLAGS } from '../lib/flags';
import YouTubeAutoPlayer from '../components/YouTubeAutoPlayer';
import { extractYouTubeId, isYouTubeSearchUrl, extractSearchQuery } from '../lib/platform';
import s from './tui.module.css';

const HELP_LINES = [
  ['add <url>',               'queue a song by streaming URL'],
  ['add "<name>" [artist]',   'queue by name search'],
  ['play | resume',           'DJ only — resume playback'],
  ['pause | p',               'DJ only — pause playback'],
  ['seek <sec>',              'DJ only — jump to position (seconds)'],
  ['next',                    'DJ only — play next track'],
  ['skip',                    'cast skip vote (DJ → force skip)'],
  ['unvote',                  'remove your skip vote'],
  ['dj <user-id|me>',         'host only — pass DJ token'],
  ['repeat <none|song|queue>','DJ only — set repeat mode'],
  ['invite',                  'copy invite link to clipboard'],
  ['end',                     'host only — end session'],
  ['leave',                   'leave the session'],
  ['clear',                   'clear terminal log'],
  ['help',                    'show this help'],
];

export default function TuiJamRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { user, profile, loading: authLoading } = auth;
  const { session, loading: sessionLoading, setSession } = useSession(code);
  const { items: queueItems, refresh: refreshQueue, addItem } = useQueue(session?.id);
  const { participants, refresh: refreshParticipants } = useParticipants(session?.id);
  const { capture } = useAnalytics();

  const [log, setLog] = useState(() => [{ kind: 'info', text: 'connecting to jam session…' }]);
  const [input, setInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [ytId, setYtId] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const didJoinRef = useRef(false);
  const sessionIdRef = useRef(null);
  const ytResolveKey = useRef(null);
  const ytPlayerRef = useRef(null);

  const nowPlaying = queueItems.find(i => i.status === 'playing') ?? null;
  const isDJ = !!session && session.dj_user_id === user?.id;
  const isHost = !!session && session.host_user_id === user?.id;
  const { count: skipVotes, hasVoted } = useSkipVotes(nowPlaying?.id, user?.id, session?.id);
  const skipThreshold = Math.floor(participants.length / 2) + 1;

  function append(...lines) { setLog(prev => [...prev, ...lines]); }

  useEffect(() => {
    if (!authLoading && !user) navigate(`/login?next=/jam/${code}`);
  }, [authLoading, user, code, navigate]);

  useEffect(() => {
    if (!session?.id || !user?.id || didJoinRef.current) return;
    didJoinRef.current = true;
    sessionIdRef.current = session.id;
    joinSession(session.id).then(() => {
      refreshParticipants();
      append(
        { kind: 'ok',  text: `✓ joined session ${session.invite_code}` },
        { kind: 'dim', text: `  host=${session.host_user_id?.slice(0,8)}  dj=${session.dj_user_id?.slice(0,8)}` },
        { kind: 'dim', text: '  type `help` to see commands' },
      );
      capture('jam_session_joined', { session_code: code, participant_count: participants.length + 1 });
    }).catch(err => append({ kind: 'err', text: `✗ join failed: ${err.message}` }));
    // Run once per session+user pair; didJoinRef guards against re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, user?.id]);

  useEffect(() => { sessionIdRef.current = session?.id ?? null; }, [session?.id]);

  useEffect(() => () => {
    if (sessionIdRef.current)
      navigator.sendBeacon(`${API_BASE}/api/sessions/${sessionIdRef.current}/leave`);
    // Mount-time only: cleanup runs on unmount using the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session?.id) return;
    const id = setInterval(() => {
      fetch(`${API_BASE}/api/sessions/${session.id}/heartbeat`, {
        method: 'POST', credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [session?.id]);

  useEffect(() => {
    if (!FLAGS.AUTO_PLAY_QUEUE || !nowPlaying || !isDJ) { setYtId(null); return; }

    const key = nowPlaying.id;
    ytResolveKey.current = key;
    // Don't null ytId here — keeping player mounted preserves iOS autoplay unlock.

    // 1. Direct YouTube video link
    const ytUrl = nowPlaying.platform_links?.youtube || nowPlaying.platform_links?.youtubemusic;
    const directId = extractYouTubeId(ytUrl);
    if (directId) { setYtId(directId); return; }

    // 2. YouTube search-results URL → resolve query via backend
    if (ytUrl && isYouTubeSearchUrl(ytUrl)) {
      const q = extractSearchQuery(ytUrl);
      if (q) {
        api(`/youtube/?q=${encodeURIComponent(q)}`)
          .then(r => r.ok ? r.json() : { id: null })
          .then(({ id }) => {
            if (ytResolveKey.current !== key) return;
            if (id) setYtId(id);
          });
        return;
      }
    }

    // 3. Fallback: title + artist search; persist result so other clients benefit.
    api(`/youtube/?q=${encodeURIComponent(`${nowPlaying.title} ${nowPlaying.artist}`)}`)
      .then(r => r.ok ? r.json() : { id: null })
      .then(({ id }) => {
        if (ytResolveKey.current !== key) return;
        if (id) {
          setYtId(id);
          patchYouTubeLink(nowPlaying.id, `https://www.youtube.com/watch?v=${id}`);
        }
      });
    // Re-resolve only when the song or DJ status changes; other nowPlaying
    // fields are read at resolve time, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.id, isDJ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [log]);

  async function exec(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    const user_label = profile?.display_name?.toLowerCase().replace(/\s+/g, '') || 'user';

    if (pendingConfirm) {
      append({ kind: 'normal', text: `confirm (y/N)> ${cmd}` });
      const pc = pendingConfirm;
      setPendingConfirm(null);
      if (/^(y|yes)$/i.test(cmd)) await pc.action();
      else append({ kind: 'dim', text: '  cancelled.' });
      return;
    }

    append({ kind: 'normal', text: `${user_label}@jam:${code}$ ${cmd}` });
    setCmdHistory(h => [...h, cmd]);
    setHistIdx(-1);

    if (/^https?:\/\//i.test(cmd)) { return doAdd(cmd); }

    const [head, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(' ');

    switch (head.toLowerCase()) {
      case 'help': case '?':
        append({ kind: 'info', text: 'commands:' });
        HELP_LINES.forEach(([c, d]) => append({ kind: 'dim', text: `  ${c.padEnd(26)} ${d}` }));
        break;
      case 'clear': case 'cls':
        setLog([]); break;
      case 'add': case 'queue': case 'q':
        if (!arg) { append({ kind: 'warn', text: 'usage: add <url>  or  add "<name>" [artist]' }); break; }
        return doAdd(arg);
      case 'next': case 'n':
        if (!isDJ) { append({ kind: 'err', text: '✗ DJ only' }); break; }
        try { await playNext(session.id); append({ kind: 'ok', text: '✓ advanced queue' }); refreshQueue(); }
        catch (e) { append({ kind: 'err', text: `✗ ${e.message}` }); }
        break;
      case 'pause': case 'p':
        if (!isDJ) { append({ kind: 'err', text: '✗ DJ only' }); break; }
        if (!ytPlayerRef.current?.isReady?.()) { append({ kind: 'warn', text: '~ no player active' }); break; }
        ytPlayerRef.current.pause();
        append({ kind: 'ok', text: '⏸ paused' });
        break;
      case 'play': case 'resume':
        if (!isDJ) { append({ kind: 'err', text: '✗ DJ only' }); break; }
        if (!ytPlayerRef.current?.isReady?.()) { append({ kind: 'warn', text: '~ no player active' }); break; }
        ytPlayerRef.current.play();
        append({ kind: 'ok', text: '▶ resumed' });
        break;
      case 'seek': {
        if (!isDJ) { append({ kind: 'err', text: '✗ DJ only' }); break; }
        if (!ytPlayerRef.current?.isReady?.()) { append({ kind: 'warn', text: '~ no player active' }); break; }
        const sec = parseFloat(arg);
        if (!Number.isFinite(sec) || sec < 0) { append({ kind: 'warn', text: 'usage: seek <sec>' }); break; }
        ytPlayerRef.current.seek(sec);
        append({ kind: 'ok', text: `⇥ seek=${sec}s` });
        break;
      }
      case 'skip':
        if (!nowPlaying) { append({ kind: 'warn', text: '~ nothing playing' }); break; }
        if (isDJ) {
          try { await forceSkip(session.id); append({ kind: 'ok', text: '✓ track skipped' }); refreshQueue(); }
          catch (e) { append({ kind: 'err', text: `✗ ${e.message}` }); }
        } else {
          try {
            const skipped = await castSkipVote(nowPlaying.id, skipThreshold);
            append({ kind: 'ok', text: skipped
              ? '✓ skip threshold reached — advancing'
              : `✓ vote cast (${skipVotes + 1}/${skipThreshold})` });
          } catch (e) { append({ kind: 'err', text: `✗ ${e.message}` }); }
        }
        break;
      case 'unvote':
        if (!nowPlaying || !hasVoted) { append({ kind: 'warn', text: '~ no vote to remove' }); break; }
        try { await removeSkipVote(nowPlaying.id); append({ kind: 'ok', text: '✓ vote removed' }); }
        catch (e) { append({ kind: 'err', text: `✗ ${e.message}` }); }
        break;
      case 'dj':
        if (!isHost) { append({ kind: 'err', text: '✗ host only' }); break; }
        if (!arg) { append({ kind: 'warn', text: 'usage: dj <user-id|me>' }); break; }
        try {
          const target = arg === 'me' ? user.id : arg;
          await passDjToken(session.id, target);
          append({ kind: 'ok', text: `✓ DJ passed to ${target.slice(0,8)}` });
        } catch (e) { append({ kind: 'err', text: `✗ ${e.message}` }); }
        break;
      case 'repeat': {
        if (!isDJ) { append({ kind: 'err', text: '✗ DJ only' }); break; }
        const REPEAT_ALIASES = { one: 'song', all: 'queue', off: 'none' };
        const mode = REPEAT_ALIASES[arg] ?? arg;
        if (!['none','song','queue'].includes(mode)) {
          append({ kind: 'warn', text: 'usage: repeat <none|song|queue>' });
          break;
        }
        try {
          await setRepeatMode(session.id, mode);
          setSession(prev => ({ ...prev, repeat_mode: mode }));
          append({ kind: 'ok', text: `✓ repeat=${mode}` });
        } catch (e) { append({ kind: 'err', text: `✗ ${e.message}` }); }
        break;
      }
      case 'invite':
        navigator.clipboard.writeText(`${location.origin}/jam/${code}`).then(
          () => append({ kind: 'ok',  text: '✓ invite link copied' }),
          () => append({ kind: 'err', text: '✗ clipboard unavailable' }),
        ); break;
      case 'end':
        if (!isHost) { append({ kind: 'err', text: '✗ host only' }); break; }
        append({ kind: 'warn', text: '? end this jam for everyone? press `y` then enter to confirm' });
        setPendingConfirm({
          action: async () => {
            try {
              await endSession(session.id);
              capture('jam_session_ended', { session_code: code });
              navigate('/');
            } catch (e) { append({ kind: 'err', text: `✗ ${e.message}` }); }
          },
        });
        break;
      case 'leave':
        navigate('/'); break;
      default:
        append({ kind: 'err', text: `unknown command: ${head}. try \`help\`.` });
    }
  }

  async function doAdd(arg) {
    try {
      let item;
      if (/^https?:\/\//i.test(arg)) {
        item = await addToQueue(session.id, arg);
      } else {
        const m = arg.match(/^"([^"]+)"\s*(.*)$/);
        item = await searchAndAddToQueue(session.id, m ? m[1] : arg, m?.[2] || undefined);
      }
      addItem(item);
      append({ kind: 'ok', text: `✓ queued: ${item.title} — ${item.artist}` });
      refreshQueue();
    } catch (e) { append({ kind: 'err', text: `✗ ${e.message}` }); }
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); exec(input); setInput(''); }
    else if (e.key === 'ArrowUp') {
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

  if (authLoading || sessionLoading) {
    return (
      <TerminalShell title="musicone.sh ~ jam" status="connecting…" auth={auth}>
        <div className={`${s.logLine} ${s.dim}`}><span className={s.spin}>◴</span> resolving session…</div>
      </TerminalShell>
    );
  }
  if (!session) {
    return (
      <TerminalShell title="musicone.sh ~ jam" status="not found" auth={auth}>
        <div className={`${s.logLine} ${s.err}`}>✗ session not found: {code}</div>
        <div className={s.hint}><a href="/" style={{ color: 'var(--tui-accent)' }}>cd ~</a> · go home</div>
      </TerminalShell>
    );
  }
  if (session.status === 'ended') {
    const played = queueItems.filter(i => ['played','playing','skipped'].includes(i.status));
    return (
      <TerminalShell title="musicone.sh ~ jam" status="ended" auth={auth}>
        <div className={`${s.logLine} ${s.warn}`}>~ session ended · {played.length} song{played.length !== 1 ? 's' : ''} played</div>
        <div className={s.divider}>──────── recap ────────</div>
        <table className={s.queueTable}>
          <tbody>
            {played.map((it, i) => (
              <tr key={it.id} className={s[it.status]}>
                <td className={s.idx}>{String(i+1).padStart(2,'0')}</td>
                <td>{it.title}</td>
                <td className={s.dim}>{it.artist}</td>
                <td className={s.status}>{it.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={s.hint} style={{ marginTop: 18 }}>
          <a href="/" style={{ color: 'var(--tui-accent)' }}>[ back home ]</a>
        </div>
      </TerminalShell>
    );
  }

  const upcoming = queueItems.filter(i => i.status === 'queued');
  const statusLine = `${participants.length} online${isDJ ? ' · you are DJ' : ''}${isHost ? ' · host' : ''}`;

  return (
    <TerminalShell
      title={`musicone.sh ~ jam/${code}`}
      status={statusLine}
      onScreenClick={() => inputRef.current?.focus()}
      auth={auth}
    >
      {ytId && isDJ && (
        <div style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <YouTubeAutoPlayer
            ref={ytPlayerRef}
            videoId={ytId}
            onEnded={async () => { try { await playNext(session.id); } catch {} }}
          />
        </div>
      )}

      <div className={s.jamGrid}>
        <div className={`${s.panel} ${s.panelSpan2}`}>
          <div className={s.panelLabel}>now playing</div>
          {nowPlaying ? (
            <div className={s.nowPlayingBlock}>
              {nowPlaying.thumbnail_url && <img src={nowPlaying.thumbnail_url} alt="" />}
              <div>
                <div style={{ color: 'var(--tui-accent)', fontWeight: 600 }}>▶ {nowPlaying.title}</div>
                <div style={{ color: 'var(--tui-fg-dim)' }}>{nowPlaying.artist}</div>
                <div className={`${s.logLine} ${s.dim}`} style={{ marginTop: 6 }}>
                  votes to skip: <b style={{ color: 'var(--tui-amber)' }}>{skipVotes}/{skipThreshold}</b>
                  {hasVoted && <span style={{ color: 'var(--tui-magenta)', marginLeft: 10 }}>· you voted</span>}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--tui-fg-mute)', fontStyle: 'italic' }}>~ nothing playing · type `add &lt;url&gt;` to queue a song</div>
          )}
        </div>

        <div className={s.panel}>
          <div className={s.panelLabel}>queue ({upcoming.length})</div>
          {upcoming.length === 0 ? (
            <div className={`${s.logLine} ${s.mute}`}>~ queue empty</div>
          ) : (
            <table className={s.queueTable}>
              <thead><tr><th>#</th><th>title</th><th>by</th></tr></thead>
              <tbody>
                {upcoming.map((it, i) => (
                  <tr key={it.id}>
                    <td className={s.idx}>{String(i+1).padStart(2,'0')}</td>
                    <td>
                      {it.title}<span style={{ color: 'var(--tui-fg-mute)' }}> — {it.artist}</span>
                      {it.resolve_status === 'resolving' && <span style={{ color: 'var(--tui-amber)' }}> ⟳</span>}
                      {it.resolve_status === 'failed'    && <span style={{ color: 'var(--tui-red)' }}> !</span>}
                    </td>
                    <td className={s.dim}>{it.profiles?.display_name || 'someone'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={s.panel}>
          <div className={s.panelLabel}>participants ({participants.length})</div>
          <div className={s.participantList}>
            {participants.map(p => {
              const isYou = p.id === user?.id;
              const tag = session.host_user_id === p.id ? 'host'
                        : session.dj_user_id   === p.id ? 'dj' : null;
              return (
                <div key={p.id} className={s.participantRow}>
                  <span>●</span>
                  <span className={isYou ? s.you : ''}>
                    {p.display_name || p.id?.slice(0,8) || 'guest'}{isYou ? ' (you)' : ''}
                  </span>
                  {tag && <span className={`${s.badge} ${s[tag]}`}>{tag}</span>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--tui-fg-dim)' }}>invite code:</div>
          <div className={s.inviteCode}>{session.invite_code}</div>
        </div>
      </div>

      <div className={s.divider}>──────────── log ────────────</div>
      <div className={s.log}>
        {log.map((line, i) => (
          <div key={i} className={`${s.logLine} ${s[line.kind] || ''}`}>{line.text}</div>
        ))}
      </div>

      <form onSubmit={e => { e.preventDefault(); exec(input); setInput(''); }} className={s.prompt}>
        <span className={s.promptSymbol}>
          {pendingConfirm
            ? 'confirm (y/N)>'
            : `${profile?.display_name?.toLowerCase().replace(/\s+/g,'') || 'user'}@jam:${code}$`}
        </span>
        <input
          ref={inputRef}
          autoFocus
          className={s.promptInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="type `help` or `add <url>`"
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
