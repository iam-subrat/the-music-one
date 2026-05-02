const PROXY = import.meta.env.VITE_SEARXNG_PROXY_URL;

/**
 * Resolves a search query to a YouTube videoId via SearXNG proxy.
 * Returns { id, title } or { id: null, title: null } on failure.
 */
export async function resolveToYouTubeId(query) {
  if (!PROXY) return { id: null, title: null };
  try {
    const res = await fetch(`${PROXY}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { id: null, title: null };
    const { url, title } = await res.json();
    if (!url) return { id: null, title: null };
    const id = extractVideoIdFromUrl(url);
    return { id, title: title ?? null };
  } catch {
    return { id: null, title: null };
  }
}

function extractVideoIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}
