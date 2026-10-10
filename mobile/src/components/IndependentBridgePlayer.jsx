import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const origin = 'https://themusic.one';
export default forwardRef(function IndependentBridgePlayer(props, ref) {
  const frame = useRef(null), latest = useRef(props), ready = useRef(false);
  const snapshot = useRef({ time: 0, duration: 0, state: -1 });
  const ended = useRef(false);
  useEffect(() => { latest.current = props; }, [props]);
  function send(message) { frame.current?.contentWindow?.postMessage(message, origin); }
  function load() {
    if (!ready.current) return;
    ended.current = false;
    snapshot.current = { time: 0, duration: 0, state: -1 };
    send({ type: latest.current.autoplayOnChange ? 'LOAD' : 'CUE', videoId: latest.current.videoId });
  }
  useImperativeHandle(ref, () => ({
    play: () => { ended.current = false; send({ type: 'PLAY' }); },
    pause: () => send({ type: 'PAUSE' }),
    seek: time => { snapshot.current.time = time; send({ type: 'SEEK', time }); },
    replay: () => { ended.current = false; send({ type: 'SEEK', time: 0 }); send({ type: 'PLAY' }); },
    getTime: () => snapshot.current.time, getDuration: () => snapshot.current.duration,
    getState: () => snapshot.current.state,
  }), []);
  useEffect(() => {
    const receive = event => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (data?.type === 'READY') {
        if (data.protocol !== 2) { latest.current.onError?.('Update the hosted player before using Shared Queue'); return; }
        ready.current = true; load(); return;
      }
      if (!data || data.videoId !== latest.current.videoId) return;
      if (data.type === 'PROGRESS') snapshot.current = { ...snapshot.current, time: data.currentTime, duration: data.duration };
      if (data.type === 'STATE_CHANGE') {
        snapshot.current.state = data.state;
        snapshot.current.duration = data.duration || snapshot.current.duration;
        if (data.state === 5) latest.current.onReady?.();
        if (data.state === 0 && !ended.current) { ended.current = true; latest.current.onEnded?.(); }
      }
      if (data.type === 'ERROR') latest.current.onError?.('This song is unavailable on this device');
      if (data.type === 'BLOCKED') latest.current.onBlocked?.();
    };
    window.addEventListener('message', receive);
    return () => { send({ type: 'PAUSE' }); window.removeEventListener('message', receive); };
  }, []);
  useEffect(load, [props.videoId, props.playbackKey]);
  return <iframe ref={frame} src={origin + '/bridge'} allow="autoplay" title="Your song player"
    style={{ position: 'fixed', width: 10, height: 10, opacity: 0.01, pointerEvents: 'none', bottom: 0 }} />;
});
