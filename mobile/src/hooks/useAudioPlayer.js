import { useState, useEffect, useRef } from 'react';
import { extractYouTubeId } from '../lib/platform';
import { api } from '../lib/api';

export function useAudioPlayer(playingItem) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  
  const iframeRef = useRef(null);
  const currentVideoIdRef = useRef(null);
  const seekingRef = useRef(false);
  const seekTargetRef = useRef(0);
  const seekTimeRef = useRef(0);
  const durationRef = useRef(0);
  const progressRef = useRef(0);
  const endedFiredForVideoRef = useRef(null);

  const triggerEnded = () => {
    if (endedFiredForVideoRef.current === currentVideoIdRef.current) return;
    endedFiredForVideoRef.current = currentVideoIdRef.current;
    setIsPlaying(false);
    window.dispatchEvent(new Event('yt-audio-ended'));
  };
  
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
            // Near-end safety net: YouTube often transitions to PAUSED at duration - 1s (e.g. 3:33 of 3:34)
            if (durationRef.current > 5 && progressRef.current >= durationRef.current - 2.0) {
              triggerEnded();
            }
          } else if (data.state === 0) { // ENDED (0)
            triggerEnded();
          }
          break;
        case 'PROGRESS':
          if (data.duration !== undefined && data.duration > 0) {
            durationRef.current = data.duration;
            setDuration(data.duration);
          }
          if (data.currentTime !== undefined) {
            progressRef.current = data.currentTime;
            if (seekingRef.current && Date.now() - seekTimeRef.current < 1500) {
              if (Math.abs(data.currentTime - seekTargetRef.current) > 2) {
                break;
              }
              seekingRef.current = false;
            }
            setProgress(data.currentTime);

            // If song is playing back near beginning/middle, allow end event to fire again (for repeat mode)
            if (durationRef.current > 5 && data.currentTime < durationRef.current - 5.0) {
              endedFiredForVideoRef.current = null;
            }

            // Natural end detection in PROGRESS: reached within 0.8s of end
            if (durationRef.current > 5 && data.currentTime >= durationRef.current - 0.8) {
              triggerEnded();
            }
          }
          break;
        case 'ERROR':
          console.error('[Bridge] YT Player Error:', data.error);
          setTimeout(() => {
            triggerEnded();
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
        // If we heavily re-render (e.g. queue fetch completed metadata), do not reload if already loaded
        if (currentVideoIdRef.current === yId) return;
        currentVideoIdRef.current = yId;
        endedFiredForVideoRef.current = null;
        durationRef.current = 0;
        progressRef.current = 0;
        
        // We can't guarantee if it's "READY" yet, so we post the message.
        // If it isn't ready, the bridge won't respond, so we also save pending check:
        iframeRef.current.pendingVideoId = yId;
        iframeRef.current.contentWindow.postMessage({ type: 'LOAD', videoId: yId }, '*');
      }
    };

    resolveAndPlay();
    return () => { isMounted = false; };
  }, [playingItem?.id, playingItem?.youtube_id, playingItem?.source_url]);

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
      seekingRef.current = true;
      seekTargetRef.current = time;
      seekTimeRef.current = Date.now();
      progressRef.current = time;
      if (durationRef.current > 5 && time < durationRef.current - 5.0) {
        endedFiredForVideoRef.current = null;
      }
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
            progressRef.current = val;
            endedFiredForVideoRef.current = null;
            iframeRef.current.contentWindow.postMessage({ type: 'SEEK', time: val }, '*');
        }
    },
    get currentTime() {
        return progressRef.current;
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
