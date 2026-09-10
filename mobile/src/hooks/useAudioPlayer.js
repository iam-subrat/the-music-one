import { useState, useEffect, useRef } from 'react';
import { extractYouTubeId } from '../lib/platform';

export function useAudioPlayer(playingItem) {
  const audioRef = useRef(new Audio());
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
    const handleLoadedMeta = () => setDuration(audio.duration);
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
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMeta);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    if (!playingItem) {
      audioRef.current.pause();
      return;
    }
    
    // Check if it's the same song to avoid restarting
    const apiUrl = import.meta.env.VITE_API_URL || 'https://api.themusic.one';
    const ytUrl = playingItem.platform_links?.youtube || playingItem.platform_links?.youtubemusic || playingItem.source_url;
    const yId = extractYouTubeId(ytUrl) || playingItem.youtube_id;
    if (!yId) {
      console.error("Cannot play: Missing YouTube ID for item", playingItem);
      return;
    }
    const newSrc = `${apiUrl}/api/youtube/${yId}/stream`;
    
    if (audioRef.current.src !== newSrc) {
      audioRef.current.src = newSrc;
      console.log("TRYING TO PLAY AUDIO", audioRef.current.src); audioRef.current.play().then(() => console.log("AUDIO PLAYED")).catch(e => console.error("AUDIO PLAY ERROR", e));
    }
  }, [playingItem]);

  const togglePlay = () => {
    if (audioRef.current.paused) {
      console.log("TRYING TO PLAY AUDIO", audioRef.current.src); audioRef.current.play().then(() => console.log("AUDIO PLAYED")).catch(e => console.error("AUDIO PLAY ERROR", e));
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
