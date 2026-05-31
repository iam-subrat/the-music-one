import { api } from './api';

interface PlaylistDetectResult {
  platform: 'spotify' | 'youtube';
  id: string;
}

export function detectPlaylist(url: string): PlaylistDetectResult | null {
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

    if (
      host === 'youtube.com' ||
      host === 'youtu.be' ||
      host === 'music.youtube.com'
    ) {
      const listId = parsed.searchParams.get('list');
      if (listId) return { platform: 'youtube', id: listId };
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

export interface PlaylistTrack {
  title: string;
  artist: string;
  url: string;
  thumbnail_url?: string;
}

export interface PlaylistPreview {
  name: string;
  platform: string;
  tracks: PlaylistTrack[];
}

export async function fetchPlaylistPreview(url: string): Promise<PlaylistPreview> {
  const res = await api(`/playlists/preview?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || 'Could not load playlist.');
  }
  return res.json();
}

export async function addPlaylistBatch(
  sessionId: string,
  tracks: PlaylistTrack[],
): Promise<unknown> {
  const res = await api(`/sessions/${sessionId}/queue/batch`, {
    method: 'POST',
    body: JSON.stringify({ tracks }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || 'Failed to add tracks.');
  }
  return res.json();
}
