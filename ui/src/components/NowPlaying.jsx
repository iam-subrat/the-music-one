import { useState, useEffect, useRef } from "react";
import s from "../styles/jam.module.css";
import {
  preferredLink,
  extractYouTubeId,
  isYouTubeSearchUrl,
  extractSearchQuery,
  PLATFORM_META,
} from "../lib/platform";
import { FLAGS } from "../lib/flags";
import { api } from "../lib/api";
import { useSkipVotes } from "../hooks/useSkipVotes";
import {
  castSkipVote,
  removeSkipVote,
  playNext,
  playPrevious,
  playSpecificSong,
  patchYouTubeLink,
} from "../lib/queue";
import { setRepeatMode } from "../lib/session";
import { useToast } from "./Toast";
import PlatformLinks from "./PlatformLinks";
import YouTubeAutoPlayer from "./YouTubeAutoPlayer";
import { useAnalytics } from "../lib/analytics";
import { useMediaSession } from "../hooks/useMediaSession";

export default function NowPlaying({
  nowPlaying,
  sessionId,
  isDJ,
  preferredPlatform,
  participantCount,
  userId,
  onQueueChange,
  repeatMode,
  onRepeatModeChange,
  queueItems,
}) {
  const toast = useToast();
  const { count: skipVotes, hasVoted } = useSkipVotes(
    nowPlaying?.id,
    userId,
    sessionId,
  );
  const skipThreshold = Math.floor(participantCount / 2) + 1;
  const { capture } = useAnalytics();
  const prevNowPlayingIdRef = useRef(null);
  const ytFeatureFiredRef = useRef(false);

  const [ytId, setYtId] = useState(null);
  const [ytResolvedTitle, setYtResolvedTitle] = useState(null);
  const resolveKey = useRef(null);
  const ytPlayerRef = useRef(null);

  useMediaSession({
    enabled: !!(FLAGS.AUTO_PLAY_QUEUE && isDJ && ytId && nowPlaying),
    playerRef: ytPlayerRef,
    metadata: nowPlaying
      ? {
          title: nowPlaying.title,
          artist: nowPlaying.artist,
          artwork: nowPlaying.thumbnail_url,
        }
      : null,
    onNext: () => {
      handleEnded();
    },
    onPrev: () => ytPlayerRef.current?.seek?.(0),
  });

  useEffect(() => {
    if (!FLAGS.AUTO_PLAY_QUEUE || !nowPlaying || !isDJ) {
      setYtId(null);
      setYtResolvedTitle(null);
      return;
    }

    const key = nowPlaying.id;
    resolveKey.current = key;
    setYtResolvedTitle(null);
    // Don't null ytId here — keeping the player mounted preserves the iOS media
    // element "activation" so subsequent songs autoplay after the first user tap.

    // 1. Direct YouTube link
    const ytUrl =
      nowPlaying.platform_links?.youtube ||
      nowPlaying.platform_links?.youtubemusic;
    const directId = extractYouTubeId(ytUrl);
    if (directId) {
      setYtId(directId);
      return;
    }

    // 2. YouTube search URL → resolve via SearXNG
    if (ytUrl && isYouTubeSearchUrl(ytUrl)) {
      const q = extractSearchQuery(ytUrl);
      if (q) {
        api(`/youtube/?q=${encodeURIComponent(q)}`)
          .then((res) => (res.ok ? res.json() : { id: null, title: null }))
          .then(({ id, title }) => {
            if (resolveKey.current !== key) return;
            if (id) {
              setYtId(id);
              setYtResolvedTitle(title);
            }
          });
        return;
      }
    }

    // 3. Fallback: title + artist search — persist result so all clients benefit
    api(
      `/youtube/?q=${encodeURIComponent(`${nowPlaying.title} ${nowPlaying.artist}`)}`,
    )
      .then((res) => (res.ok ? res.json() : { id: null, title: null }))
      .then(({ id, title }) => {
        if (resolveKey.current !== key) return;
        if (id) {
          setYtId(id);
          setYtResolvedTitle(title);
          patchYouTubeLink(
            nowPlaying.id,
            `https://www.youtube.com/watch?v=${id}`,
          );
        }
      });
  }, [nowPlaying?.id, isDJ]);

  useEffect(() => {
    if (!nowPlaying || nowPlaying.id === prevNowPlayingIdRef.current) return;
    prevNowPlayingIdRef.current = nowPlaying.id;
    capture("song_played", {
      platform: nowPlaying.platform_links
        ? Object.keys(nowPlaying.platform_links)[0]
        : "unknown",
      source: isDJ ? "manual" : "auto",
    });
  }, [nowPlaying?.id]);

  useEffect(() => {
    if (!ytId || ytFeatureFiredRef.current) return;
    if (FLAGS.YOUTUBE_EMBED || FLAGS.AUTO_PLAY_QUEUE) {
      capture("feature_used", {
        feature: FLAGS.AUTO_PLAY_QUEUE ? "auto_play_queue" : "youtube_embed",
      });
      ytFeatureFiredRef.current = true;
    }
  }, [ytId]);

  const handleNext = async () => {
    if (!isDJ) return;
    if (repeatMode === "song") {
      ytPlayerRef.current?.seek(0);
      ytPlayerRef.current?.play();
      return;
    }
    const playing = queueItems?.find((i) => i.status === "playing");
    const eligible = (queueItems || []).filter(
      (i) => i.status !== "skipped" && i.status !== "playing",
    );
    const after = playing
      ? eligible
          .filter((i) => i.position > playing.position)
          .sort((a, b) => a.position - b.position)
      : eligible;
    const before = playing
      ? eligible
          .filter((i) => i.position < playing.position)
          .sort((a, b) => a.position - b.position)
      : [];
    const nextItem =
      (repeatMode === "queue" ? [...after, ...before] : after)[0] || null;

    try {
      const n = await playNext(sessionId);
      onQueueChange?.();
      if (!n?.next_item_id) {
        if (nextItem) {
          await playSpecificSong(sessionId, nextItem.id);
          onQueueChange?.();
        } else {
          toast("Queue is empty!");
        }
      }
    } catch (e) {
      if (nextItem) {
        try {
          await playSpecificSong(sessionId, nextItem.id);
          onQueueChange?.();
        } catch (err) {
          toast(err.message);
        }
      } else {
        toast(e.message);
      }
    }
  };

  const handlePrevious = async () => {
    if (!isDJ) return;
    const currentTime = ytPlayerRef.current?.getTime?.() ?? 0;
    if (repeatMode === "song" || currentTime > 3) {
      ytPlayerRef.current?.seek(0);
      ytPlayerRef.current?.play();
      return;
    }

    const playing = queueItems?.find((i) => i.status === "playing");
    const eligible = (queueItems || []).filter(
      (i) => i.status !== "skipped" && i.status !== "playing",
    );
    const before = playing
      ? eligible
          .filter((i) => i.position < playing.position)
          .sort((a, b) => b.position - a.position)
      : eligible;
    const after = playing
      ? eligible
          .filter((i) => i.position > playing.position)
          .sort((a, b) => b.position - a.position)
      : [];
    const prevItem =
      (repeatMode === "queue" ? [...before, ...after] : before)[0] || null;

    try {
      const n = await playPrevious(sessionId);
      onQueueChange?.();
      if (!n?.next_item_id) {
        if (prevItem) {
          await playSpecificSong(sessionId, prevItem.id);
          onQueueChange?.();
        } else {
          ytPlayerRef.current?.seek(0);
          ytPlayerRef.current?.play();
          toast("No previous song!");
        }
      }
    } catch (e) {
      if (prevItem) {
        try {
          await playSpecificSong(sessionId, prevItem.id);
          onQueueChange?.();
        } catch (err) {
          toast(err.message);
        }
      } else {
        ytPlayerRef.current?.seek(0);
        toast(e.message);
      }
    }
  };

  async function handleEnded() {
    if (!isDJ) return;
    if (repeatMode === "song") {
      ytPlayerRef.current?.seek(0);
      ytPlayerRef.current?.play();
      return;
    }
    const playing = queueItems?.find((i) => i.status === "playing");
    const eligible = (queueItems || []).filter(
      (i) => i.status !== "skipped" && i.status !== "playing",
    );
    const after = playing
      ? eligible
          .filter((i) => i.position > playing.position)
          .sort((a, b) => a.position - b.position)
      : eligible;
    const before = playing
      ? eligible
          .filter((i) => i.position < playing.position)
          .sort((a, b) => a.position - b.position)
      : [];
    const nextItem =
      (repeatMode === "queue" ? [...after, ...before] : after)[0] || null;

    try {
      const next = await playNext(sessionId);
      onQueueChange?.();
      if (!next?.next_item_id) {
        if (nextItem) {
          await playSpecificSong(sessionId, nextItem.id);
          onQueueChange?.();
        } else {
          toast("Queue is empty!");
        }
      }
    } catch (e) {
      if (nextItem) {
        try {
          await playSpecificSong(sessionId, nextItem.id);
          onQueueChange?.();
        } catch {}
      } else {
        toast(e.message);
      }
    }
  }

  if (!nowPlaying) {
    return (
      <div className={`${s.nowPlaying} ${s.nowPlayingIdle}`}>
        {FLAGS.AUTO_PLAY_QUEUE && ytId && isDJ && (
          <div style={{ display: "none" }}>
            <YouTubeAutoPlayer
              ref={ytPlayerRef}
              videoId={ytId}
              onEnded={handleEnded}
              repeat={repeatMode === "song"}
            />
          </div>
        )}
        <div className={s.nowPlayingLabel}>Now Playing</div>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          {isDJ
            ? 'Click "Play Next" to start the queue.'
            : "Waiting for the DJ to start…"}
        </p>
        {isDJ && (
          <div
            style={{ display: "flex", gap: "8px", justifyContent: "center" }}
          >
            <button className="btn" onClick={handlePrevious}>
              ⏮ Prev
            </button>
            <button className="btn" onClick={handleNext}>
              Play Next ▶
            </button>
          </div>
        )}
      </div>
    );
  }

  const pref = preferredLink(nowPlaying.platform_links, preferredPlatform);
  const query = `${nowPlaying.title} ${nowPlaying.artist}`;
  const prefMeta = pref ? PLATFORM_META[pref.platform] : null;

  return (
    <div className={s.nowPlaying}>
      <div className={s.nowPlayingLabel}>
        <div className={s.pulse} /> Now Playing
      </div>

      <div className={s.nowPlayingMeta}>
        {nowPlaying.thumbnail_url ? (
          <img className={s.thumb} src={nowPlaying.thumbnail_url} alt="" />
        ) : (
          <div className={s.thumb} />
        )}
        <div className={s.nowPlayingText}>
          <div className={s.nowPlayingTitle}>{nowPlaying.title}</div>
          <div className={s.nowPlayingArtist}>{nowPlaying.artist}</div>
          <div className={s.nowPlayingAdded}>
            Added by {nowPlaying.profiles?.display_name || "someone"}
          </div>
        </div>
      </div>

      {pref && (
        <a
          className={s.preferredBtn}
          href={pref.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ "--platform-color": prefMeta?.color }}
        >
          {prefMeta?.iconSvgUrl && (
            <img
              src={prefMeta.iconSvgUrl.replace(/\/[0-9A-Fa-f]{6}$/, "/ffffff")}
              alt=""
              width={16}
              height={16}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
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
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              ▶ Playing via YouTube: {ytResolvedTitle}
            </div>
          )}
          <YouTubeAutoPlayer
            ref={ytPlayerRef}
            videoId={ytId}
            onEnded={handleEnded}
            repeat={repeatMode === "song"}
          />
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
          <button className="btn" onClick={handlePrevious}>
            ⏮ Prev
          </button>
        )}
        {isDJ && (
          <button className="btn" onClick={handleNext}>
            Next ▶
          </button>
        )}
        {isDJ && (
          <button
            className={`${s.repeatBtn} ${repeatMode !== "none" ? s.repeatBtnActive : ""}`}
            onClick={() => {
              const next = { none: "song", song: "queue", queue: "none" }[
                repeatMode
              ];
              onRepeatModeChange?.(next);
              setRepeatMode(sessionId, next).catch((e) => {
                onRepeatModeChange?.(repeatMode);
                toast(e.message);
              });
            }}
          >
            {repeatMode === "queue"
              ? "🔁 Queue ✓"
              : repeatMode === "song"
                ? "🔂 Song ✓"
                : "🔁 Repeat"}
          </button>
        )}
        {FLAGS.VOTE_TO_SKIP && (
          <button
            className={`${s.skipBtn} ${hasVoted ? s.skipBtnVoted : ""}`}
            onClick={handleSkipVote}
          >
            👎 Skip ({skipVotes}/{skipThreshold}){hasVoted ? " ✓" : ""}
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
        capture("skip_vote_cast", {
          votes_so_far: skipVotes + 1,
          threshold: skipThreshold,
        });
        const skipped = await castSkipVote(nowPlaying.id, skipThreshold);
        if (skipped) onQueueChange?.();
      }
    } catch (e) {
      toast(e.message);
    }
  }
}
