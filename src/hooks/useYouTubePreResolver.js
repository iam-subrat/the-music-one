import { useEffect } from 'react';
import { extractYouTubeId } from '../lib/platform';
import { resolveToYouTubeId } from '../lib/youtube';
import { patchYouTubeLink } from '../lib/queue';
import { FLAGS } from '../lib/flags';

function needsResolution(item) {
  if (item.status !== 'queued') return false;
  const ytUrl = item.platform_links?.youtube || item.platform_links?.youtubemusic;
  return !extractYouTubeId(ytUrl);
}

/**
 * Scans queued items for missing direct YouTube links and resolves them
 * via SearXNG in the background — sequentially to avoid hammering the proxy.
 * Persists resolved URLs to DB so all clients benefit via realtime.
 */
export function useYouTubePreResolver(items) {
  // Stable key: only re-run when the set of unresolved item IDs changes.
  const pendingKey = items?.filter(needsResolution).map(i => i.id).join(',') ?? '';

  useEffect(() => {
    if (!FLAGS.AUTO_PLAY_QUEUE || !pendingKey) return;

    const pending = items.filter(needsResolution);
    let cancelled = false;

    (async () => {
      for (const item of pending) {
        if (cancelled) break;
        const { id } = await resolveToYouTubeId(`${item.title} ${item.artist}`);
        if (cancelled) break;
        if (id) {
          await patchYouTubeLink(
            item.id,
            item.platform_links,
            `https://www.youtube.com/watch?v=${id}`,
          );
        }
        // Throttle: avoid hammering SearXNG proxy
        await new Promise(r => setTimeout(r, 500));
      }
    })();

    return () => { cancelled = true; };
  }, [pendingKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
