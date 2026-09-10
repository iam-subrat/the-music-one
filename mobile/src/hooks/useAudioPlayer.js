import { useState, useEffect, useRef } from 'react';
import { extractYouTubeId } from '../lib/platform';
import { api } from '../lib/api';

export function useAudioPlayer(playingItem) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  
  const iframeRef = useRef(null);
  
  // Create or get the bridge iframe once
  useEffect(() => {
    let iframe = document.getElementById('youtube-bridge-iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'youtube-bridge-iframe';
      iframe.src = 'https://themusic.one/bridge'; // Real backend URL to completely bypass local origin blocks
      iframe.style.position = 'fixed';
      iframe.style.width = '10px';
      iframe.style.height = '10px';
      iframe.style.opacity = '0.01'; // Can't be 0 or display none on webkit
      iframe.style.pointerEvents = 'none';
      iframe.style.zIndex = '-9999';
      iframe.setAttribute('allow', 'autoplay');
      document.body.appendChild(iframe);
    }
    iframeRef.current = iframe;

    const handleMessage = (event) => {
      // Security: Only listen to our own bridge
      if (event.origin !== 'https://themusic.one') return;
      
      const data = event.data;
      if (!data) return;

      switch (data.type) {
        case 'READY':
          // The bridge is fully loaded and ready
          if (iframeRef.current?.pendingVideoId) {
            iframeRef.current.contentWindow.postMessage({ type: 'LOAD', videoId: iframeRef.current.pendingVideoId }, '*');
            iframeRef.current.pendingVideoId = null;
          }
          break;
        case 'STATE_CHANGE':
          if (data.state === 1) { // PLAYING (1 in YouTube API)
            setIsPlaying(true);
          } else if (data.state === 2) { // PAUSED (2)
            setIsPlaying(false);
          } else if (data.state === 0) { // ENDED (0)
            setIsPlaying(false);
            window.dispatchEvent(new Event('yt-audio-ended'));
          }
          break;
        case 'PROGRESS':
          if (data.currentTime !== undefined) setProgress(data.currentTime);
          if (data.duration !== undefined) setDuration(data.duration);
          break;
        case 'ERROR':
          console.error('[Bridge] YT Player Error:', data.error);
          setTimeout(() => {
            window.dispatchEvent(new Event('yt-audio-ended'));
          }, 3000);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!playingItem) {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'PAUSE' }, '*');
      }
      return;
    }
    
    let isMounted = true;
    const resolveAndPlay = async () => {
      const ytUrl = playingItem.platform_links?.youtube || playingItem.platform_links?.youtubemusic || playingItem.source_url;
      let yId = extractYouTubeId(ytUrl) || playingItem.youtube_id;

      if (!yId && playingItem.title) {
        try {
          const res = await api(`/youtube?q=${encodeURIComponent(playingItem.title + " " + (playingItem.artist || ""))}`);
          if (res.ok) {
            const data = await res.json();
            yId = data.id;
          }
        } catch (e) {
          console.error("Failed to fallback search YouTube ID", e);
        }
      }

      if (!isMounted || !yId) return;

      if (iframeRef.current && iframeRef.current.contentWindow) {
        // We can't guarantee if it's "READY" yet, so we post the message.
        // If it isn't ready, the bridge won't respond, so we also save pending check:
        iframeRef.current.pendingVideoId = yId;
        iframeRef.current.contentWindow.postMessage({ type: 'LOAD', videoId: yId }, '*');
      }
    };

    resolveAndPlay();
    return () => { isMounted = false; };
  }, [playingItem]);

  const togglePlay = () => {
    if (iframeRef.current?.contentWindow) {
      if (isPlaying) {
        iframeRef.current.contentWindow.postMessage({ type: 'PAUSE' }, '*');
      } else {
        iframeRef.current.contentWindow.postMessage({ type: 'PLAY' }, '*');
      }
    }
  };

  const seek = (time) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'SEEK', time }, '*');
      setProgress(time);
    }
  };

  const fakeAudioElement = useRef({
    addEventListener: (eventName, handler) => {
      if (eventName === 'ended') {
        window.addEventListener('yt-audio-ended', handler);
      }
    },
    removeEventListener: (eventName, handler) => {
      if (eventName === 'ended') {
        window.removeEventListener('yt-audio-ended', handler);
      }
    },
    play: async () => { 
        if (iframeRef.current?.contentWindow) {
           iframeRef.current.contentWindow.postMessage({ type: 'PLAY' }, '*');
        }
    },
    set currentTime(val) {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'SEEK', time: val }, '*');
        }
    },
    get currentTime() {
        return progress;
    }
  }).current;

  return {
    isPlaying,
    progress,
    duration,
    error,
    togglePlay,
    seek,
    audioElement: fakeAudioElement
  };
}
