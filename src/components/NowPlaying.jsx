import { useState, useEffect, useRef } from 'react';
import s from '../styles/jam.module.css';
import { preferredLink, extractYouTubeId, isYouTubeSearchUrl, extractSearchQuery, PLATFORM_META } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { resolveToYouTubeId } from '../lib/youtube';
import { useSkipVotes } from '../hooks/useSkipVotes';
import { castSkipVote, removeSkipVote, playNext } from '../lib/queue';
import { useToast } from './Toast';
import PlatformLinks from './PlatformLinks';
import YouTubeAutoPlayer from './YouTubeAutoPlayer';

export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId, onQueueChange }) {
  const toast = useToast();
  const { count: skipVotes, hasVoted } = useSkipVotes(nowPlaying?.id, userId);
  const skipThreshold = Math.floor(participantCount / 2) + 1;

  const [ytId, setYtId] = useState(null);
  const [ytResolvedTitle, setYtResolvedTitle] = useState(null);
  const resolveKey = useRef(null);

  useEffect(() => {
    if (!FLAGS.AUTO_PLAY_QUEUE || !nowPlaying) { setYtId(null); setYtResolvedTitle(null); return; }

    const key = nowPlaying.id;
    resolveKey.current = key;
    setYtId(null);
    setYtResolvedTitle(null);

    // 1. Direct YouTube link
    const ytUrl = nowPlaying.platform_links?.youtube || nowPlaying.platform_links?.youtubemusic;
    const directId = extractYouTubeId(ytUrl);
    if (directId) { setYtId(directId); return; }

    // 2. YouTube search URL → resolve via SearXNG
    if (ytUrl && isYouTubeSearchUrl(ytUrl)) {
      const q = extractSearchQuery(ytSearchUrl);
      if (q) {
        resolveToYouTubeId(q).then(({ id, title }) => {
          if (resolveKey.current !== key) return;
          if (id) { setYtId(id); setYtResolvedTitle(title); }
        });
        return;
      }
    }

    // 3. Fallback: title + artist search
    resolveToYouTubeId(`${nowPlaying.title} ${nowPlaying.artist}`).then(({ id, title }) => {
      if (resolveKey.current !== key) return;
      if (id) { setYtId(id); setYtResolvedTitle(title); }
    });
  }, [nowPlaying?.id]);

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
        <div>
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
            <img src={prefMeta.iconSvgUrl} alt="" width={16} height={16} style={{ filter: 'brightness(0) invert(1)' }} />
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

      {FLAGS.AUTO_PLAY_QUEUE && ytId && (
        <>
          {ytResolvedTitle && (
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              ▶ Playing via YouTube: {ytResolvedTitle}
            </div>
          )}
          <YouTubeAutoPlayer key={ytId} videoId={ytId} onEnded={handleEnded} />
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
        const skipped = await castSkipVote(nowPlaying.id, userId, skipThreshold);
        if (skipped) onQueueChange?.();
      }
    } catch (e) {
      toast(e.message);
    }
  }
}
