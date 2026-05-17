import { useState } from 'react';
import { addToQueue } from '../lib/queue';
import { detectPlaylist } from '../lib/playlist';
import { detectPlatform } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { useToast } from './Toast';
import PlaylistModal from './PlaylistModal';
import { NeuSurface, NeuButton, NeuInput } from './base';

function MusicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

export default function AddSongForm({ sessionId, userId, profile, onPlatformDetected, onAdded }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState(null);
  const toast = useToast();

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    if (FLAGS.PLAYLIST_IMPORT && detectPlaylist(trimmed)) {
      setPlaylistUrl(trimmed);
      setUrl('');
      return;
    }
    setBusy(true);
    try {
      if (FLAGS.PLATFORM_AUTODETECT && !profile?.preferred_platform) {
        const platform = detectPlatform(trimmed);
        if (platform) onPlatformDetected(platform);
      }
      const item = await addToQueue(sessionId, trimmed);
      toast(`"${item.title}" added to queue`);
      setUrl('');
      onAdded?.(item);
    } catch (e) {
      toast(e.message || 'Could not add song.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NeuSurface style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Add to queue
        </div>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <NeuInput
            icon={<MusicIcon />}
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={FLAGS.PLAYLIST_IMPORT ? 'Paste a song or playlist URL…' : 'Paste a song URL…'}
            disabled={busy}
          />
          <NeuButton variant="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? '…' : 'Add to queue'}
          </NeuButton>
        </form>
      </NeuSurface>

      {playlistUrl && (
        <PlaylistModal
          url={playlistUrl}
          sessionId={sessionId}
          onAdded={onAdded}
          onClose={() => setPlaylistUrl(null)}
        />
      )}
    </>
  );
}
