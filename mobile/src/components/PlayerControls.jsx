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
          .catch(console.error);
      }
    };

    audioElement.addEventListener("ended", handleEnd);
    return () => audioElement.removeEventListener("ended", handleEnd);
  }, [audioElement, isDJ, session, repeatMode, refresh]);

  // ── Skip vote handler ─────────────────────────────────────────────────────
  const handleSkipVote = async () => {
    try {
      if (hasVoted) {
        await removeSkipVote(playingItem.id, userId);
      } else {
        const skipped = await castSkipVote(playingItem.id, skipThreshold);
        if (skipped) refresh?.();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ── Repeat toggle: cycle none → song → queue → none ──────────────────────
  const handleRepeatToggle = () => {
    const next =
      { none: "song", song: "queue", queue: "none" }[repeatMode] ?? "none";
    onRepeatModeChange?.(next);
  };

  // ── Seek bar: smooth drag + drop-to-seek ──────────────────────────────────
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const isDraggingRef = useRef(false);
  const dragProgressRef = useRef(0);

  const calculateTimeFromPointer = (e) => {
    if (!trackRef.current || !duration) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    return ratio * duration;
  };

  const handlePointerDown = (e) => {
    if (!isDJ || !duration) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    isDraggingRef.current = true;
    setIsDragging(true);
    const newTime = calculateTimeFromPointer(e);
    dragProgressRef.current = newTime;
    setDragProgress(newTime);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const newTime = calculateTimeFromPointer(e);
    dragProgressRef.current = newTime;
    setDragProgress(newTime);
  };

  const handlePointerUp = (e) => {
    if (!isDraggingRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    isDraggingRef.current = false;
    setIsDragging(false);
    const target = dragProgressRef.current;
    seek(target);
  };

  const handleKeyDown = (e) => {
    if (!isDJ || !duration) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      seek(Math.max(0, (isDragging ? dragProgress : progress) - 5));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seek(Math.min(duration, (isDragging ? dragProgress : progress) + 5));
    }
  };

  // Window release fallback to ensure seek always commits
  useEffect(() => {
    if (!isDragging) return;
    const onWindowPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        seek(dragProgressRef.current);
      }
    };
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("touchend", onWindowPointerUp);
    return () => {
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("touchend", onWindowPointerUp);
    };
  }, [isDragging, seek]);

  // ── Next track (advances queue, marks song as "played") ────────────────────
  const handleNext = () => {
    if (!isDJ) return;
    playNext(session.id)
      .then(() => refresh?.())
      .catch((e) => console.error("Play next failed:", e));
  };

  const currentProgress = isDragging ? dragProgress : progress;
  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (currentProgress / duration) * 100))
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
                    .catch((e) => console.error(e))
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
            {formatTime(currentProgress)}
          </span>
          <div
            ref={trackRef}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={duration || 100}
            aria-valuenow={currentProgress}
            tabIndex={isDJ ? 0 : -1}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            className={`relative flex-1 flex items-center h-8 ${
              isDJ && duration ? "cursor-pointer" : "cursor-default opacity-50"
            } touch-none`}
          >
            {/* Track background */}
            <div className="w-full h-3 bg-white border-2 border-black rounded-full overflow-hidden relative">
              <div
                className="h-full bg-black"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* Draggable thumb */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-black border-2 border-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.4)] pointer-events-none transition-transform ${
                isDragging ? "scale-125" : "scale-100"
              }`}
              style={{ left: `${progressPercent}%` }}
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
