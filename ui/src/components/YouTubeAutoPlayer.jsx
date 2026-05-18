import { useEffect, useRef } from 'react';
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
export default function YouTubeAutoPlayer({ videoId, onEnded, repeat }) {
  const wrapperRef = useRef(null);
  const playerRef = useRef(null);
  const repeatRef = useRef(repeat);
  const onEndedRef = useRef(onEnded);
  // Always reflects the latest videoId so initPlayer uses it even if the prop
  // changed while waiting for the YT API to load.
  const videoIdRef = useRef(videoId);

  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  // Song change: swap video in the existing player (keeps iOS media element "activated").
  // On first mount playerRef is null — initPlayer handles the initial videoId.
  useEffect(() => {
    videoIdRef.current = videoId;
    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
    }
  }, [videoId]);

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
            if (e.data === window.YT.PlayerState.ENDED) {
              if (repeatRef.current) {
                playerRef.current.seekTo(0);
                playerRef.current.playVideo();
              } else {
                onEndedRef.current?.();
              }
            }
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
}
