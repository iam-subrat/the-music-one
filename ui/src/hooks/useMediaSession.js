import { useEffect, useRef } from 'react';

// Owns the OS-level media session so hardware keys (Play/Pause, Next, Previous
// on Mac/Windows function rows, headset buttons, lock-screen widgets) control
// the YouTube iframe player. The iframe registers its own MediaSession by
// default; to override it the parent page must have its own actively-playing
// media element with finite duration. Chrome silently refuses to register
// nexttrack/previoustrack handlers on infinite-duration sources (MediaStream),
// so we use a real silent WAV blob with a known duration and loop it.
let silentBlobUrl = null;

function ensureSilentBlobUrl() {
  if (silentBlobUrl) return silentBlobUrl;
  const sampleRate = 8000;
  const seconds = 1;
  const numSamples = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);
  const write = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  write(0, 'RIFF');
  view.setUint32(4, 36 + numSamples, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, 'data');
  view.setUint32(40, numSamples, true);
  for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 0x80);
  silentBlobUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return silentBlobUrl;
}

export function useMediaSession({ enabled, playerRef, metadata, onNext, onPrev }) {
  const audioRef = useRef(null);
  const handlersRef = useRef({ onNext, onPrev });

  useEffect(() => {
    handlersRef.current = { onNext, onPrev };
  }, [onNext, onPrev]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const audio = document.createElement('audio');
    audio.loop = true;
    audio.volume = 0.001;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.src = ensureSilentBlobUrl();
    audioRef.current = audio;

    let cancelled = false;

    function startSilent() {
      if (cancelled) return;
      audio.play().catch(() => {});
    }
    startSilent();
    const gestureStart = () => startSilent();
    document.addEventListener('pointerdown', gestureStart);
    document.addEventListener('keydown', gestureStart);

    const ms = navigator.mediaSession;

    // Single toggle bound to BOTH play and pause actions. Chrome routes the
    // hardware Play/Pause key to whichever action matches mediaSession state —
    // by handling both with the same function, we don't care which one fires.
    // We also mirror the silent <audio> with the YT player so Chrome's session
    // arbitration treats parent's media state as authoritative.
    function togglePlayPause() {
      const player = playerRef?.current;
      if (!player?.isReady?.()) return;
      const state = player.getState?.();
      const isPlaying = state === 1;
      if (isPlaying) {
        player.pause?.();
        ms.playbackState = 'paused';
        try { audio.pause(); } catch {}
      } else {
        player.play?.();
        ms.playbackState = 'playing';
        audio.play().catch(() => {});
      }
    }

    try { ms.setActionHandler('play', togglePlayPause); } catch {}
    try { ms.setActionHandler('pause', togglePlayPause); } catch {}
    try {
      ms.setActionHandler('nexttrack', () => {
        try { handlersRef.current.onNext?.(); } catch {}
      });
    } catch {}
    try {
      ms.setActionHandler('previoustrack', () => {
        try { handlersRef.current.onPrev?.(); } catch {}
      });
    } catch {}
    try { ms.setActionHandler('seekbackward', null); } catch {}
    try { ms.setActionHandler('seekforward', null); } catch {}

    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', gestureStart);
      document.removeEventListener('keydown', gestureStart);
      try { audio.pause(); audio.src = ''; } catch {}
      audioRef.current = null;
      try {
        ms.setActionHandler('play', null);
        ms.setActionHandler('pause', null);
        ms.setActionHandler('nexttrack', null);
        ms.setActionHandler('previoustrack', null);
        ms.metadata = null;
      } catch {}
    };
  }, [enabled, playerRef]);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!metadata) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title:  metadata.title  || 'Jam',
        artist: metadata.artist || '',
        album:  'MusicOne Jam',
        artwork: metadata.artwork
          ? [
              { src: metadata.artwork, sizes: '96x96',  type: 'image/jpeg' },
              { src: metadata.artwork, sizes: '256x256', type: 'image/jpeg' },
              { src: metadata.artwork, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      });
    } catch {}
  }, [enabled, metadata?.title, metadata?.artist, metadata?.artwork]);

  // Mirror YouTube player state → silent audio + mediaSession.playbackState.
  // Position state is required for Chrome to keep nexttrack/previoustrack
  // enabled on hardware media keys.
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const id = setInterval(() => {
      const player = playerRef?.current;
      const state = player?.getState?.();
      const audio = audioRef.current;
      if (state == null || !audio) return;

      if (state === 1) {
        ms.playbackState = 'playing';
        if (audio.paused) audio.play().catch(() => {});
      } else if (state === 2) {
        ms.playbackState = 'paused';
        if (!audio.paused) { try { audio.pause(); } catch {} }
      }

      const duration = player?.getDuration?.() ?? 0;
      const position = player?.getTime?.() ?? 0;
      if (duration > 0 && Number.isFinite(duration)) {
        try {
          ms.setPositionState({
            duration,
            position: Math.min(position, duration),
            playbackRate: 1,
          });
        } catch {}
      }
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, playerRef]);
}
