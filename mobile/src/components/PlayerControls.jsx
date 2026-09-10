let lastSkipTime = 0;
import { useEffect, useState } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { playNext, playPrevious, playSpecificSong, castSkipVote, removeSkipVote } from "../lib/queue";
import { useSkipVotes } from "../hooks/useSkipVotes";
import { Play, Pause, SkipForward, SkipBack, Repeat, Repeat1 } from "lucide-react";

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlayerControls({ session, playingItem, isHost, queueItems, refresh, userId, participantCount }) {
  const [repeatMode, setRepeatMode] = useState("none");
  const skipThreshold = participantCount ? Math.floor(participantCount / 2) + 1 : 1;

  const { isPlaying, progress, duration, togglePlay, seek, audioElement } =
    useAudioPlayer(playingItem);
    
  const { count: skipVotes, hasVoted } = useSkipVotes(
    playingItem?.id,
    userId,
    session?.id
  );

  useEffect(() => {
    const handleEnd = () => {
      if (isHost && session) {
        if (repeatMode === "single") {
          audioElement.currentTime = 0;
          audioElement.play().catch(console.error);
        } else {
          const now = Date.now();
          if (now - lastSkipTime < 2500) return;
          lastSkipTime = now;
          playNext(session.id).catch(e => {
             if (repeatMode === "queue" && queueItems?.length > 0) {
                playSpecificSong(session.id, queueItems[0].id).catch(console.error);
             } else {
                console.error(e);
             }
          });
        }
      }
    };
    audioElement.addEventListener("ended", handleEnd);
    return () => audioElement.removeEventListener("ended", handleEnd);
  }, [audioElement, isHost, session, repeatMode, queueItems]);

  if (!playingItem) return null;

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    seek(val);
  };
  
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

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-lime-accent border-t-4 border-black p-4 z-50 rounded-t-3xl shadow-[0_-8px_0_0_rgba(0,0,0,0.1)]">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-4">
          <div className="flex-1 min-w-0 pr-4">
            <h4 className="font-black text-xl truncate">{playingItem.title}</h4>
            <p className="font-bold text-green-900 opacity-80 text-sm truncate">
              {playingItem.artist || "Unknown"}
            </p>
          </div>
          {isHost && (
            <div className="flex items-center gap-4 shrink-0">
              <button
                onClick={() => setRepeatMode(m => m === "none" ? "single" : m === "single" ? "queue" : "none")}
                className={`w-10 h-10 border-2 border-black rounded-full flex items-center justify-center active:scale-90 transition-transform ${repeatMode !== "none" ? "bg-lime-300" : "bg-white"}`}
              >
                {repeatMode === "single" ? <Repeat1 size={18} /> : <Repeat size={18} className={repeatMode === "none" ? "opacity-30" : ""} />}
              </button>
              <button
                onClick={() => playPrevious(session.id).then(() => refresh?.()).catch(e => console.error(e))}
                className="w-10 h-10 bg-white border-2 border-black rounded-full flex items-center justify-center active:scale-90 transition-transform"
              >
                <SkipBack size={18} />
              </button>
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
              <button
                onClick={() => playNext(session.id).then(() => refresh?.()).catch(e => console.error(e))}
                className="w-10 h-10 bg-white border-2 border-black rounded-full flex items-center justify-center active:scale-90 transition-transform"
              >
                <SkipForward size={18} />
              </button>
            </div>
          )}
          {true && (
            <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSkipVote}
                  className={`border-2 border-black rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wider active:scale-95 transition-transform ${hasVoted ? 'bg-black text-lime-400' : 'bg-white text-black'}`}
                >
                  👎 Skip ({skipVotes}/{skipThreshold}){hasVoted ? " ✓" : ""}
                </button>
                <div className="bg-white border-2 border-black rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wider">
                  {isPlaying ? "Playing" : "Paused"}
                </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm font-bold font-mono text-green-900">
          <span>{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progress}
            onChange={handleSeek}
            disabled={!isHost || !duration}
            className="flex-1 h-3 bg-white border-2 border-black rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-full cursor-pointer disabled:opacity-50"
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
