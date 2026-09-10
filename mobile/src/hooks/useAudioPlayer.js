import { useState, useEffect, useRef } from 'react';
import { extractYouTubeId } from '../lib/platform';
import { API_BASE } from '../lib/api';

export function useAudioPlayer(playingItem) {
  const audioRef = useRef(new Audio());
  if (audioRef.current && !audioRef.current.crossOrigin) {
    audioRef.current.crossOrigin = 'use-credentials';
  }
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    const audio = audioRef.current;
    audio.playsInline = true;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleTimeUpdate = () => setProgress(audio.currentTime);
    const handleLoadedMeta = () => setDuration(audio.duration || 0);
    const handleError = (e) => {
      console.error("Audio playback error:", e);
      const errorDetails = audio.error ? `${audio.error.code} - ${audio.error.message}` : "Unknown media error";
      setError(`Playback failed: ${errorDetails} | Src: ${audio.src}`);
      setIsPlaying(false);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMeta);
    audio.addEventListener('durationchange', handleLoadedMeta);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMeta);
      audio.removeEventListener('durationchange', handleLoadedMeta);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    if (!playingItem) {
      audioRef.current.pause();
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

      if (!isMounted) return;

      if (!yId) {
        console.error("Cannot play: Missing YouTube ID for item", playingItem);
        return;
      }

      const baseUrl = API_BASE || 'https://api.themusic.one';
      const newSrc = `${baseUrl}/api/youtube/${yId}/stream`;
      
      if (audioRef.current.src !== newSrc) {
        audioRef.current.src = newSrc;
        console.log("TRYING TO PLAY AUDIO", audioRef.current.src);
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => console.log("AUDIO PLAYED"))
            .catch(e => {
               console.error("AUDIO PLAY ERROR (e.g. Autoplay policy block on iOS)", e);
               if (e.name === "NotAllowedError") {
                 console.log("iOS Autoplay blocked! Audio loaded but paused.");
               }
            });
        }
      }
    };

    resolveAndPlay();
    return () => { isMounted = false; };
  }, [playingItem]);

  const togglePlay = () => {
    if (!audioRef.current.src && playingItem) {
      const ytUrl = playingItem.platform_links?.youtube || playingItem.platform_links?.youtubemusic || playingItem.source_url;
      const yId = extractYouTubeId(ytUrl) || playingItem.youtube_id;
      if (yId) {
        const baseUrl = API_BASE || 'https://api.themusic.one';
        audioRef.current.src = `${baseUrl}/api/youtube/${yId}/stream`;
      }
    }
    if (audioRef.current.paused && audioRef.current.src) {
      console.log("TRYING TO PLAY AUDIO", audioRef.current.src);
      audioRef.current.play()
        .then(() => console.log("AUDIO PLAYED"))
        .catch(e => console.error("AUDIO PLAY ERROR", e));
    } else {
      audioRef.current.pause();
    }
  };

  const seek = (time) => {
    if (audioRef.current.duration) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  return {
    isPlaying,
    progress,
    duration,
    error,
    togglePlay,
    seek,
    audioElement: audioRef.current
  };
}
