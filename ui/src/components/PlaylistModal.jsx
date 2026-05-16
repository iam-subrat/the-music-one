import { useState, useEffect } from 'react';
import s from '../styles/jam.module.css';
import { fetchPlaylistPreview, addPlaylistBatch } from '../lib/playlist';
import { useToast } from './Toast';

export default function PlaylistModal({ url, sessionId, onAdded, onClose }) {
  const [state, setState] = useState('loading'); // loading | loaded | adding | error
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchPlaylistPreview(url)
      .then(data => {
        if (cancelled) return;
        setPreview(data);
        setSelected(new Set(data.tracks.map((_, i) => i)));
        setState('loaded');
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message || 'Could not load playlist.');
        setState('error');
      });
    return () => { cancelled = true; };
  }, [url]);

  function toggleTrack(idx) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === preview.tracks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(preview.tracks.map((_, i) => i)));
    }
  }

  async function handleAdd() {
    if (!preview || selected.size === 0) return;
    setState('adding');
    const tracks = [...selected].map(i => preview.tracks[i]);
    try {
      const result = await addPlaylistBatch(sessionId, tracks);
      const count = result.added?.length ?? 0;
      toast(`Added ${count} song${count !== 1 ? 's' : ''} to queue.`);
      onClose();
    } catch (e) {
      toast(e.message || 'Failed to add tracks.');
      setState('loaded');
    }
  }

  return (
    <div className={s.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        {state === 'loading' && (
          <div className={s.modalLoading}>Loading playlist…</div>
        )}

        {state === 'error' && (
          <>
            <div className={s.modalError}>{error}</div>
            <div className={s.modalFooter}>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {(state === 'loaded' || state === 'adding') && preview && (
          <>
            <div className={s.modalHeader}>
              <div className={s.modalTitle}>{preview.name}</div>
              <div className={s.modalSubtitle}>
                {preview.platform === 'spotify' ? 'Spotify' : 'YouTube'} · {preview.tracks.length} tracks
              </div>
              <button className={s.modalSelectAll} onClick={toggleAll}>
                {selected.size === preview.tracks.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className={s.modalTrackList}>
              {preview.tracks.map((track, i) => (
                <div
                  key={i}
                  className={`${s.modalTrackRow} ${selected.has(i) ? s.modalTrackRowSelected : ''}`}
                  onClick={() => toggleTrack(i)}
                >
                  {track.thumbnail_url
                    ? <img className={s.modalTrackThumb} src={track.thumbnail_url} alt="" />
                    : <div className={s.modalTrackThumb} />}
                  <div className={s.modalTrackMeta}>
                    <div className={s.modalTrackTitle}>{track.title}</div>
                    <div className={s.modalTrackArtist}>{track.artist}</div>
                  </div>
                  <input
                    type="checkbox"
                    className={s.modalCheckbox}
                    checked={selected.has(i)}
                    onChange={() => toggleTrack(i)}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              ))}
            </div>

            <div className={s.modalFooter}>
              <button className="btn" onClick={onClose} disabled={state === 'adding'}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleAdd}
                disabled={selected.size === 0 || state === 'adding'}
              >
                {state === 'adding' ? 'Adding…' : `Add ${selected.size} Selected`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
