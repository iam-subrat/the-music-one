import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { patchYouTubeLink } from "../lib/queue";
import { resolveYouTubeVideo } from "./resolveYouTubeVideo";

async function requestYouTube(query) {
  const response = await api(`/youtube/?q=${encodeURIComponent(query)}`);
  return response.ok ? response.json() : { id: null, title: null };
}

export function useResolvedYouTubeVideo(item, isDJ) {
  const [result, setResult] = useState({ videoId: null, resolvedTitle: null });
  const requestToken = useRef(0);

  useEffect(() => {
    const token = ++requestToken.current;
    if (!item || !isDJ) {
      setResult({ videoId: null, resolvedTitle: null });
      return undefined;
    }

    setResult({ videoId: null, resolvedTitle: null });
    resolveYouTubeVideo(item, requestYouTube)
      .then(({ videoId, title, persisted }) => {
        if (requestToken.current !== token) return;
        setResult({ videoId, resolvedTitle: title });
        if (persisted && videoId) {
          patchYouTubeLink(item.id, `https://www.youtube.com/watch?v=${videoId}`);
        }
      })
      .catch(() => {
        if (requestToken.current === token) {
          setResult({ videoId: null, resolvedTitle: null });
        }
      });

    return () => {
      if (requestToken.current === token) requestToken.current += 1;
    };
  }, [item?.id, isDJ]);

  return result;
}
