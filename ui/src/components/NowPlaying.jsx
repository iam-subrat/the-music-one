import { useState, useEffect, useRef } from 'react';
import s from '../styles/jam.module.css';
import { preferredLink, extractYouTubeId, isYouTubeSearchUrl, extractSearchQuery, PLATFORM_META } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { api } from '../lib/api';
import { useSkipVotes } from '../hooks/useSkipVotes';
import { castSkipVote, removeSkipVote, playNext, patchYouTubeLink } from '../lib/queue';
import { setRepeatMode } from '../lib/session';
import { useToast } from './Toast';
import PlatformLinks from './PlatformLinks';
import YouTubeAutoPlayer from './YouTubeAutoPlayer';
import { useAnalytics } from '../lib/analytics';
import { useMediaSession } from '../hooks/useMediaSession';

export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId, onQueueChange, repeatMode, onRepeatModeChange }) {
  const toast = useToast();
  const { count: skipVotes, hasVoted } = useSkipVotes(nowPlaying?.id, userId, sessionId);
  const skipThreshold = Math.floor(participantCount / 2) + 1;
  const { capture } = useAnalytics();
  const prevNowPlayingIdRef = useRef(null);
  const ytFeatureFiredRef   = useRef(false);

  const [ytId, setYtId] = useState(null);
  const [ytResolvedTitle, setYtResolvedTitle] = useState(null);
  const resolveKey = useRef(null);
  const ytPlayerRef = useRef(null);

  useMediaSession({
    enabled:  !!(FLAGS.AUTO_PLAY_QUEUE && isDJ && ytId && nowPlaying),
    playerRef: ytPlayerRef,
    metadata: nowPlaying ? {
      title:    nowPlaying.title,
      artist:   nowPlaying.artist,
      artwork:  nowPlaying.thumbnail_url,
    } : null,
    onNext: () => { handleEnded(); },
    onPrev: () => ytPlayerRef.current?.seek?.(0),
  });

  useEffect(() => {
    if (!FLAGS.AUTO_PLAY_QUEUE || !nowPlaying || !isDJ) { setYtId(null); setYtResolvedTitle(null); return; }

    const key = nowPlaying.id;
    resolveKey.current = key;
    setYtResolvedTitle(null);
    // Don't null ytId here — keeping the player mounted preserves the iOS media
    // element "activation" so subsequent songs autoplay after the first user tap.

    // 1. Direct YouTube link
    const ytUrl = nowPlaying.platform_links?.youtube || nowPlaying.platform_links?.youtubemusic;
    const directId = extractYouTubeId(ytUrl);
    if (directId) { setYtId(directId); return; }

    // 2. YouTube search URL → resolve via SearXNG
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

    // 3. Fallback: title + artist search — persist result so all clients benefit
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

  useEffect(() => {
    if (!nowPlaying || nowPlaying.id === prevNowPlayingIdRef.current) return;
    prevNowPlayingIdRef.current = nowPlaying.id;
    capture('song_played', {
      platform:    nowPlaying.platform_links ? Object.keys(nowPlaying.platform_links)[0] : 'unknown',
      source:      isDJ ? 'manual' : 'auto',
    });
  }, [nowPlaying?.id]);

  useEffect(() => {
    if (!ytId || ytFeatureFiredRef.current) return;
    if (FLAGS.YOUTUBE_EMBED || FLAGS.AUTO_PLAY_QUEUE) {
      capture('feature_used', { feature: FLAGS.AUTO_PLAY_QUEUE ? 'auto_play_queue' : 'youtube_embed' });
      ytFeatureFiredRef.current = true;
    }
  }, [ytId]);

  async function handleEnded() {
    if (!isDJ) return;
    try {
      const next = await playNext(sessionId);
      onQueueChange?.();
      if (!next) toast('Queue is empty!');
    } catch (e) {
      toast(e.message);
    }
  }

  if (!nowPlaying) {
    return (
      <div className={`${s.nowPlaying} ${s.nowPlayingIdle}`}>
        {FLAGS.AUTO_PLAY_QUEUE && ytId && isDJ && (
          <div style={{ display: 'none' }}>
            <YouTubeAutoPlayer ref={ytPlayerRef} videoId={ytId} onEnded={handleEnded} repeat={repeatMode === 'song'} />
          </div>
        )}
        <div className={s.nowPlayingLabel}>Now Playing</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {isDJ ? 'Click "Play Next" to start the queue.' : 'Waiting for the DJ to start…'}
        </p>
        {isDJ && (
          <button className="btn" onClick={() => playNext(sessionId).then(n => { onQueueChange?.(); if (!n) toast('Queue is empty!'); })}>
            Play Next ▶
          </button>
        )}
      </div>
    );
  }

  const pref = preferredLink(nowPlaying.platform_links, preferredPlatform);
  const query = `${nowPlaying.title} ${nowPlaying.artist}`;
  const prefMeta = pref ? PLATFORM_META[pref.platform] : null;

  return (
    <div className={s.nowPlaying}>
      <div className={s.nowPlayingLabel}><div className={s.pulse} /> Now Playing</div>

      <div className={s.nowPlayingMeta}>
        {nowPlaying.thumbnail_url
          ? <img className={s.thumb} src={nowPlaying.thumbnail_url} alt="" />
          : <div className={s.thumb} />}
        <div className={s.nowPlayingText}>
          <div className={s.nowPlayingTitle}>{nowPlaying.title}</div>
          <div className={s.nowPlayingArtist}>{nowPlaying.artist}</div>
          <div className={s.nowPlayingAdded}>Added by {nowPlaying.profiles?.display_name || 'someone'}</div>
        </div>
      </div>

      {pref && (
        <a
          className={s.preferredBtn}
          href={pref.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ '--platform-color': prefMeta?.color }}
        >
          {prefMeta?.iconSvgUrl && (
            <img
              src={prefMeta.iconSvgUrl.replace(/\/[0-9A-Fa-f]{6}$/, '/ffffff')}
              alt=""
              width={16}
              height={16}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          Open on {prefMeta?.name || pref.platform} ↗
        </a>
      )}

      <div className={s.platformSection}>
        <div className={s.platformSectionLabel}>Listen on all platforms</div>
        <PlatformLinks
          platformLinks={nowPlaying.platform_links}
          query={query}
          activePlatform={pref?.platform}
        />
      </div>

      {FLAGS.AUTO_PLAY_QUEUE && ytId && isDJ && (
        <>
          {ytResolvedTitle && (
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              ▶ Playing via YouTube: {ytResolvedTitle}
            </div>
          )}
          <YouTubeAutoPlayer ref={ytPlayerRef} videoId={ytId} onEnded={handleEnded} repeat={repeatMode === 'song'} />
        </>
      )}

      {FLAGS.YOUTUBE_EMBED && !FLAGS.AUTO_PLAY_QUEUE && ytId && (
        <iframe
          className={s.ytEmbed}
          src={`https://www.youtube-nocookie.com/embed/${ytId}`}
          allowFullScreen
          title="YouTube preview"
        />
      )}

      <div className={s.djControls}>
        {isDJ && (
          <button className="btn" onClick={() => playNext(sessionId).then(n => { onQueueChange?.(); if (!n) toast('Queue is empty!'); })}>
            Next ▶
          </button>
        )}
        {isDJ && (
          <button
            className={`${s.repeatBtn} ${repeatMode !== 'none' ? s.repeatBtnActive : ''}`}
            onClick={() => {
              const next = { none: 'song', song: 'queue', queue: 'none' }[repeatMode];
              onRepeatModeChange?.(next);
              setRepeatMode(sessionId, next).catch(e => { onRepeatModeChange?.(repeatMode); toast(e.message); });
            }}
          >
            {repeatMode === 'queue' ? '🔁 Queue ✓' : repeatMode === 'song' ? '🔂 Song ✓' : '🔁 Repeat'}
          </button>
        )}
        {FLAGS.VOTE_TO_SKIP && (
          <button
            className={`${s.skipBtn} ${hasVoted ? s.skipBtnVoted : ''}`}
            onClick={handleSkipVote}
          >
            👎 Skip ({skipVotes}/{skipThreshold}){hasVoted ? ' ✓' : ''}
          </button>
        )}
      </div>
    </div>
  );

  async function handleSkipVote() {
    try {
      if (hasVoted) {
        await removeSkipVote(nowPlaying.id, userId);
      } else {
        capture('skip_vote_cast', {
          votes_so_far: skipVotes + 1,
          threshold:    skipThreshold,
        });
        const skipped = await castSkipVote(nowPlaying.id, skipThreshold);
        if (skipped) onQueueChange?.();
      }
    } catch (e) {
      toast(e.message);
    }
  }
}
