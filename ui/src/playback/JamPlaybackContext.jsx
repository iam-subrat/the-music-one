import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import YouTubeAutoPlayer from "../components/YouTubeAutoPlayer";
import { useMediaSession } from "../hooks/useMediaSession";

const PlaybackContext = createContext(null);

function samePlayback(a, b) {
  return a?.sessionId === b?.sessionId
    && a?.queueItemId === b?.queueItemId
    && a?.videoId === b?.videoId;
}

function PersistentPlayer({ descriptor, playerRef }) {
  const latestDescriptor = useRef(descriptor);
  useEffect(() => { latestDescriptor.current = descriptor; }, [descriptor]);
  const enabled = !!(descriptor?.enabled && descriptor?.videoId);
  const [position, setPosition] = useState({ time: 0, duration: 0 });

  useEffect(() => {
    if (!enabled) return undefined;
    const update = () => setPosition({
      time: playerRef.current?.getTime?.() ?? 0,
      duration: playerRef.current?.getDuration?.() ?? 0,
    });
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [enabled, descriptor?.queueItemId, playerRef]);

  useMediaSession({
    enabled,
    playerRef,
    metadata: descriptor?.metadata,
    onNext: () => latestDescriptor.current?.onEnded?.(),
    onPrev: () => playerRef.current?.seek?.(0),
  });

  if (!enabled) return null;
  return (
    <div className="jam-persistent-player" data-session-id={descriptor.sessionId} aria-label="Shared Jam player">
      <div className="jam-persistent-player__status" aria-hidden="true">
        <span className="jam-persistent-player__cover">
          {descriptor.metadata?.artwork && <img src={descriptor.metadata.artwork} alt="" />}
        </span>
        <span className="jam-persistent-player__copy">
          <strong>{descriptor.metadata?.title || "Now playing"}</strong>
          <small>{descriptor.metadata?.artist || "MusicOne Jam"}</small>
        </span>
        <span className="jam-persistent-player__progress"><i style={{ width: `${position.duration > 0 ? Math.min(100, position.time / position.duration * 100) : 0}%` }} /></span>
        <span className="jam-persistent-player__note">Shared player · GUI ↔ TUI</span>
      </div>
      <YouTubeAutoPlayer
        ref={playerRef}
        videoId={descriptor.videoId}
        repeat={descriptor.repeat}
        onEnded={() => latestDescriptor.current?.onEnded?.()}
      />
    </div>
  );
}

export function JamPlaybackProvider({ children }) {
  const playerRef = useRef(null);
  const [descriptor, setDescriptor] = useState(null);

  const registerPlayback = useCallback((next) => {
    setDescriptor((current) => {
      if (next.ready === false) return current;
      if (
        current?.enabled
        && current.owner !== next.owner
        && next.isDJ
        && current.sessionId === next.sessionId
        && current.queueItemId === next.queueItemId
      ) {
        return {
          ...current,
          ...next,
          isDJ: current.isDJ,
          videoId: current.videoId,
          enabled: true,
          metadata: next.metadata ?? current.metadata,
        };
      }
      return samePlayback(current, next) ? { ...current, ...next } : next;
    });
  }, []);
  const clearPlayback = useCallback((sessionId) => {
    setDescriptor((current) => {
      if (sessionId && current?.sessionId !== sessionId) return current;
      playerRef.current?.pause?.();
      return null;
    });
  }, []);

  const value = useMemo(() => ({
    registerPlayback,
    clearPlayback,
    playerRef,
    play: () => playerRef.current?.play(),
    pause: () => playerRef.current?.pause(),
    seek: (seconds) => playerRef.current?.seek(seconds),
    getTime: () => playerRef.current?.getTime() ?? 0,
    getDuration: () => playerRef.current?.getDuration() ?? 0,
    getState: () => playerRef.current?.getState() ?? -1,
  }), [clearPlayback, registerPlayback]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
      <PersistentPlayer descriptor={descriptor} playerRef={playerRef} />
    </PlaybackContext.Provider>
  );
}

export function useJamPlayback() {
  const context = useContext(PlaybackContext);
  if (!context) throw new Error("useJamPlayback must be used inside JamPlaybackProvider");
  return context;
}
