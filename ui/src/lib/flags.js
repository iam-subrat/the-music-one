export const FLAGS = {
  JAM_SESSION:         JSON.parse(__FLAG_JAM_SESSION__),
  VOTE_TO_SKIP:        JSON.parse(__FLAG_VOTE_TO_SKIP__),
  DJ_TOKEN:            JSON.parse(__FLAG_DJ_TOKEN__),
  YOUTUBE_EMBED:       JSON.parse(__FLAG_YOUTUBE_EMBED__),
  AUTO_PLAY_QUEUE:     JSON.parse(__FLAG_AUTO_PLAY_QUEUE__),
  PLATFORM_AUTODETECT: JSON.parse(__FLAG_PLATFORM_AUTODETECT__),
  REACTIONS:           JSON.parse(__FLAG_REACTIONS__),
  CHAT:                JSON.parse(__FLAG_CHAT__),
  SESSION_HISTORY:     JSON.parse(__FLAG_SESSION_HISTORY__),
  USER_PROFILES:       JSON.parse(__FLAG_USER_PROFILES__),
  SHARED_PLAYLISTS:    JSON.parse(__FLAG_SHARED_PLAYLISTS__),
  DISCOVERY_FEED:      JSON.parse(__FLAG_DISCOVERY_FEED__),
  TASTE_MATCHING:      JSON.parse(__FLAG_TASTE_MATCHING__),
  SCHEDULED_JAMS:      JSON.parse(__FLAG_SCHEDULED_JAMS__),
  QUEUE_RULES:         JSON.parse(__FLAG_QUEUE_RULES__),
  EMBED_WIDGET:        JSON.parse(__FLAG_EMBED_WIDGET__),
  PLAYLIST_IMPORT:     JSON.parse(__FLAG_PLAYLIST_IMPORT__),
};

export async function loadFlags() {
  try {
    const { API_BASE } = await import('./api.js');
    const res = await fetch(`${API_BASE}/api/flags/`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(({ key, enabled }) => {
      if (key in FLAGS) FLAGS[key] = enabled;
    });
  } catch { /* remote unavailable — static defaults remain */ }
}
