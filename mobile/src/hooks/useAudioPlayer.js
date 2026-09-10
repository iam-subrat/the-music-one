import { useState, useEffect, useRef } from 'react';

export function useAudioPlayer(playingItem) {
  const audioRef = useRef(new Audio());
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    const audio = audioRef.current;
    audio.crossOrigin = "use-credentials";

    audio.playsInline = true;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false); // Should maybe trigger playNext? Handled in component.
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
    const newSrc = `${apiUrl}/api/youtube/${playingItem.youtube_id || playingItem.id}/stream`;
    
    if (audioRef.current.src !== newSrc) {
      audioRef.current.src = newSrc;
      audioRef.current.play().catch(console.error);
    }
  }, [playingItem]);

  const togglePlay = () => {
      audioRef.current.play().catch(console.error);
      audioRef.current.pause();
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
    audioElement: audioElement
  };
}
