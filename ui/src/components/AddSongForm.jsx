import { useState } from 'react';
import s from '../styles/jam.module.css';
import { addToQueue } from '../lib/queue';
import { detectPlaylist } from '../lib/playlist';
import { detectPlatform } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { useToast } from './Toast';
import { useAnalytics } from '../lib/analytics';
import PlaylistModal from './PlaylistModal';

export default function AddSongForm({ sessionId, userId, profile, onPlatformDetected, onAdded }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState(null);
  const toast = useToast();
  const { capture } = useAnalytics();

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || busy) return;

    if (FLAGS.PLAYLIST_IMPORT && detectPlaylist(trimmed)) {
      capture('feature_used', { feature: 'playlist_import' });
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
      const platform = detectPlatform(trimmed) ?? 'unknown';
      const hasYoutube = !!(item.platform_links?.youtube || item.platform_links?.youtubemusic);
      capture('song_added', { platform, has_youtube: hasYoutube });
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
      <form className={s.addForm} onSubmit={handleAdd}>
        <input
          className={s.addInput}
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={
            FLAGS.PLAYLIST_IMPORT
              ? 'Paste a song or playlist URL…'
              : 'Paste a song URL to add to queue…'
          }
          disabled={busy}
        />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? '…' : 'Add'}
        </button>
      </form>

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
