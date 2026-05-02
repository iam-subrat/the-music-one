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
  spotify:      { name: 'Spotify',       color: '#1DB954', iconSvgUrl: 'https://cdn.simpleicons.org/spotify/1DB954',      searchUrl: q => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  applemusic:   { name: 'Apple Music',   color: '#FA2D48', iconSvgUrl: 'https://cdn.simpleicons.org/applemusic/FA2D48',   searchUrl: q => `https://music.apple.com/search?term=${encodeURIComponent(q)}` },
  youtubemusic: { name: 'YouTube Music', color: '#FF0000', iconSvgUrl: 'https://cdn.simpleicons.org/youtubemusic/FF0000', searchUrl: q => `https://music.youtube.com/search?q=${encodeURIComponent(q)}` },
  youtube:      { name: 'YouTube',       color: '#FF0000', iconSvgUrl: 'https://cdn.simpleicons.org/youtube/FF0000',      searchUrl: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  tidal:        { name: 'Tidal',         color: '#00FFFF', iconSvgUrl: 'https://cdn.simpleicons.org/tidal/00FFFF',        searchUrl: q => `https://tidal.com/search?q=${encodeURIComponent(q)}` },
  deezer:       { name: 'Deezer',        color: '#FEAA2D', iconSvgUrl: 'https://cdn.simpleicons.org/deezer/FEAA2D',       searchUrl: q => `https://www.deezer.com/search/${encodeURIComponent(q)}` },
  soundcloud:   { name: 'SoundCloud',    color: '#FF5500', iconSvgUrl: 'https://cdn.simpleicons.org/soundcloud/FF5500',   searchUrl: q => `https://soundcloud.com/search?q=${encodeURIComponent(q)}` },
  jiosaavn:     { name: 'JioSaavn',      color: '#2BC5B4', iconSvgUrl: null, iconUrl: 'https://www.google.com/s2/favicons?domain=jiosaavn.com&sz=64',      searchUrl: q => `https://www.jiosaavn.com/search/${encodeURIComponent(q)}` },
  gaana:        { name: 'Gaana',         color: '#E72C30', iconSvgUrl: null, iconUrl: 'https://www.google.com/s2/favicons?domain=gaana.com&sz=64',         searchUrl: q => `https://gaana.com/search/${encodeURIComponent(q)}` },
  amazonmusic:  { name: 'Amazon Music',  color: '#00A8E1', iconSvgUrl: 'https://cdn.simpleicons.org/amazonmusic/00A8E1',  searchUrl: q => `https://music.amazon.in/search/${encodeURIComponent(q)}` },
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

/** Returns true if URL is a YouTube or YouTube Music search results page. */
export function isYouTubeSearchUrl(url) {
  if (!url) return false;
  try {
    const { hostname, pathname, searchParams } = new URL(url);
    if (hostname.includes('music.youtube.com') && pathname === '/search') return true;
    if ((hostname.includes('youtube.com') || hostname.includes('youtu.be')) &&
        (pathname === '/results' || pathname === '/search') &&
        searchParams.has('q') || searchParams.has('search_query')) return true;
    return false;
  } catch { return false; }
}

/** Extracts the search query string from a YouTube / YouTube Music search URL. */
export function extractSearchQuery(url) {
  try {
    const { searchParams } = new URL(url);
    return searchParams.get('q') ?? searchParams.get('search_query') ?? null;
  } catch { return null; }
}
