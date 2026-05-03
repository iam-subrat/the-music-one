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
 * Embeds a YouTube player that autoplays videoId.
 * Calls onEnded when playback finishes.
 * Key the component on videoId to force remount on song change.
 */
export default function YouTubeAutoPlayer({ videoId, onEnded }) {
  const divRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    loadApi();

    function initPlayer() {
      if (!divRef.current) return;
      playerRef.current = new window.YT.Player(divRef.current, {
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED) onEnded?.();
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
    };
  }, [videoId]);

  return <div ref={divRef} className={s.ytEmbed} />;
}
