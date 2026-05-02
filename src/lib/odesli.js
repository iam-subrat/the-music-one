const PROXY_URL = import.meta.env.VITE_PROXY_URL;

/**
 * Fetches song metadata from Odesli via proxy.
 * Returns { title, artist, thumbnailUrl, platformLinks } or throws.
 * platformLinks: flat object { spotify: 'https://...', applemusic: 'https://...', ... }
 */
export async function fetchSongMeta(streamUrl) {
  const res = await fetch(`${PROXY_URL}?url=${encodeURIComponent(streamUrl)}`);
  if (!res.ok) throw new Error(`Odesli API error ${res.status}`);

  const data = await res.json();
  const key = data.entityUniqueId ?? Object.keys(data.entitiesByUniqueId)[0];
  const entity = data.entitiesByUniqueId[key];
  if (!entity) throw new Error('Could not identify song from this URL.');

  const platformLinks = {};
  for (const [platform, info] of Object.entries(data.linksByPlatform ?? {})) {
    // Normalize to lowercase so keys match PLATFORM_META (Odesli returns camelCase: appleMusic, youtubeMusic)
    if (info.url) platformLinks[platform.toLowerCase()] = info.url;
  }

  return {
    title: entity.title,
    artist: entity.artistName,
    thumbnailUrl: entity.thumbnailUrl ?? null,
    platformLinks,
  };
}
