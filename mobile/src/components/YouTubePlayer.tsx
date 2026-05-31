import React, { useRef, useEffect, useCallback } from 'react';
import YoutubeIframe, { YoutubeIframeRef, PLAYER_STATES } from 'react-native-youtube-iframe';

interface Props {
  videoId: string;
  onEnded?: () => void;
  repeat?: boolean;
}

export default function YouTubePlayer({ videoId, onEnded, repeat }: Props) {
  // react-native-youtube-iframe exposes ref as a regular prop (not forwardRef)
  const playerRef = useRef<YoutubeIframeRef | null>(null);
  const repeatRef = useRef(repeat);
  const onEndedRef = useRef(onEnded);

  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  const onStateChange = useCallback((state: PLAYER_STATES) => {
    if (state === PLAYER_STATES.ENDED) {
      if (repeatRef.current) {
        playerRef.current?.seekTo(0, true);
      } else {
        onEndedRef.current?.();
      }
    }
  }, []);

  return (
    <YoutubeIframe
      ref={playerRef}
      height={200}
      videoId={videoId}
      play
      onChangeState={onStateChange}
    />
  );
}
