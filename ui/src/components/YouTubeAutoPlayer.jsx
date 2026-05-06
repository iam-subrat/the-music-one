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
 * Calls onEnded when playback finishes (unless repeat is true, in which case it restarts).
 * Key the component on videoId to force remount on song change.
 */
export default function YouTubeAutoPlayer({ videoId, onEnded, repeat }) {
  // wrapperRef is owned by React — never touched by YT.
  // YT gets a fresh child div it can replace with its iframe.
  const wrapperRef = useRef(null);
  const playerRef = useRef(null);
  const repeatRef = useRef(repeat);

  // Keep repeatRef current without remounting the player
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  useEffect(() => {
    loadApi();

    function initPlayer() {
      if (!wrapperRef.current) return;
      const playerDiv = document.createElement('div');
      wrapperRef.current.appendChild(playerDiv);
      playerRef.current = new window.YT.Player(playerDiv, {
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              if (repeatRef.current) {
                playerRef.current.seekTo(0);
                playerRef.current.playVideo();
              } else {
                onEnded?.();
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
  }, [videoId]);

  return <div ref={wrapperRef} className={s.ytEmbed} />;
}
