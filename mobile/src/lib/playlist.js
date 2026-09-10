import { api } from './api';

/**
 * Returns { platform, id } if url is a Spotify or YouTube playlist, else null.
 */
export function detectPlaylist(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'open.spotify.com') {
      const parts = parsed.pathname.split('/');
      const idx = parts.indexOf('playlist');
      if (idx !== -1 && parts[idx + 1]) {
        return { platform: 'spotify', id: parts[idx + 1] };
      }
      return null;
    }

    if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
      const listId = parsed.searchParams.get('list');
      if (listId) return { platform: 'youtube', id: listId };
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetches playlist preview from backend.
 * Returns { name, platform, tracks: [{ title, artist, url, thumbnail_url }] }
 */
export async function fetchPlaylistPreview(url) {
  const res = await api(`/playlists/preview?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Could not load playlist.');
  }
  return res.json();
}

/**
 * Adds selected tracks to queue via batch endpoint.
 * tracks: [{ url, title, artist, thumbnail_url }]
 */
export async function addPlaylistBatch(sessionId, tracks) {
  const res = await api(`/sessions/${sessionId}/queue/batch`, {
    method: 'POST',
    body: JSON.stringify({ tracks }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Failed to add tracks.');
  }
  return res.json();
}
