import { useEffect, useRef, useState } from "react";
import s from "../styles/jam.module.css";
import { FLAGS } from "../lib/flags";
import { useSkipVotes } from "../hooks/useSkipVotes";
import {
  castSkipVote,
  removeSkipVote,
  playNext,
  playPrevious,
  playSpecificSong,
} from "../lib/queue";
import { setRepeatMode, setAutoPilot } from "../lib/session";
import { useToast } from "./Toast";
import PlayerLinks from "./PlayerLinks";
import { useAnalytics } from "../lib/analytics";
import { useResolvedYouTubeVideo } from "../playback/useResolvedYouTubeVideo";
import { useJamPlayback } from "../playback/JamPlaybackContext";
import PlayerSurface from "./PlayerSurface";
import DeleteVoteButton from "./DeleteVoteButton";
import { readySong } from "../playback/queuePresentation";

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
  autoPilot,
  onAutoPilotChange,
  queueItems,
  playbackReady = true,
  modeVersion = 0,
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
  const { registerPlayback, requestStart, play, pause, seek, replay, getTime, getDuration, getState } = useJamPlayback();
  const [transport, setTransport] = useState({ current: 0, duration: 0, state: -1 });
  const [isSeeking, setIsSeeking] = useState(false);
  const [isRepeatUpdating, setIsRepeatUpdating] = useState(false);
  const [isAutoPilotUpdating, setIsAutoPilotUpdating] = useState(false);
  const [repeatOverride, setRepeatOverride] = useState(null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteOverride, setVoteOverride] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const item = nowPlaying ?? readySong(queueItems, repeatMode);
  const displayRepeatMode = repeatOverride ?? repeatMode;
  const displayHasVoted = voteOverride?.hasVoted ?? hasVoted;
  const displaySkipVotes = voteOverride?.count ?? skipVotes;

  useEffect(() => {
    if (repeatOverride === repeatMode) setRepeatOverride(null);
  }, [repeatMode, repeatOverride]);

  useEffect(() => {
    if (voteOverride?.hasVoted === hasVoted) setVoteOverride(null);
  }, [hasVoted, voteOverride]);
  const pendingTransportStateRef = useRef(null);

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
    if (nowPlaying && repeatMode === "song") {
      seek(0);
      play();
      return;
    }
    const playing = nowPlaying ?? item;
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

    if (!nowPlaying) {
      if (!nextItem) { toast("No next song!"); return; }
      try { await playSpecificSong(sessionId, nextItem.id, modeVersion); onQueueChange?.(); }
      catch (error) { toast(error.message); }
      return;
    }

    try {
      const n = await playNext(sessionId, modeVersion);
      onQueueChange?.();
      if (!n?.next_item_id) {
        if (nextItem) {
          await playSpecificSong(sessionId, nextItem.id, modeVersion);
          onQueueChange?.();
        } else {
          toast("Queue is empty!");
        }
      }
    } catch (e) {
      if (nextItem) {
        try {
          await playSpecificSong(sessionId, nextItem.id, modeVersion);
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

    const playing = nowPlaying ?? item;
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

    if (!nowPlaying) {
      if (!prevItem) { toast("No previous song!"); return; }
      try { await playSpecificSong(sessionId, prevItem.id, modeVersion); onQueueChange?.(); }
      catch (error) { toast(error.message); }
      return;
    }

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
      const next = await playNext(sessionId, modeVersion);
      if (next?.next_item_id === nowPlaying?.id) {
        replay();
        onQueueChange?.();
        return;
      }
      onQueueChange?.();
      if (!next?.next_item_id) {
        if (nextItem) {
          await playSpecificSong(sessionId, nextItem.id, modeVersion);
          onQueueChange?.();
        } else {
          toast("Queue is empty!");
        }
      }
    } catch (e) {
      if (nextItem) {
        try {
          await playSpecificSong(sessionId, nextItem.id, modeVersion);
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
      modeVersion,
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
      onPlay: () => applyPlaybackState(1),
      onPause: () => applyPlaybackState(2),
    });
  }, [sessionId, nowPlaying?.id, ytId, isDJ, repeatMode, registerPlayback, queueItems, onQueueChange, playbackReady, modeVersion]);

  useEffect(() => {
    if (!nowPlaying) return undefined;
    const syncTransport = () => {
      if (isSeeking) return;
      const playerState = getState();
      const pendingState = pendingTransportStateRef.current;
      if (pendingState != null && playerState === pendingState) {
        pendingTransportStateRef.current = null;
      }
      setTransport({
        current: getTime(),
        duration: getDuration(),
        state: pendingState != null && playerState !== pendingState
          ? pendingState
          : playerState,
      });
    };
    syncTransport();
    const interval = window.setInterval(syncTransport, 500);
    return () => window.clearInterval(interval);
  }, [nowPlaying?.id, getTime, getDuration, getState, isSeeking]);

  const duration = nowPlaying ? Math.max(0, transport.duration || getDuration()) : 0;
  const current = Math.min(Math.max(0, transport.current), duration || 0);
  // Player commands update asynchronously. Once transport has observed a state,
  // keep the control in sync with the optimistic tap state instead of briefly
  // reverting to the player's previous state.
  const playerState = transport.state === -1 ? getState() : transport.state;
  const isPlaying = !!nowPlaying && playerState === 1;

  function handleSeek(next) {
    setTransport((value) => ({ ...value, current: next }));
    seek(next);
  }

  async function handleTogglePlayback() {
    if (!isDJ) return;
    if (!nowPlaying) {
      if (!item || isStarting || !playbackReady) return;
      setIsStarting(true);
      const cancelStart = requestStart(sessionId, item.id, modeVersion);
      try {
        await playSpecificSong(sessionId, item.id, modeVersion);
        onQueueChange?.();
      } catch (error) { cancelStart(); toast(error.message); }
      finally { setIsStarting(false); }
      return;
    }
    applyPlaybackState(isPlaying ? 2 : 1);
  }

  function applyPlaybackState(nextState) {
    pendingTransportStateRef.current = nextState;
    if (nextState === 2) pause();
    else play();
    setTransport((value) => ({ ...value, state: nextState }));
  }

  return (
    <PlayerSurface item={item} playing={isPlaying} current={current} duration={duration}
      status={isStarting ? 'Loading' : !item ? 'Empty queue' : !nowPlaying ? 'Ready' : !isDJ ? 'DJ playing' : isPlaying ? 'Playing' : 'Paused'}
      canControl={isDJ} started={!!nowPlaying} busy={isStarting || !playbackReady}
      onPlay={handleTogglePlayback} onPause={handleTogglePlayback} onPrevious={handlePrevious} onNext={handleNext}
      onSeek={handleSeek} onSeekStart={() => setIsSeeking(true)} onSeekEnd={() => setIsSeeking(false)}
      repeat={displayRepeatMode} repeatBusy={isRepeatUpdating} scope={isDJ ? 'DJ controls' : 'Controlled by DJ'}
      onRepeat={async (next) => {
              setRepeatOverride(next);
              setIsRepeatUpdating(true);
              onRepeatModeChange?.(next);
              try {
                await setRepeatMode(sessionId, next);
              } catch (e) {
                setRepeatOverride(null);
                onRepeatModeChange?.(repeatMode);
                toast(e.message);
              } finally {
                setIsRepeatUpdating(false);
              }
            }}
      actions={<>
        {isDJ && (
          <button
            className={s.autoPilotToggle}
            type="button" role="switch" aria-label="Auto-Pilot" aria-checked={!!autoPilot}
            title="Auto-Pilot"
            disabled={isAutoPilotUpdating}
            onClick={async () => {
              const next = !autoPilot;
              setIsAutoPilotUpdating(true);
              onAutoPilotChange?.(next);
              try { await setAutoPilot(sessionId, next); } catch (e) {
                onAutoPilotChange?.(autoPilot);
                toast(e.message);
              } finally { setIsAutoPilotUpdating(false); }
            }}
          >
            <span className={s.toggleTrack} aria-hidden="true"><span /></span>
            Auto-Pilot
          </button>
        )}
        {FLAGS.VOTE_TO_SKIP && nowPlaying && (
          <DeleteVoteButton
            className={`${s.skipBtn} ${displayHasVoted ? s.skipBtnVoted : ""}`}
            title={nowPlaying.title} count={displaySkipVotes} threshold={skipThreshold} hasVoted={displayHasVoted}
            disabled={isVoting}
            onClick={handleSkipVote}
          />
        )}
      </>}>

      <PlayerLinks item={item} preferredPlatform={preferredPlatform}>

        {FLAGS.AUTO_PLAY_QUEUE && ytId && isDJ && ytResolvedTitle && (
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Playing via YouTube: {ytResolvedTitle}
          </div>
        )}

        {FLAGS.YOUTUBE_EMBED && !FLAGS.AUTO_PLAY_QUEUE && ytId && (
          <iframe
            className={s.ytEmbed}
            src={`https://www.youtube-nocookie.com/embed/${ytId}`}
            allowFullScreen
            title="YouTube preview"
          />
        )}
      </PlayerLinks>
    </PlayerSurface>
  );

  async function handleSkipVote() {
    const nextHasVoted = !displayHasVoted;
    setVoteOverride({
      hasVoted: nextHasVoted,
      count: Math.max(0, skipVotes + (nextHasVoted ? 1 : -1)),
    });
    setIsVoting(true);
    try {
      if (displayHasVoted) {
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
      setVoteOverride(null);
      toast(e.message);
    } finally {
      setIsVoting(false);
    }
  }
}
