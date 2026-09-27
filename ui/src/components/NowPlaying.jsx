import { useEffect, useRef, useState } from "react";
import s from "../styles/jam.module.css";
import {
  preferredLink,
  PLATFORM_META,
} from "../lib/platform";
import { FLAGS } from "../lib/flags";
import { useSkipVotes } from "../hooks/useSkipVotes";
import {
  castSkipVote,
  removeSkipVote,
  playNext,
  playPrevious,
  playSpecificSong,
} from "../lib/queue";
import { setRepeatMode } from "../lib/session";
import { useToast } from "./Toast";
import PlatformLinks from "./PlatformLinks";
import { useAnalytics } from "../lib/analytics";
import { useResolvedYouTubeVideo } from "../playback/useResolvedYouTubeVideo";
import { useJamPlayback } from "../playback/JamPlaybackContext";

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
  playbackReady = true,
}) {
  const toast = useToast();
  const {
    count: skipVotes,
    hasVoted,
    refresh: refreshSkipVotes,
  } = useSkipVotes(nowPlaying?.id, userId, sessionId);
  const skipThreshold = Math.floor(participantCount / 2) + 1;
  const { capture } = useAnalytics();
  const prevNowPlayingIdRef = useRef(null);
  const ytFeatureFiredRef = useRef(false);

  const { videoId: ytId, resolvedTitle: ytResolvedTitle } = useResolvedYouTubeVideo(nowPlaying, isDJ);
  const { registerPlayback, play, pause, seek, getTime, getDuration, getState } = useJamPlayback();
  const [transport, setTransport] = useState({ current: 0, duration: 0, state: -1 });
  const [isSeeking, setIsSeeking] = useState(false);

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
      seek(0);
      play();
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
    const currentTime = getTime();
    if (repeatMode === "song" || currentTime > 3) {
      seek(0);
      play();
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
          seek(0);
          play();
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
        seek(0);
        toast(e.message);
      }
    }
  };

  async function handleEnded() {
    if (!isDJ) return;
    if (repeatMode === "song") {
      seek(0);
      play();
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

  useEffect(() => {
    registerPlayback({
      owner: "gui",
      ready: playbackReady,
      isDJ,
      sessionId,
      queueItemId: nowPlaying?.id ?? null,
      videoId: ytId,
      enabled: !!(FLAGS.AUTO_PLAY_QUEUE && isDJ && nowPlaying && ytId),
      repeat: repeatMode === "song",
      metadata: nowPlaying && {
        title: nowPlaying.title,
        artist: nowPlaying.artist,
        artwork: nowPlaying.thumbnail_url,
      },
      onEnded: handleEnded,
    });
  }, [sessionId, nowPlaying?.id, ytId, isDJ, repeatMode, registerPlayback, queueItems, onQueueChange, playbackReady]);

  useEffect(() => {
    if (!nowPlaying) return undefined;
    const syncTransport = () => {
      if (isSeeking) return;
      setTransport({
        current: getTime(),
        duration: getDuration(),
        state: getState(),
      });
    };
    syncTransport();
    const interval = window.setInterval(syncTransport, 500);
    return () => window.clearInterval(interval);
  }, [nowPlaying?.id, getTime, getDuration, getState, isSeeking]);

  if (!nowPlaying) {
    return (
      <div className={`${s.nowPlaying} ${s.nowPlayingIdle}`}>
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
  const duration = Math.max(0, transport.duration || getDuration());
  const current = Math.min(Math.max(0, transport.current), duration || 0);
  const isPlaying = transport.state === 1 || getState() === 1;
  const formatTime = (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  };

  function handleSeek(event) {
    const next = Number(event.target.value);
    setTransport((value) => ({ ...value, current: next }));
    seek(next);
  }

  function handleTogglePlayback() {
    if (!isDJ) return;
    if (isPlaying) pause();
    else play();
    setTransport((value) => ({ ...value, state: isPlaying ? 2 : 1 }));
  }

  return (
    <div className={s.nowPlaying}>
      <div className={s.nowPlayingLabel}>
        <div className={s.pulseDot} /> Now Playing
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

      <div className={s.transport} aria-label="Playback controls">
        <div className={s.timeRow}>
          <span>{formatTime(current)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <input
          className={s.seekbar}
          aria-label="Playback position"
          type="range"
          min="0"
          max={duration}
          value={current}
          disabled={!isDJ || duration <= 0}
          onPointerDown={() => setIsSeeking(true)}
          onPointerUp={() => setIsSeeking(false)}
          onBlur={() => setIsSeeking(false)}
          onChange={handleSeek}
        />
        {isDJ && (
          <div className={s.transportButtons}>
            <button className={s.iconButton} type="button" aria-label="Previous track" onClick={handlePrevious}>
              ⏮
            </button>
            <button className={`${s.playButton} ${isPlaying ? s.playButtonActive : ""}`} type="button" aria-label={isPlaying ? "Pause playback" : "Play playback"} onClick={handleTogglePlayback}>
              {isPlaying ? "Ⅱ" : "▶"}
            </button>
            <button className={s.iconButton} type="button" aria-label="Next track" onClick={handleNext}>
              ⏭
            </button>
          </div>
        )}
      </div>

      <details className={s.listenDetails}>
        <summary>Listen on other platforms</summary>
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
      </details>

      <div className={s.djControls}>
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
        refreshSkipVotes?.();
      } else {
        capture("skip_vote_cast", {
          votes_so_far: skipVotes + 1,
          threshold: skipThreshold,
        });
        const skipped = await castSkipVote(nowPlaying.id, skipThreshold);
        if (skipped) onQueueChange?.();
        else refreshSkipVotes?.();
      }
    } catch (e) {
      toast(e.message);
    }
  }
}
