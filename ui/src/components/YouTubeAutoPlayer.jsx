import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import s from '../styles/jam.module.css';

// Module-level singletons: IFrame API loads once per page.
let apiLoaded = false;
let apiReady = false;
const readyCallbacks = [];

function loadApi() {
  if (apiLoaded) return;
  apiLoaded = true;
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () {
    prev?.();
    apiReady = true;
    readyCallbacks.forEach(cb => cb());
    readyCallbacks.length = 0;
  };
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

/**
 * Embeds a YouTube player. First song requires a user tap on mobile (autoplay policy).
 * Subsequent songs use loadVideoById on the same player instance — iOS keeps the
 * underlying <video> element "unlocked" after the first user gesture, so autoplay works.
 *
 * Do NOT use key={videoId} on this component. Let the videoId prop change in place.
 */
const YouTubeAutoPlayer = forwardRef(function YouTubeAutoPlayer({ videoId, onEnded, repeat }, ref) {
  const wrapperRef = useRef(null);
  const playerRef = useRef(null);
  const repeatRef = useRef(repeat);
  const onEndedRef = useRef(onEnded);
  // Always reflects the latest videoId so initPlayer uses it even if the prop
  // changed while waiting for the YT API to load.
  const videoIdRef = useRef(videoId);

  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  useImperativeHandle(ref, () => ({
    play:     () => playerRef.current?.playVideo?.(),
    pause:    () => playerRef.current?.pauseVideo?.(),
    seek:     (sec) => playerRef.current?.seekTo?.(sec, true),
    getTime:     () => playerRef.current?.getCurrentTime?.() ?? 0,
    getDuration: () => playerRef.current?.getDuration?.() ?? 0,
    // 1 = playing, 2 = paused, 0 = ended, -1 = unstarted, 3 = buffering, 5 = cued
    getState:    () => playerRef.current?.getPlayerState?.() ?? -1,
    isReady:     () => !!playerRef.current,
  }), []);

  // Tracks whether onEnded already fired for the current video, so the
  // ENDED-state and the near-end-PAUSED safety net don't both run.
  const endedFiredRef = useRef(false);

  // Song change: swap video in the existing player (keeps iOS media element "activated").
  // On first mount playerRef is null — initPlayer handles the initial videoId.
  useEffect(() => {
    videoIdRef.current = videoId;
    endedFiredRef.current = false;
    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
    }
  }, [videoId]);

  function fireEnded() {
    if (endedFiredRef.current) return;
    endedFiredRef.current = true;
    if (repeatRef.current) {
      playerRef.current?.seekTo?.(0);
      playerRef.current?.playVideo?.();
      endedFiredRef.current = false; // repeat replays, allow next end to fire
    } else {
      onEndedRef.current?.();
    }
  }

  // Create the player exactly once per mount.
  useEffect(() => {
    loadApi();

    function initPlayer() {
      if (!wrapperRef.current) return;
      const playerDiv = document.createElement('div');
      wrapperRef.current.appendChild(playerDiv);
      playerRef.current = new window.YT.Player(playerDiv, {
        videoId: videoIdRef.current,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED) fireEnded();
          },
        },
      });
    }

    let queued = false;
    if (apiReady) {
      initPlayer();
    } else {
      readyCallbacks.push(initPlayer);
      queued = true;
    }

    return () => {
      if (queued) {
        const idx = readyCallbacks.indexOf(initPlayer);
        if (idx !== -1) readyCallbacks.splice(idx, 1);
      }
      playerRef.current?.destroy();
      playerRef.current = null;
      if (wrapperRef.current) wrapperRef.current.innerHTML = '';
    };
  }, []);

  return <div ref={wrapperRef} className={s.ytEmbed} />;
});

export default YouTubeAutoPlayer;
