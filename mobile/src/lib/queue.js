import { api } from './api';

export async function addToQueue(sessionId, url) {
  const res = await api(`/sessions/${sessionId}/queue`, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to add to queue');
    err.status = res.status;
    throw err;
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
    const err = new Error(body.detail || 'Could not find song.');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function getQueue(sessionId) {
  const res = await api(`/sessions/${sessionId}/queue`);
  return res.ok ? res.json() : [];
}

export async function playNext(sessionId) {
  const res = await api(`/sessions/${sessionId}/queue/next`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to advance queue');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function forceSkip(sessionId) {
  const res = await api(`/sessions/${sessionId}/queue/skip`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to skip');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function castSkipVote(queueItemId, threshold) {
  const res = await api(`/items/${queueItemId}/votes`, {
    method: 'POST',
    body: JSON.stringify({ threshold }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to cast vote');
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.skipped;
}

export async function removeSkipVote(queueItemId, _userId) {
  const res = await api(`/items/${queueItemId}/votes`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to remove vote');
    err.status = res.status;
    throw err;
  }
}

export async function patchYouTubeLink(itemId, youtubeUrl) {
  await api(`/items/${itemId}/youtube-link`, {
    method: 'PUT',
    body: JSON.stringify({ youtube_url: youtubeUrl }),
  });
}

export async function playSpecificSong(sessionId, itemId) {
  const res = await api(`/sessions/${sessionId}/queue/items/${itemId}/play`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || "Failed to play specific song");
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function playPrevious(sessionId) {
  const res = await api(`/sessions/${sessionId}/queue/previous`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || "Failed to play previous song");
    err.status = res.status;
    throw err;
  }
  return res.json();
}
