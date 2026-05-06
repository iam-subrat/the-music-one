import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';

export function useYouTubePreResolver(nowPlaying) {
  const [resolved, setResolved] = useState({});
  const lastIdRef = useRef(null);

  useEffect(() => {
    if (!nowPlaying?.id || nowPlaying.id === lastIdRef.current) return;
    lastIdRef.current = nowPlaying.id;

    const query = `${nowPlaying.title} ${nowPlaying.artist}`;
    api(`/youtube/?q=${encodeURIComponent(query)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.id) setResolved(prev => ({ ...prev, [nowPlaying.id]: data.id }));
      })
      .catch(() => {});
  }, [nowPlaying?.id]);

  return resolved;
}
