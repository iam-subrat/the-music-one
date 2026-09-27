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
        <span className="jam-persistent-player__dot" />
        <span>Shared player · {descriptor.metadata?.title || "Now playing"}</span>
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
      if (
        current?.enabled
        && current.owner !== next.owner
        && next.isDJ
        && current.sessionId === next.sessionId
        && current.queueItemId === next.queueItemId
        && !next.videoId
      ) {
        return { ...current, ...next, videoId: current.videoId, enabled: true };
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
