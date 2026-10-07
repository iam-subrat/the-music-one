import { api } from './api';

export async function createSession(playbackMode = 'dj') {
  const res = await api('/sessions/', { method: 'POST', body: JSON.stringify({ playback_mode: playbackMode }) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to create session');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function setPlaybackMode(sessionId, mode, version) {
  const response = await api('/sessions/' + sessionId + '/playback-mode', {
    method: 'PATCH', body: JSON.stringify({ mode, expected_version: version }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Could not change room mode');
  return data;
}

export async function getSessionByCode(code) {
  const res = await api(`/sessions/${code}`);
  return res.ok ? res.json() : null;
}

export async function joinSession(sessionId) {
  await api(`/sessions/${sessionId}/join`, { method: 'POST' });
}

export async function leaveSession(sessionId) {
  await api(`/sessions/${sessionId}/leave`, { method: 'DELETE' });
}

export async function endSession(sessionId) {
  const res = await api(`/sessions/${sessionId}/end`, { method: 'PATCH' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to end session');
    err.status = res.status;
    throw err;
  }
}

export async function setRepeatMode(sessionId, mode) {
  const res = await api(`/sessions/${sessionId}/repeat-mode`, {
    method: 'PATCH',
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to set repeat mode');
    err.status = res.status;
    throw err;
  }
}

export async function setAutoPilot(sessionId, enabled) {
  const res = await api(`/sessions/${sessionId}/auto-pilot`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to set auto pilot');
    err.status = res.status;
    throw err;
  }
}

export async function passDjToken(sessionId, newDjUserId) {
  const res = await api(`/sessions/${sessionId}/dj`, {
    method: 'POST',
    body: JSON.stringify({ new_dj_user_id: newDjUserId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || 'Failed to pass DJ token');
    err.status = res.status;
    throw err;
  }
}

export async function getParticipants(sessionId) {
  const res = await api(`/sessions/${sessionId}/participants`);
  return res.ok ? res.json() : [];
}
