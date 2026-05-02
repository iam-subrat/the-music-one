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
  const { data, error } = await supabase.rpc('play_next', {
    p_session_id: sessionId,
    p_skip_status: 'played',
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function forceSkip(sessionId) {
  const { data, error } = await supabase.rpc('play_next', {
    p_session_id: sessionId,
    p_skip_status: 'skipped',
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function castSkipVote(queueItemId, userId, threshold) {
  const { data, error } = await supabase.rpc('cast_skip_vote', {
    p_queue_item_id: queueItemId,
    p_user_id: userId,
    p_threshold: threshold,
  });
  if (error) throw new Error(error.message);
  return data; // boolean: true if song was skipped
}
