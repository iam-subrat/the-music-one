import { useState } from 'react';
import s from '../styles/jam.module.css';
import { addToQueue } from '../lib/queue';
import { detectPlatform } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { useToast } from './Toast';

export default function AddSongForm({ sessionId, userId, profile, onPlatformDetected, onAdded }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function handleAdd(e) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      if (FLAGS.PLATFORM_AUTODETECT && !profile?.preferred_platform) {
        const platform = detectPlatform(url.trim());
        if (platform) onPlatformDetected(platform);
      }
      const item = await addToQueue(sessionId, url.trim());
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
    <form className={s.addForm} onSubmit={handleAdd}>
      <input
        className={s.addInput}
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="Paste a song URL to add to queue…"
        disabled={busy}
      />
      <button type="submit" className="btn" disabled={busy}>
        {busy ? '…' : 'Add'}
      </button>
    </form>
  );
}
