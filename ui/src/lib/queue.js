import { api } from './api';

export async function addToQueue(sessionId, url) {
  const res = await api(`/sessions/${sessionId}/queue`, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Failed to add to queue');
  }
  return res.json();
}

export async function searchAndAddToQueue(sessionId, name, artist) {
  const res = await api(`/sessions/${sessionId}/queue`, {
    method: 'POST',
    body: JSON.stringify({ name, artist: artist || undefined }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Could not find song.');
  }
  return res.json();
}

export async function getQueue(sessionId) {
  const res = await api(`/sessions/${sessionId}/queue`);
  return res.ok ? res.json() : [];
}

export async function playNext(sessionId) {
  const res = await api(`/sessions/${sessionId}/queue/next`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to advance queue');
  return res.json();
}

export async function forceSkip(sessionId) {
  const res = await api(`/sessions/${sessionId}/queue/skip`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to skip');
  return res.json();
}

export async function castSkipVote(queueItemId, threshold) {
  const res = await api(`/items/${queueItemId}/votes`, {
    method: 'POST',
    body: JSON.stringify({ threshold }),
  });
  if (!res.ok) throw new Error('Failed to cast vote');
  const data = await res.json();
  return data.skipped;
}

export async function removeSkipVote(queueItemId, _userId) {
  const res = await api(`/items/${queueItemId}/votes`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove vote');
}

export async function patchYouTubeLink(itemId, youtubeUrl) {
  await api(`/items/${itemId}/youtube-link`, {
    method: 'PUT',
    body: JSON.stringify({ youtube_url: youtubeUrl }),
  });
}
