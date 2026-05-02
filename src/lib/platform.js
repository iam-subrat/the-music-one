export const PLATFORM_MAP = {
  'open.spotify.com': 'spotify',
  'spotify.com': 'spotify',
  'music.apple.com': 'applemusic',
  'music.youtube.com': 'youtubemusic',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'tidal.com': 'tidal',
  'deezer.com': 'deezer',
  'soundcloud.com': 'soundcloud',
  'jiosaavn.com': 'jiosaavn',
  'gaana.com': 'gaana',
  'music.amazon.com': 'amazonmusic',
  'music.amazon.in': 'amazonmusic',
};

export const PLATFORM_META = {
  spotify:      { name: 'Spotify',       color: '#1DB954', slug: 'spotify' },
  applemusic:   { name: 'Apple Music',   color: '#FC3C44', slug: 'applemusic' },
  youtubemusic: { name: 'YouTube Music', color: '#FF0000', slug: 'youtubemusic' },
  youtube:      { name: 'YouTube',       color: '#FF0000', slug: 'youtube' },
  tidal:        { name: 'Tidal',         color: '#00FFFF', slug: 'tidal' },
  deezer:       { name: 'Deezer',        color: '#FEAA2D', slug: 'deezer' },
  soundcloud:   { name: 'SoundCloud',    color: '#FF5500', slug: 'soundcloud' },
  jiosaavn:     { name: 'JioSaavn',      color: '#2BC5B4', slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=jiosaavn.com&sz=64' },
  gaana:        { name: 'Gaana',         color: '#E72C30', slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=gaana.com&sz=64' },
  amazonmusic:  { name: 'Amazon Music',  color: '#00A8E1', slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=music.amazon.com&sz=64' },
};

/** Returns platform key from URL string, or null. */
export function detectPlatform(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return PLATFORM_MAP[hostname] ?? null;
  } catch { return null; }
}

/**
 * Returns { platform, url } for user's preferred platform,
 * falling back to YouTube then first available.
 */
export function preferredLink(platformLinks, preferredPlatform) {
  if (preferredPlatform && platformLinks[preferredPlatform])
    return { platform: preferredPlatform, url: platformLinks[preferredPlatform] };
  if (platformLinks.youtube)
    return { platform: 'youtube', url: platformLinks.youtube };
  if (platformLinks.youtubemusic)
    return { platform: 'youtubemusic', url: platformLinks.youtubemusic };
  const first = Object.entries(platformLinks).find(([, v]) => v);
  return first ? { platform: first[0], url: first[1] } : null;
}

/** Extracts YouTube video ID from a YouTube URL, or null. */
export function extractYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    return u.searchParams.get('v');
  } catch { return null; }
}
