import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import YouTubeAutoPlayer from "../components/YouTubeAutoPlayer";
import { useMediaSession } from "../hooks/useMediaSession";

const PlaybackContext = createContext(null);

function samePlayback(a, b) {
  return a?.sessionId === b?.sessionId
    && a?.queueItemId === b?.queueItemId
    && a?.videoId === b?.videoId;
}

function PersistentPlayer({ descriptor, playerRef, PlayerComponent, playerChrome, onPlayerReady }) {
  const latestDescriptor = useRef(descriptor);
  useLayoutEffect(() => { latestDescriptor.current = descriptor; }, [descriptor]);
  const enabled = !!(descriptor?.enabled && descriptor?.videoId);

  useMediaSession({
    enabled,
    playerRef,
    metadata: descriptor?.metadata,
    onNext: () => (latestDescriptor.current?.onNext ?? latestDescriptor.current?.onEnded)?.(),
    onPrev: () => latestDescriptor.current?.onPrevious ? latestDescriptor.current.onPrevious() : playerRef.current?.seek?.(0),
  });

  if (!enabled) return null;
  return (
    <div className="jam-persistent-player" data-session-id={descriptor.sessionId} aria-label="Shared Jam player">
      {playerChrome && <div className="jam-persistent-player__status" aria-hidden="true">
        <span className="jam-persistent-player__cover">
          {descriptor.metadata?.artwork && <img src={descriptor.metadata.artwork} alt="" />}
        </span>
        <span className="jam-persistent-player__copy">
          <strong>{descriptor.metadata?.title || "Now playing"}</strong>
          <small>{descriptor.metadata?.artist || "MusicOne Jam"}</small>
        </span>
      </div>}
      <PlayerComponent
        ref={playerRef}
        videoId={descriptor.videoId}
        playbackKey={descriptor.playbackKey ?? descriptor.queueItemId + ':' + descriptor.modeVersion}
        repeat={descriptor.repeat}
        autoplayOnChange={descriptor.autoplayOnChange !== false}
        onReady={() => {
          const current = latestDescriptor.current;
          onPlayerReady(current);
          current?.onReady?.();
        }}
        onError={descriptor.onError}
        onBlocked={descriptor.onBlocked}
        onEnded={() => latestDescriptor.current?.onEnded?.()}
      />
    </div>
  );
}

export function JamPlaybackProvider({ children, PlayerComponent = YouTubeAutoPlayer, playerChrome = true }) {
  const playerRef = useRef(null);
  const [descriptor, setDescriptor] = useState(null);
  const pendingStartRef = useRef(null);
  const requestStart = useCallback((sessionId, queueItemId, modeVersion) => {
    const request = { sessionId, queueItemId, modeVersion };
    pendingStartRef.current = request;
    return () => { if (pendingStartRef.current === request) pendingStartRef.current = null; };
  }, []);
  const onPlayerReady = useCallback((current) => {
    const request = pendingStartRef.current;
    if (request && current?.isDJ && current.enabled && request.sessionId === current.sessionId
      && request.queueItemId === current.queueItemId && request.modeVersion === current.modeVersion) {
      pendingStartRef.current = null;
      playerRef.current?.play();
    }
  }, []);

  const registerPlayback = useCallback((next) => {
    setDescriptor((current) => {
      if (next.ready === false) return current;
      const request = pendingStartRef.current;
      if (request && (request.sessionId !== next.sessionId || request.modeVersion !== next.modeVersion || !next.isDJ)) {
        pendingStartRef.current = null;
      }
      if (current?.sessionId === next.sessionId && current?.modeVersion !== next.modeVersion) {
        playerRef.current?.pause?.();
        playerRef.current?.seek?.(0);
        return { ...next, autoplayOnChange: false };
      }
      if (current?.enabled && current.isDJ && next.isDJ
        && current.sessionId === next.sessionId && next.queueItemId
        && current.queueItemId !== next.queueItemId) {
        // Keep the activated iframe alive while the replacement video resolves.
        if (!next.videoId) return current;
        const explicitStart = request?.queueItemId === next.queueItemId;
        const state = playerRef.current?.getState?.();
        if (explicitStart) pendingStartRef.current = null;
        return { ...next, autoplayOnChange: explicitStart || [0, 1, 3].includes(state) };
      }
      if (
        current?.enabled
        && (next.isDJ || next.independent)
        && current.sessionId === next.sessionId
        && current.queueItemId === next.queueItemId
        && (current.owner !== next.owner || next.videoId == null)
        && (next.enabled || next.videoId == null)
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
  const clearPlayback = useCallback((sessionId, owner) => {
    setDescriptor((current) => {
      if (sessionId && current?.sessionId !== sessionId) return current;
      if (owner && current?.owner !== owner) return current;
      pendingStartRef.current = null;
      playerRef.current?.pause?.();
      return null;
    });
  }, []);

  const value = useMemo(() => ({
    registerPlayback,
    requestStart,
    clearPlayback,
    playerRef,
    play: () => playerRef.current?.play(),
    pause: () => playerRef.current?.pause(),
    seek: (seconds) => playerRef.current?.seek(seconds),
    replay: () => playerRef.current?.replay(),
    getTime: () => playerRef.current?.getTime() ?? 0,
    getDuration: () => playerRef.current?.getDuration() ?? 0,
    getState: () => playerRef.current?.getState() ?? -1,
  }), [clearPlayback, registerPlayback, requestStart]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
      <PersistentPlayer descriptor={descriptor} playerRef={playerRef} PlayerComponent={PlayerComponent} playerChrome={playerChrome} onPlayerReady={onPlayerReady} />
    </PlaybackContext.Provider>
  );
}

export function useJamPlayback() {
  const context = useContext(PlaybackContext);
  if (!context) throw new Error("useJamPlayback must be used inside JamPlaybackProvider");
  return context;
}
