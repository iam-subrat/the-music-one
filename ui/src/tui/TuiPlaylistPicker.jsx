import { useEffect, useRef, useState } from 'react';
import s from './tui.module.css';

const MAX_TRACKS = 50;

export default function TuiPlaylistPicker({ name, tracks, onConfirm, onCancel }) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState(() => new Set(tracks.map((_, i) => i)));
  const listRef = useRef(null);

  useEffect(() => {
    function handleKey(e) {
      const k = e.key;
      if (k === 'ArrowDown' || (k === 'j' && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        setCursor(c => Math.min(tracks.length - 1, c + 1));
      } else if (k === 'ArrowUp' || (k === 'k' && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        setCursor(c => Math.max(0, c - 1));
      } else if (k === ' ') {
        e.preventDefault();
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(cursor)) next.delete(cursor); else next.add(cursor);
          return next;
        });
      } else if (k === 'Enter') {
        e.preventDefault();
        const picks = tracks.filter((_, i) => selected.has(i));
        if (picks.length) onConfirm(picks);
      } else if (k === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (k.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSelected(new Set(tracks.map((_, i) => i)));
      } else if ((k.toLowerCase() === 'n' || k.toLowerCase() === 'd') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSelected(new Set());
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [cursor, selected, tracks, onConfirm, onCancel]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const selectedCount = selected.size;
  const overCap = selectedCount > MAX_TRACKS;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Playlist picker"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.78)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--tui-bg, #0c0c0c)',
          border: '1px solid var(--tui-fg-dim)',
          boxShadow: '0 0 40px rgba(95,255,175,0.15)',
          width: 'min(720px, 100%)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'inherit',
          color: 'var(--tui-fg)',
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--tui-fg-dim)',
            color: 'var(--tui-accent)',
            fontWeight: 600,
          }}
        >
          ┌─ playlist: {name} ─ ({tracks.length} tracks)
        </div>

        <div
          ref={listRef}
          style={{
            overflowY: 'auto',
            padding: '6px 0',
            flex: 1,
          }}
        >
          {tracks.map((t, i) => {
            const isCursor = i === cursor;
            const isOn = selected.has(i);
            return (
              <div
                key={i}
                data-row={i}
                onClick={() => {
                  setCursor(i);
                  setSelected(prev => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  });
                }}
                style={{
                  padding: '3px 14px',
                  cursor: 'pointer',
                  background: isCursor ? 'rgba(95,255,175,0.12)' : 'transparent',
                  color: isOn ? 'var(--tui-fg)' : 'var(--tui-fg-dim)',
                  display: 'flex',
                  gap: 10,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <span style={{ color: isCursor ? 'var(--tui-accent)' : 'var(--tui-fg-mute)' }}>
                  {isCursor ? '▶' : ' '}
                </span>
                <span style={{ color: isOn ? 'var(--tui-accent)' : 'var(--tui-fg-mute)' }}>
                  [{isOn ? 'x' : ' '}]
                </span>
                <span style={{ color: 'var(--tui-fg-mute)', minWidth: 28 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.title}
                  <span style={{ color: 'var(--tui-fg-mute)' }}> — {t.artist || 'unknown'}</span>
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--tui-fg-dim)',
            fontSize: 11.5,
            color: 'var(--tui-fg-dim)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <kbd className={s.hint && ''} style={kbdStyle}>↑/↓</kbd> nav ·{' '}
            <kbd style={kbdStyle}>space</kbd> toggle ·{' '}
            <kbd style={kbdStyle}>a</kbd> all ·{' '}
            <kbd style={kbdStyle}>n</kbd> none ·{' '}
            <kbd style={kbdStyle}>enter</kbd> add ·{' '}
            <kbd style={kbdStyle}>esc</kbd> cancel
          </div>
          <div style={{ color: overCap ? 'var(--tui-amber)' : 'var(--tui-accent)' }}>
            {selectedCount}/{tracks.length} selected
            {overCap && ` · cap=${MAX_TRACKS}`}
          </div>
        </div>
      </div>
    </div>
  );
}

const kbdStyle = {
  background: 'rgba(95,255,175,0.08)',
  border: '1px solid var(--tui-fg-dim)',
  padding: '1px 5px',
  borderRadius: 3,
  fontSize: 10.5,
  fontFamily: 'inherit',
  color: 'var(--tui-fg)',
};
