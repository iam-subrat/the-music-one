import { useState } from 'react';
import s from '../styles/jam.module.css';
import { addToQueue, searchAndAddToQueue } from '../lib/queue';
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
  const [searchMode, setSearchMode] = useState(false);
  const [songName, setSongName] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const toast = useToast();
  const { capture } = useAnalytics();

  async function handleAdd(e) {
    e.preventDefault();
    if (busy) return;

    if (FLAGS.SONG_SEARCH && searchMode) {
      const name = songName.trim();
      if (!name) return;
      setBusy(true);
      try {
        const item = await searchAndAddToQueue(sessionId, name, songArtist.trim());
        capture('song_added', { source: 'search', has_youtube: !!(item.platform_links?.youtube) });
        toast(`"${item.title}" added to queue`);
        setSongName('');
        setSongArtist('');
        onAdded?.(item);
      } catch (err) {
        toast(err.message || 'Could not find song.');
      } finally {
        setBusy(false);
      }
      return;
    }

    const trimmed = url.trim();
    if (!trimmed) return;

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
      {FLAGS.SONG_SEARCH && (
        <div className={s.searchModeToggle}>
          <button
            type="button"
            className={`${s.modeBtn} ${!searchMode ? s.modeBtnActive : ''}`}
            onClick={() => setSearchMode(false)}
          >
            URL
          </button>
          <button
            type="button"
            className={`${s.modeBtn} ${searchMode ? s.modeBtnActive : ''}`}
            onClick={() => setSearchMode(true)}
          >
            Search
          </button>
        </div>
      )}

      {FLAGS.SONG_SEARCH && searchMode ? (
        <form className={s.searchForm} onSubmit={handleAdd}>
          <input
            className={s.addInput}
            type="text"
            value={songName}
            onChange={e => setSongName(e.target.value)}
            placeholder="Song name…"
            disabled={busy}
            required
          />
          <input
            className={s.addInput}
            type="text"
            value={songArtist}
            onChange={e => setSongArtist(e.target.value)}
            placeholder="Artist (optional)…"
            disabled={busy}
          />
          <button type="submit" className="btn" disabled={busy || !songName.trim()}>
            {busy ? '…' : 'Search & Add'}
          </button>
        </form>
      ) : (
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
      )}

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
