import { useState, useEffect, useRef } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import MarqueeText from "./MarqueeText";
import {
  playNext,
  playPrevious,
  playSpecificSong,
  castSkipVote,
  removeSkipVote,
} from "../lib/queue";
import { useSkipVotes } from "../hooks/useSkipVotes";
import { isAuthError, promptSignIn } from "../lib/authPrompt";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Repeat,
  Repeat1,
  ThumbsDown,
} from "lucide-react";

// Module-level debounce guard: prevents double-fire from rapid song-end events
let lastAutoAdvanceTime = 0;

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * PlayerControls
 *
 * Props:
 *  - session          Session object from useSession (contains id, repeat_mode, etc.)
 *  - playingItem      Current playing queue item or null
 *  - isHost           Whether the current user is the session host
 *  - isDJ             Whether the current user has DJ controls (host or DJ role)
 *  - queueItems       Full queue array (used for position context)
 *  - refresh          Callback to reload the queue from the server
 *  - userId           Current user's id (for skip votes)
 *  - participantCount Number of participants (for skip threshold)
 *  - repeatMode       "none" | "song" | "queue" — sourced from session.repeat_mode via parent
 *  - onRepeatModeChange(next) — called when the user toggles repeat; parent persists to server
 */
export default function PlayerControls({
  session,
  playingItem,
  isHost,
  isDJ,
  queueItems,
  refresh,
  userId,
  participantCount,
  repeatMode = "none",
  onRepeatModeChange,
}) {
  const skipThreshold = participantCount
    ? Math.floor(participantCount / 2) + 1
    : 1;

  const { isPlaying, progress, duration, togglePlay, seek, audioElement } =
    useAudioPlayer(playingItem);

  const { count: skipVotes, hasVoted } = useSkipVotes(
    playingItem?.id,
    userId,
    session?.id,
  );

  // ── Auto-advance on natural song end ─────────────────────────────────────
  useEffect(() => {
    const handleEnd = () => {
      // Only the DJ/host advances the queue automatically
      if (!isDJ || !session) return;

      // Debounce: ignore duplicate events within 2.5 s
      const now = Date.now();
      if (now - lastAutoAdvanceTime < 2500) return;
      lastAutoAdvanceTime = now;

      if (repeatMode === "song") {
        // Bug 2 fix: replay the same song via the bridge iframe
        audioElement.currentTime = 0;
        audioElement.play().catch(console.error);
      } else {
        // "queue" and "none": the server handles wrap-around (repeat queue)
        // or stops at the end (repeat none). No client-side first-item hack.
        playNext(session.id)
          .then(() => refresh?.())
          .catch((e) => {
            console.error("Auto-advance failed:", e);
            if (isAuthError(e)) {
              promptSignIn(
                "The song ended, but your session has expired. Would you like to sign in again to continue playback?",
                session?.invite_code ? `/jam/${session.invite_code}` : null,
              );
            }
          });
      }
    };

    audioElement.addEventListener("ended", handleEnd);
    return () => audioElement.removeEventListener("ended", handleEnd);
  }, [audioElement, isDJ, session, repeatMode, refresh]);

  // ── Skip vote handler ─────────────────────────────────────────────────────
  const handleSkipVote = async () => {
    if (!userId) {
      promptSignIn(
        "Please sign in to vote to skip this song.",
        session?.invite_code ? `/jam/${session.invite_code}` : null,
      );
      return;
    }
    try {
      if (hasVoted) {
        await removeSkipVote(playingItem.id, userId);
      } else {
        const skipped = await castSkipVote(playingItem.id, skipThreshold);
        if (skipped) refresh?.();
      }
    } catch (e) {
      console.error("Skip vote failed:", e);
      if (isAuthError(e)) {
        promptSignIn(
          "Your session expired. Would you like to sign in again to vote to skip?",
          session?.invite_code ? `/jam/${session.invite_code}` : null,
        );
      }
    }
  };

  // ── Repeat toggle: cycle none → song → queue → none ──────────────────────
  const handleRepeatToggle = () => {
    const next =
      { none: "song", song: "queue", queue: "none" }[repeatMode] ?? "none";
    onRepeatModeChange?.(next);
  };

  // ── Seek bar: smooth drag + drop-to-seek ──────────────────────────────────
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const scrubValueRef = useRef(0);
  const isScrubbingRef = useRef(false);

  const handleInput = (e) => {
    if (!isDJ || !duration) return;
    const val = parseFloat(e.target.value);
    isScrubbingRef.current = true;
    scrubValueRef.current = val;
    setIsScrubbing(true);
    setScrubValue(val);
  };

  const handleCommit = () => {
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      const target = scrubValueRef.current;
      seek(target);
    }
  };

  // Window release fallback to ensure seek always commits if finger lifts outside
  useEffect(() => {
    const handleWindowRelease = () => {
      if (isScrubbingRef.current) {
        isScrubbingRef.current = false;
        setIsScrubbing(false);
        seek(scrubValueRef.current);
      }
    };
    window.addEventListener("pointerup", handleWindowRelease, {
      passive: true,
    });
    window.addEventListener("touchend", handleWindowRelease, { passive: true });
    window.addEventListener("mouseup", handleWindowRelease, { passive: true });
    return () => {
      window.removeEventListener("pointerup", handleWindowRelease);
      window.removeEventListener("touchend", handleWindowRelease);
      window.removeEventListener("mouseup", handleWindowRelease);
    };
  }, [seek]);

  // ── Next track (advances queue, marks song as "played") ────────────────────
  const handleNext = () => {
    if (!isDJ) return;
    playNext(session.id)
      .then(() => refresh?.())
      .catch((e) => {
        console.error("Play next failed:", e);
        if (isAuthError(e)) {
          promptSignIn(
            "Your session expired. Would you like to sign in again to control playback?",
            session?.invite_code ? `/jam/${session.invite_code}` : null,
          );
        }
      });
  };

  const displayProgress = isScrubbing ? scrubValue : progress;
  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (displayProgress / duration) * 100))
      : 0;

  // Render nothing if no song is playing (player bar should be invisible)
  if (!playingItem) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-lime-accent border-t-4 border-black p-4 z-50 rounded-t-3xl shadow-[0_-8px_0_0_rgba(0,0,0,0.1)]">
      <div className="max-w-md mx-auto">
        {/* ── Song info + controls ────────────────────────────────────────── */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex-1 min-w-0 pr-4">
            <MarqueeText
              as="h4"
              text={playingItem.title}
              className="font-black text-xl"
            />
            <MarqueeText
              as="p"
              text={playingItem.artist || "Unknown"}
              className="font-bold text-green-900 opacity-80 text-sm"
            />
          </div>

          {/* DJ controls */}
          {isDJ && (
            <div className="flex items-center gap-2 shrink-0">
              {/* Skip vote (visible to all, including DJ) */}
              <button
                onClick={handleSkipVote}
                className={`relative w-10 h-10 border-2 border-black rounded-full flex items-center justify-center active:scale-90 transition-transform ${
                  hasVoted ? "bg-black text-lime-400" : "bg-white text-black"
                }`}
              >
                <ThumbsDown size={18} />
                <div className="absolute -top-2 -right-2 bg-white border-2 border-black text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full">
                  {skipVotes}
                </div>
              </button>

              {/* Repeat toggle — cycles none → song → queue */}
              <button
                onClick={handleRepeatToggle}
                title={
                  repeatMode === "song"
                    ? "Repeat Song"
                    : repeatMode === "queue"
                      ? "Repeat Queue"
                      : "No Repeat"
                }
                className={`w-10 h-10 border-2 border-black rounded-full flex items-center justify-center active:scale-90 transition-transform ${
                  repeatMode !== "none" ? "bg-lime-300" : "bg-white"
                }`}
              >
                {repeatMode === "song" ? (
                  <Repeat1 size={18} />
                ) : (
                  <Repeat
                    size={18}
                    className={repeatMode === "none" ? "opacity-30" : ""}
                  />
                )}
              </button>

              {/* Previous */}
              <button
                onClick={() =>
                  playPrevious(session.id)
                    .then(() => refresh?.())
                    .catch((e) => {
                      console.error("Play previous failed:", e);
                      if (isAuthError(e)) {
                        promptSignIn(
                          "Your session expired. Would you like to sign in again to control playback?",
                          session?.invite_code
                            ? `/jam/${session.invite_code}`
                            : null,
                        );
                      }
                    })
                }
                className="w-10 h-10 bg-white border-2 border-black rounded-full flex items-center justify-center active:scale-90 transition-transform"
              >
                <SkipBack size={18} />
              </button>

              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                className="w-14 h-14 bg-white border-2 border-black rounded-full flex items-center justify-center shadow-brutal active:scale-90 active:shadow-none transition-all"
              >
                {isPlaying ? (
                  <Pause size={24} />
                ) : (
                  <Play size={24} className="ml-1" />
                )}
              </button>

              {/* Next */}
              <button
                onClick={handleNext}
                title="Next"
                className="w-10 h-10 bg-white border-2 border-black rounded-full flex items-center justify-center active:scale-90 transition-transform"
              >
                <SkipForward size={18} />
              </button>
            </div>
          )}

          {/* Guest view: skip vote + status pill */}
          {!isDJ && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSkipVote}
                className={`border-2 border-black rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wider active:scale-95 transition-transform flex items-center gap-1.5 ${
                  hasVoted ? "bg-black text-lime-400" : "bg-white text-black"
                }`}
              >
                <ThumbsDown size={14} />
                Skip ({skipVotes}/{skipThreshold}) {hasVoted ? "✓" : ""}
              </button>
              <div className="bg-white border-2 border-black rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wider">
                {isPlaying ? "Playing" : "Paused"}
              </div>
            </div>
          )}
        </div>

        {/* ── Progress bar ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 text-sm font-bold font-mono text-green-900 select-none">
          <span className="w-10 text-left shrink-0">
            {formatTime(displayProgress)}
          </span>
          <div className="relative flex-1 flex items-center h-8">
            {/* Solid underlying track - never flickers */}
            <div className="absolute left-0 right-0 h-3 bg-white border-2 border-black rounded-full overflow-hidden pointer-events-none">
              <div
                className="h-full bg-black"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Native transparent input slider over the track */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step="any"
              value={displayProgress}
              onInput={handleInput}
              onChange={handleInput}
              onPointerUp={handleCommit}
              onTouchEnd={handleCommit}
              onMouseUp={handleCommit}
              disabled={!isDJ || !duration}
              className="relative w-full h-8 bg-transparent appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
                [&::-webkit-slider-runnable-track]:bg-transparent
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_2px_4px_rgba(0,0,0,0.3)] active:[&::-webkit-slider-thumb]:scale-110
                [&::-moz-range-track]:bg-transparent
                [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:bg-black [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
            />
          </div>
          <span className="w-10 text-right shrink-0">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
