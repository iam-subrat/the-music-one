import { supabase } from './supabase';

export async function addToQueue(sessionId, userId, meta) {
  // position is GENERATED ALWAYS AS IDENTITY in DB — no JS-side calculation needed,
  // eliminates race condition from simultaneous inserts.
  const { data, error } = await supabase.from('queue_items').insert({
    session_id: sessionId,
    added_by_user_id: userId,
    title: meta.title,
    artist: meta.artist,
    thumbnail_url: meta.thumbnailUrl ?? null,
    platform_links: meta.platformLinks,
    status: 'queued',
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getQueue(sessionId) {
  const { data, error } = await supabase
    .from('queue_items')
    // Explicit FK hint avoids silent join failure when schema cache is stale
    .select('*, profiles!queue_items_added_by_user_id_fkey(display_name, avatar_url)')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });
  if (error) console.error('getQueue error:', error.message);
  return data ?? [];
}

export async function playNext(sessionId) {
  await supabase.from('queue_items').update({ status: 'played' }).eq('session_id', sessionId).eq('status', 'playing');
  const { data: next } = await supabase
    .from('queue_items').select('*').eq('session_id', sessionId).eq('status', 'queued')
    .order('position', { ascending: true }).limit(1);
  if (!next?.length) return null;
  const { data, error } = await supabase.from('queue_items').update({ status: 'playing' }).eq('id', next[0].id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function forceSkip(sessionId) {
  await supabase.from('queue_items').update({ status: 'skipped' }).eq('session_id', sessionId).eq('status', 'playing');
  return playNext(sessionId);
}

export async function castSkipVote(queueItemId, userId) {
  await supabase.from('skip_votes').upsert({ queue_item_id: queueItemId, user_id: userId });
  const { count } = await supabase.from('skip_votes').select('*', { count: 'exact', head: true }).eq('queue_item_id', queueItemId);
  return count ?? 0;
}
