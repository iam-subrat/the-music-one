import s from '../styles/jam.module.css';
import { preferredLink, extractYouTubeId, PLATFORM_META } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { useSkipVotes } from '../hooks/useSkipVotes';
import { castSkipVote, forceSkip, playNext } from '../lib/queue';
import { useToast } from './Toast';

export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId }) {
  const toast = useToast();
  const skipVotes = useSkipVotes(nowPlaying?.id);
  const skipThreshold = Math.floor(participantCount / 2) + 1;

  if (!nowPlaying) {
    return (
      <div className={`${s.nowPlaying} ${s.nowPlayingIdle}`}>
        <div className={s.nowPlayingLabel}>Now Playing</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {isDJ ? 'Click "Play Next" to start the queue.' : 'Waiting for the DJ to start…'}
        </p>
        {isDJ && (
          <button className="btn" onClick={() => playNext(sessionId).then(n => !n && toast('Queue is empty!'))}>
            Play Next ▶
          </button>
        )}
      </div>
    );
  }

  const pref = preferredLink(nowPlaying.platform_links, preferredPlatform);
  const ytId = FLAGS.YOUTUBE_EMBED ? extractYouTubeId(nowPlaying.platform_links?.youtube || nowPlaying.platform_links?.youtubemusic) : null;
  const otherLinks = Object.entries(nowPlaying.platform_links)
    .filter(([k, v]) => v && k !== pref?.platform);

  async function handleSkipVote() {
    const count = await castSkipVote(nowPlaying.id, userId);
    if (count >= skipThreshold) await forceSkip(sessionId);
  }

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
        <a className={s.preferredBtn} href={pref.url} target="_blank" rel="noopener">
          Open on {PLATFORM_META[pref.platform]?.name || pref.platform} ↗
        </a>
      )}

      {otherLinks.length > 0 && (
        <div className={s.otherLinks}>
          {otherLinks.map(([k, v]) => (
            <a key={k} className={s.otherLink} href={v} target="_blank" rel="noopener">
              {PLATFORM_META[k]?.name || k}
            </a>
          ))}
        </div>
      )}

      {ytId && (
        <iframe
          className={s.ytEmbed}
          src={`https://www.youtube-nocookie.com/embed/${ytId}`}
          allowFullScreen
          title="YouTube preview"
        />
      )}

      <div className={s.djControls}>
        {isDJ ? (
          <>
            <button className="btn" onClick={() => playNext(sessionId).then(n => !n && toast('Queue is empty!'))}>
              Next ▶
            </button>
            {FLAGS.VOTE_TO_SKIP && (
              <button className="btn btn-danger" onClick={() => forceSkip(sessionId)}>
                Force Skip
              </button>
            )}
          </>
        ) : FLAGS.VOTE_TO_SKIP ? (
          <button className={s.skipBtn} onClick={handleSkipVote}>
            👎 Skip ({skipVotes}/{skipThreshold})
          </button>
        ) : null}
      </div>
    </div>
  );
}
