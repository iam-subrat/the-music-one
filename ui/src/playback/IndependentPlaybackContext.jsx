import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useJamPlayback } from './JamPlaybackContext';
import { eligibleItems, nextItem, previousItem, readCheckpoint } from './independentQueue';
import { api } from '../lib/api';

const Context = createContext(null);
const empty = { item: null, videoId: null, intent: false, started: false, repeat: 'none', error: '', loading: false, atEnd: false };
function roomActive(room) {
  return room?.active && (!room.session.expires_at || Date.parse(room.session.expires_at) > Date.now());
}
async function defaultResolve(item) {
  const response = await api(`/items/${item.id}/resolve-playback`, { method: 'POST' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Could not play this song');
  return data;
}

export function IndependentPlaybackProvider({ children, resolveItem = defaultResolve, capable = true }) {
  const playback = useJamPlayback();
  const [state, setState] = useState(empty);
  const stateRef = useRef(state);
  const roomRef = useRef(null);
  const token = useRef(0);
  const failedRef = useRef([]);
  const restoreTime = useRef(0);
  const checkpointKey = useRef(null);
  const checkpointUser = useRef(null);
  const stateUpdate = useCallback(update => {
    const next = typeof update === 'function' ? update(stateRef.current) : update;
    stateRef.current = next;
    setState(next);
  }, []);
  const save = useCallback(() => {
    const local = stateRef.current;
    if (!checkpointKey.current || !local.item || local.loading) return;
    try { sessionStorage.setItem(checkpointKey.current, JSON.stringify({ schema: 1,
      epoch: roomRef.current?.session.playback_mode_version ?? 0, itemId: local.item.id,
      time: playback.getTime(), repeat: local.repeat })); } catch { /* Storage may be unavailable. */ }
  }, [playback.getTime]);

  const select = useCallback(async (item, intent = true, checkpoint = null) => {
    const room = roomRef.current;
    if (!roomActive(room) || !item || item.status === 'skipped') return;
    const request = ++token.current;
    playback.pause();
    restoreTime.current = checkpoint?.time ?? 0;
    stateUpdate(s => ({ ...s, item: { ...item }, intent, started: s.started || intent, repeat: checkpoint?.repeat ?? s.repeat, error: '', loading: true, atEnd: false }));
    try {
      sessionStorage.setItem(checkpointKey.current, JSON.stringify({ schema: 1,
        epoch: room.session.playback_mode_version ?? 0, itemId: item.id,
        time: checkpoint?.time ?? 0, repeat: stateRef.current.repeat }));
    } catch { /* Storage may be unavailable. */ }
    try {
      const resolved = await resolveItem(item);
      if (request !== token.current || !roomActive(roomRef.current)) return;
      failedRef.current = failedRef.current.filter(id => id !== item.id);
      stateUpdate(s => ({ ...s, videoId: resolved.video_id, loading: false }));
      return true;
    } catch (error) {
      if (request !== token.current) return;
      failedRef.current = [...new Set([...failedRef.current, item.id])];
      stateUpdate(s => ({ ...s, intent: false, videoId: null, loading: false, error: error.message }));
      return false;
    }
  }, [playback.pause, resolveItem, stateUpdate]);

  const next = useCallback(async () => {
    const room = roomRef.current;
    if (!roomActive(room)) return;
    const intent = stateRef.current.intent;
    for (let attempts = 0; attempts < room.items.length; attempts++) {
      const local = stateRef.current;
      const target = nextItem(roomRef.current.items, local.item, local.repeat, failedRef.current);
      if (!target) break;
      const result = await select(target, intent);
      if (result !== false || roomRef.current?.key !== room.key || !roomRef.current?.active) return;
    }
      ++token.current; playback.pause();
      stateUpdate(s => ({ ...s, intent: false, atEnd: true }));
  }, [playback.pause, select, stateUpdate]);
  const endedToken = useRef(-1);
  const ended = useCallback(() => {
    if (!roomActive(roomRef.current) || endedToken.current === token.current) return;
    endedToken.current = token.current;
    if (stateRef.current.repeat === 'song') {
      endedToken.current = -1;
      playback.replay();
    } else next();
  }, [next, playback.replay]);
  const previous = useCallback(() => {
    if (!roomActive(roomRef.current)) return;
    const intent = stateRef.current.intent;
    if (playback.getTime() > 3) { playback.seek(0); if (intent) playback.play(); return; }
    select(previousItem(roomRef.current.items, stateRef.current.item), intent);
  }, [playback.getTime, playback.seek, playback.play, select]);

  const configure = useCallback(({ session, items, userId, ready }) => {
    if (!ready) return;
    if (userId) checkpointUser.current = userId;
    const active = !!(capable && userId && session?.playback_mode === 'independent' && session.status === 'active'
      && (!session.expires_at || Date.parse(session.expires_at) > Date.now()));
    const key = `${userId}:${session?.id}:${session?.playback_mode_version ?? 0}`;
    const changed = roomRef.current?.key !== key || roomRef.current?.active !== active;
    const previouslyActive = roomRef.current?.active;
    if (changed) save();
    roomRef.current = { key, session, items, userId, active };
    if (!changed) {
      if (active && !stateRef.current.item && eligibleItems(items)[0]) select(eligibleItems(items)[0], false);
      return;
    }
    ++token.current;
    if (active) playback.clearPlayback();
    else if (previouslyActive) { playback.pause(); playback.clearPlayback(session?.id, 'independent'); }
    failedRef.current = []; restoreTime.current = 0;
    checkpointKey.current = active ? `musicone:independent:${userId}:${session.id}` : null;
    stateUpdate(!capable && session?.playback_mode === 'independent' ? { ...empty, error: 'Embedded playback is disabled' } : empty);
    if (active) {
      let checkpoint;
      try { checkpoint = readCheckpoint(sessionStorage.getItem(checkpointKey.current), session.playback_mode_version ?? 0); } catch { /* No checkpoint. */ }
      const eligible = eligibleItems(items);
      const initial = eligible.find(item => item.id === checkpoint?.itemId)
        ?? eligible.find(item => item.status === 'playing') ?? eligible[0];
      if (initial) {
        select(initial, false, checkpoint);
      }
    }
  }, [capable, save, playback.clearPlayback, select, stateUpdate]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room?.active || !state.item || state.loading) return;
    const epoch = token.current;
    const onReady = () => {
      if (epoch !== token.current || !roomRef.current?.active) return;
      if (restoreTime.current > 0) {
        playback.seek(Math.min(restoreTime.current, playback.getDuration() || restoreTime.current));
        restoreTime.current = 0;
      }
      if (stateRef.current.intent && !stateRef.current.loading) playback.play();
      else playback.pause();
    };
    playback.registerPlayback({ owner: 'independent', independent: true, sessionId: room.session.id,
      modeVersion: room.session.playback_mode_version ?? 0, queueItemId: state.item.id,
      playbackKey: token.current,
      videoId: state.videoId, enabled: !!state.videoId, autoplayOnChange: state.intent && !state.loading,
      metadata: { title: state.item.title, artist: state.item.artist, artwork: state.item.thumbnail_url },
      onEnded: () => { if (epoch === token.current) ended(); }, onNext: next, onPrevious: previous,
      onReady, onError: message => { if (epoch === token.current) stateUpdate(s => ({ ...s, error: message, intent: false })); },
      onBlocked: () => { if (epoch === token.current) stateUpdate(s => ({ ...s, error: 'Press Play to continue', intent: false })); } });
  }, [state.item?.id, state.videoId, state.intent, state.loading, ended, next, previous, playback.registerPlayback, stateUpdate, save]);

  useEffect(() => {
    const id = setInterval(save, 5000);
    window.addEventListener('pagehide', save);
    return () => { clearInterval(id); window.removeEventListener('pagehide', save); };
  }, [save]);

  const play = useCallback(() => {
    if (!roomActive(roomRef.current)) return;
    const local = stateRef.current;
    if (!local.item) { select(eligibleItems(roomRef.current.items)[0]); return; }
    if (!local.videoId || (local.error && local.error !== 'Press Play to continue')) { select(local.item); return; }
    endedToken.current = -1;
    stateUpdate(s => ({ ...s, intent: true, started: true, error: '', atEnd: false })); playback.play();
  }, [select, stateUpdate, playback.play]);
  const pause = useCallback(() => { stateUpdate(s => ({ ...s, intent: false })); playback.pause(); save(); }, [stateUpdate, playback.pause, save]);
  const repeat = useCallback(value => { if (['none', 'song', 'queue'].includes(value)) { stateUpdate(s => ({ ...s, repeat: value })); save(); } }, [stateUpdate, save]);
  const reset = useCallback((forget = false) => {
    const userId = roomRef.current?.userId ?? checkpointUser.current;
    save(); ++token.current; roomRef.current = null; checkpointKey.current = null;
    if (forget && userId) {
      try {
        const prefix = `musicone:independent:${userId}:`;
        Object.keys(sessionStorage).filter(key => key.startsWith(prefix)).forEach(key => sessionStorage.removeItem(key));
      } catch { /* Storage may be unavailable. */ }
      checkpointUser.current = null;
    }
    stateUpdate(empty); playback.clearPlayback();
  }, [save, stateUpdate, playback.clearPlayback]);
  useEffect(() => {
    const logout = () => reset(true);
    window.addEventListener('musicone:logout', logout);
    return () => window.removeEventListener('musicone:logout', logout);
  }, [reset]);
  const value = useMemo(() => ({ state, configure, select, next, previous, play, pause, repeat, reset,
    seek: playback.seek, getTime: playback.getTime, getDuration: playback.getDuration, getState: playback.getState }),
  [state, configure, select, next, previous, play, pause, repeat, reset, playback.seek, playback.getTime, playback.getDuration, playback.getState]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useIndependentPlayback(session, items, userId, ready = true) {
  const value = useContext(Context);
  if (!value) throw new Error('IndependentPlaybackProvider is required');
  useEffect(() => { value.configure({ session, items, userId, ready }); }, [value.configure, session, items, userId, ready]);
  useEffect(() => {
    if (!session?.expires_at || session.playback_mode !== 'independent') return;
    const timer = setTimeout(() => value.configure({ session: { ...session, status: 'ended' }, items, userId, ready: true }),
      Math.max(0, Date.parse(session.expires_at) - Date.now()));
    return () => clearTimeout(timer);
  }, [value.configure, session, items, userId]);
  return value;
}

export function useIndependentControls() { return useContext(Context); }
