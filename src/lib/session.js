import { supabase } from './supabase';

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function createSession(userId) {
  let invite_code;
  for (let i = 0; i < 5; i++) {
    invite_code = genCode();
    const { data } = await supabase.from('sessions').select('id').eq('invite_code', invite_code).maybeSingle();
    if (!data) break;
  }
  const { data, error } = await supabase
    .from('sessions')
    .insert({ invite_code, host_user_id: userId, dj_user_id: userId, status: 'active' })
    .select().single();
  if (error) throw new Error(error.message);
  await joinSession(data.id, userId);
  return data;
}

export async function getSessionByCode(code) {
  const { data } = await supabase.from('sessions').select('*').eq('invite_code', code.toUpperCase()).single();
  return data ?? null;
}

export async function joinSession(sessionId, userId) {
  await supabase.from('session_participants').upsert({ session_id: sessionId, user_id: userId });
}

export async function leaveSession(sessionId, userId) {
  await supabase.from('session_participants').delete().eq('session_id', sessionId).eq('user_id', userId);
}

export async function endSession(sessionId) {
  const { error } = await supabase.from('sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function setRepeat(sessionId, value) {
  const { error } = await supabase.from('sessions').update({ repeat: value }).eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function passDjToken(sessionId, newDjUserId) {
  const { error } = await supabase.rpc('pass_dj_token', {
    p_session_id: sessionId,
    p_new_dj_user_id: newDjUserId,
  });
  if (error) throw new Error(error.message);
}

export async function getParticipants(sessionId) {
  const { data } = await supabase
    .from('session_participants')
    .select('user_id, joined_at, profiles(id, display_name, avatar_url, preferred_platform)')
    .eq('session_id', sessionId);
  return (data ?? []).map(p => ({ ...p.profiles, joined_at: p.joined_at }));
}
