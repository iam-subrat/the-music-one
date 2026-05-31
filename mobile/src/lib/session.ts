import { api } from './api';
import { getClientId } from './clientId';

export interface SessionData {
  id: string;
  invite_code: string;
  host_user_id: string;
  dj_user_id: string;
  status: string;
  repeat_mode: 'none' | 'song' | 'queue';
}

export async function createSession(): Promise<SessionData> {
  const res = await api('/sessions/', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function getSessionByCode(code: string): Promise<SessionData | null> {
  const res = await api(`/sessions/${code}`);
  return res.ok ? res.json() : null;
}

export async function joinSession(sessionId: string): Promise<void> {
  const client_id = await getClientId();
  await api(`/sessions/${sessionId}/join`, {
    method: 'POST',
    body: JSON.stringify({ client_id }),
  });
}

export async function leaveSession(sessionId: string): Promise<void> {
  const client_id = await getClientId();
  await api(`/sessions/${sessionId}/leave`, {
    method: 'DELETE',
    body: JSON.stringify({ client_id }),
  });
}

export async function endSession(sessionId: string): Promise<void> {
  const res = await api(`/sessions/${sessionId}/end`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to end session');
}

export async function setRepeatMode(sessionId: string, mode: 'none' | 'song' | 'queue'): Promise<void> {
  const res = await api(`/sessions/${sessionId}/repeat-mode`, {
    method: 'PATCH',
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error('Failed to set repeat mode');
}

export async function passDjToken(sessionId: string, newDjUserId: string): Promise<void> {
  const res = await api(`/sessions/${sessionId}/dj`, {
    method: 'POST',
    body: JSON.stringify({ new_dj_user_id: newDjUserId }),
  });
  if (!res.ok) throw new Error('Failed to pass DJ token');
}
