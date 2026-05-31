import { api } from './api';

export interface QueueItem {
  id: string;
  session_id: string;
  title: string;
  artist: string;
  thumbnail_url?: string;
  platform_links: Record<string, string>;
  status: 'queued' | 'playing' | 'played' | 'skipped';
  resolve_status?: 'resolving' | 'resolved' | 'failed';
  position: number;
  profiles?: { display_name: string | null };
}

export async function addToQueue(sessionId: string, url: string): Promise<QueueItem> {
  const res = await api(`/sessions/${sessionId}/queue`, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? 'Failed to add to queue');
  }
  return res.json();
}

export async function searchAndAddToQueue(
  sessionId: string,
  name: string,
  artist?: string,
): Promise<QueueItem> {
  const res = await api(`/sessions/${sessionId}/queue`, {
    method: 'POST',
    body: JSON.stringify({ name, artist: artist || undefined }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? 'Could not find song.');
  }
  return res.json();
}

export async function playNext(sessionId: string): Promise<QueueItem> {
  const res = await api(`/sessions/${sessionId}/queue/next`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to advance queue');
  return res.json();
}

export async function castSkipVote(queueItemId: string, threshold: number): Promise<boolean> {
  const res = await api(`/items/${queueItemId}/votes`, {
    method: 'POST',
    body: JSON.stringify({ threshold }),
  });
  if (!res.ok) throw new Error('Failed to cast vote');
  const data = await res.json();
  return (data as { skipped: boolean }).skipped;
}

export async function removeSkipVote(queueItemId: string): Promise<void> {
  const res = await api(`/items/${queueItemId}/votes`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove vote');
}

export async function patchYouTubeLink(itemId: string, youtubeUrl: string): Promise<void> {
  await api(`/items/${itemId}/youtube-link`, {
    method: 'PUT',
    body: JSON.stringify({ youtube_url: youtubeUrl }),
  });
}
