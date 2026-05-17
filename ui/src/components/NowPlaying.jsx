// ui/src/components/NowPlaying.jsx
import { useState, useEffect, useRef } from 'react';
import s from '../styles/jam.module.css';
import { preferredLink, extractYouTubeId, isYouTubeSearchUrl, extractSearchQuery, PLATFORM_META } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { api } from '../lib/api';
import { useSkipVotes } from '../hooks/useSkipVotes';
import { castSkipVote, removeSkipVote, playNext, patchYouTubeLink } from '../lib/queue';
import { setRepeatMode } from '../lib/session';
import { useToast } from './Toast';
import YouTubeAutoPlayer from './YouTubeAutoPlayer';
import { NeuSurface, NeuButton, NeuIconWrapper } from './base';

function SkipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/>
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

function PlayingPill() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'var(--surface)', borderRadius: 20, padding: '4px 10px',
      boxShadow: 'var(--recessed)', fontSize: '0.68rem', fontWeight: 700,
      letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
    }}>
      <span className={s.pulse} />
      Now Playing
    </div>
  );
}

function Waveform() {
  return (
    <div className={s.waveform}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className={s.waveformBar} style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId, onQueueChange, repeatMode, onRepeatModeChange }) {
  const toast = useToast();
  const { count: skipVotes, hasVoted } = useSkipVotes(nowPlaying?.id, userId, sessionId);
  const skipThreshold = Math.floor(participantCount / 2) + 1;

  const [ytId, setYtId] = useState(null);
  const [ytResolvedTitle, setYtResolvedTitle] = useState(null);
  const resolveKey = useRef(null);

  useEffect(() => {
    if (!FLAGS.AUTO_PLAY_QUEUE || !nowPlaying || !isDJ) { setYtId(null); setYtResolvedTitle(null); return; }
    const key = nowPlaying.id;
    resolveKey.current = key;
    setYtResolvedTitle(null);
    const ytUrl = nowPlaying.platform_links?.youtube || nowPlaying.platform_links?.youtubemusic;
    const directId = extractYouTubeId(ytUrl);
    if (directId) { setYtId(directId); return; }
    if (ytUrl && isYouTubeSearchUrl(ytUrl)) {
      const q = extractSearchQuery(ytUrl);
      if (q) {
        api(`/youtube/?q=${encodeURIComponent(q)}`)
          .then(res => res.ok ? res.json() : { id: null, title: null })
          .then(({ id, title }) => {
            if (resolveKey.current !== key) return;
            if (id) { setYtId(id); setYtResolvedTitle(title); }
          });
        return;
      }
    }
    api(`/youtube/?q=${encodeURIComponent(`${nowPlaying.title} ${nowPlaying.artist}`)}`)
      .then(res => res.ok ? res.json() : { id: null, title: null })
      .then(({ id, title }) => {
        if (resolveKey.current !== key) return;
        if (id) {
          setYtId(id);
          setYtResolvedTitle(title);
          patchYouTubeLink(nowPlaying.id, `https://www.youtube.com/watch?v=${id}`);
        }
      });
  }, [nowPlaying?.id, isDJ]);

  async function handleEnded() {
    if (!isDJ) return;
    try {
      const next = await playNext(sessionId);
      onQueueChange?.();
      if (!next) toast('Queue is empty!');
    } catch (e) { toast(e.message); }
  }

  async function handleSkipVote() {
    try {
      if (hasVoted) {
        await removeSkipVote(nowPlaying.id, userId);
      } else {
        const skipped = await castSkipVote(nowPlaying.id, skipThreshold);
        if (skipped) onQueueChange?.();
      }
    } catch (e) { toast(e.message); }
  }

  if (!nowPlaying) {
    return (
      <NeuSurface size="lg" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)' }}>
          Now Playing
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {isDJ ? 'Click "Play Next" to start the queue.' : 'Waiting for the DJ to start…'}
        </p>
        {isDJ && (
          <NeuButton
            variant="primary"
            onClick={() => playNext(sessionId).then(n => { onQueueChange?.(); if (!n) toast('Queue is empty!'); })}
          >
            Play Next
          </NeuButton>
        )}
      </NeuSurface>
    );
  }

  const pref = preferredLink(nowPlaying.platform_links, preferredPlatform);
  const prefMeta = pref ? PLATFORM_META[pref.platform] : null;

  return (
    <NeuSurface size="lg" style={{ overflow: 'hidden', padding: 0 }}>

      {/* Video embed — recessed directly into card, DJ only */}
      {FLAGS.AUTO_PLAY_QUEUE && ytId && isDJ && (
        <div style={{
          margin: 20,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: 'var(--recessed)',
          aspectRatio: '16/9',
          background: '#1a1a24',
          position: 'relative',
        }}>
          {ytResolvedTitle && (
            <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', zIndex: 1 }}>
              ▶ {ytResolvedTitle}
            </div>
          )}
          <YouTubeAutoPlayer videoId={ytId} onEnded={handleEnded} repeat={repeatMode === 'song'} />
        </div>
      )}

      {/* Static YouTube embed (no autoplay flag) */}
      {FLAGS.YOUTUBE_EMBED && !FLAGS.AUTO_PLAY_QUEUE && ytId && (
        <div style={{ margin: 20, borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--recessed)', aspectRatio: '16/9' }}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ytId}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allowFullScreen
            title="YouTube preview"
          />
        </div>
      )}

      {/* Song info row */}
      <div style={{ padding: '18px 24px 10px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {isDJ ? (
          <NeuIconWrapper size={52} radius={14}>
            <MusicIcon />
          </NeuIconWrapper>
        ) : (
          <Waveform />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <PlayingPill />
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nowPlaying.title}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{nowPlaying.artist}</div>
          {nowPlaying.profiles?.display_name && (
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
              Added by {nowPlaying.profiles.display_name}
            </div>
          )}
        </div>
        {isDJ && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--surface)', borderRadius: 20, padding: '6px 12px',
            boxShadow: 'var(--recessed)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
            DJ
          </div>
        )}
      </div>

      {/* Open on preferred platform */}
      {pref && (
        <div style={{ padding: '0 24px 12px' }}>
          <a
            href={pref.url}
            target="_blank"
            rel="noopener noreferrer"
            className={s.preferredBtn}
            style={{ '--platform-color': prefMeta?.color }}
          >
            Open on {prefMeta?.name || pref.platform} ↗
          </a>
        </div>
      )}

      {/* Controls row */}
      <div style={{ padding: '0 20px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {FLAGS.VOTE_TO_SKIP && (
          <>
            <NeuButton
              variant="ghost"
              icon={<SkipIcon />}
              onClick={handleSkipVote}
              style={{ color: hasVoted ? 'var(--accent)' : 'var(--icons)', padding: '10px 14px' }}
            >
              Skip
            </NeuButton>
            <span style={{
              background: 'var(--surface)', borderRadius: 20, padding: '4px 10px',
              boxShadow: 'var(--recessed)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)',
            }}>
              {skipVotes} / {skipThreshold}
            </span>
          </>
        )}
        <div style={{ flex: 1 }} />
        {isDJ && (
          <>
            <NeuButton
              variant="ghost"
              onClick={() => playNext(sessionId).then(n => { onQueueChange?.(); if (!n) toast('Queue is empty!'); })}
              style={{ padding: '10px 14px', fontSize: '0.85rem' }}
            >
              Next ▶
            </NeuButton>
            <NeuButton
              variant="ghost"
              onClick={() => {
                const next = { none: 'song', song: 'queue', queue: 'none' }[repeatMode];
                onRepeatModeChange?.(next);
                setRepeatMode(sessionId, next).catch(e => { onRepeatModeChange?.(repeatMode); toast(e.message); });
              }}
              style={{ padding: '10px 14px', fontSize: '0.85rem', color: repeatMode !== 'none' ? 'var(--accent)' : 'var(--icons)' }}
            >
              {repeatMode === 'queue' ? '⟳ Queue' : repeatMode === 'song' ? '⟳ Song' : '⟳'}
            </NeuButton>
          </>
        )}
      </div>
    </NeuSurface>
  );
}
