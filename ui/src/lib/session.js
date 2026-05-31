import { api } from './api';
import { getClientId } from './clientId';

export async function createSession() {
  const res = await api('/sessions/', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function getSessionByCode(code) {
  const res = await api(`/sessions/${code}`);
  return res.ok ? res.json() : null;
}

export async function joinSession(sessionId) {
  await api(`/sessions/${sessionId}/join`, {
    method: 'POST',
    body: JSON.stringify({ client_id: getClientId() }),
  });
}

export async function leaveSession(sessionId) {
  await api(`/sessions/${sessionId}/leave`, {
    method: 'DELETE',
    body: JSON.stringify({ client_id: getClientId() }),
  });
}

export async function endSession(sessionId) {
  const res = await api(`/sessions/${sessionId}/end`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to end session');
}

export async function setRepeatMode(sessionId, mode) {
  const res = await api(`/sessions/${sessionId}/repeat-mode`, {
    method: 'PATCH',
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error('Failed to set repeat mode');
}

export async function passDjToken(sessionId, newDjUserId) {
  const res = await api(`/sessions/${sessionId}/dj`, {
    method: 'POST',
    body: JSON.stringify({ new_dj_user_id: newDjUserId }),
  });
  if (!res.ok) throw new Error('Failed to pass DJ token');
}

export async function getParticipants(sessionId) {
  const res = await api(`/sessions/${sessionId}/participants`);
  return res.ok ? res.json() : [];
}
