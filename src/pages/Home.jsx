import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthBar from '../components/AuthBar';
import { useAuth } from '../hooks/useAuth';
import { fetchSongMeta } from '../lib/odesli';
import { FLAGS } from '../lib/flags';
import { useToast } from '../components/Toast';

const PLATFORMS = [
  { name: 'Spotify',       slug: 'spotify',       color: '#1DB954', url: q => `https://open.spotify.com/search/${q}` },
  { name: 'Apple Music',   slug: 'applemusic',    color: '#FC3C44', url: q => `https://music.apple.com/search?term=${q}` },
  { name: 'YouTube Music', slug: 'youtubemusic',  color: '#FF0000', url: q => `https://music.youtube.com/search?q=${q}` },
  { name: 'Amazon Music',  slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=music.amazon.com&sz=64', color: '#00A8E1', url: q => `https://music.amazon.in/search/${q}` },
  { name: 'Tidal',         slug: 'tidal',         color: '#00FFFF', url: q => `https://tidal.com/search?q=${q}` },
  { name: 'Deezer',        slug: 'deezer',        color: '#FEAA2D', url: q => `https://www.deezer.com/search/${q}` },
  { name: 'SoundCloud',    slug: 'soundcloud',    color: '#FF5500', url: q => `https://soundcloud.com/search?q=${q}` },
  { name: 'JioSaavn',      slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=jiosaavn.com&sz=64', color: '#2BC5B4', url: q => `https://www.jiosaavn.com/search/${q}` },
  { name: 'Gaana',         slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=gaana.com&sz=64',    color: '#E72C30', url: q => `https://gaana.com/search/${q}` },
];

export default function Home() {
  const [inputUrl, setInputUrl] = useState('');
  const [song, setSong] = useState(null);       // { title, artist }
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // Pre-fill from ?url= query param
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const u = p.get('url');
    if (u) { setInputUrl(u); runSearch(u); }
  }, []);

  async function runSearch(url) {
    setStatus('loading');
    setSong(null);
    try {
      const meta = await fetchSongMeta(url);
      setSong(meta);
      setStatus('done');
      history.replaceState({}, '', `?url=${encodeURIComponent(url)}`);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to fetch song info.');
      setStatus('error');
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    runSearch(inputUrl.trim());
  }

  function handleReset() {
    setSong(null);
    setStatus('idle');
    setInputUrl('');
    history.replaceState({}, '', '/');
  }

  function copyPageLink() {
    navigator.clipboard.writeText(location.href).then(() => toast('Link copied!'));
  }

  const q = song ? encodeURIComponent(`${song.title} ${song.artist}`) : '';

  return (
    <div className="page">
      <AuthBar />

      <header style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #fff 30%, var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          MusicOne
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: '0.9rem' }}>Paste any streaming link — search it on every platform</p>
      </header>

      {status !== 'done' && (
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Streaming URL (Spotify, YouTube Music, Apple Music…)</label>
          <input
            type="url"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="https://open.spotify.com/track/..."
            style={{ width: '100%', padding: '14px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.95rem', outline: 'none' }}
          />
          <button type="submit" className="btn">Find on all platforms</button>
        </form>
      )}

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--muted)', marginTop: 32 }}>
          <div className="spinner" />
          <span>Fetching song info…</span>
        </div>
      )}

      {status === 'error' && (
        <div style={{ textAlign: 'center', maxWidth: 420, marginTop: 32 }}>
          <div style={{ fontSize: '2rem', marginBottom: 10 }}>⚠️</div>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>{errorMsg}</p>
          <p style={{ marginTop: 12 }}><a onClick={handleReset} style={{ color: 'var(--accent)', cursor: 'pointer' }}>← Try another link</a></p>
        </div>
      )}

      {status === 'done' && song && (
        <>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>Found song</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{song.title}</div>
            <div style={{ fontSize: '1rem', color: 'var(--muted)', marginTop: 4 }}>{song.artist}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={copyPageLink} className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 16px' }}>📋 Copy page link</button>
              <button onClick={handleReset} className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 16px' }}>← New search</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, width: '100%', maxWidth: 800 }}>
            {PLATFORMS.map(p => (
              <a key={p.name} href={p.url(q)} target="_blank" rel="noopener noreferrer"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)', transition: 'border-color 0.2s, transform 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = ''; }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: p.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={p.slug ? `https://cdn.simpleicons.org/${p.slug}/${p.color.replace('#','')}` : p.iconUrl}
                    width={28} height={28} alt={p.name}
                    onError={e => { e.target.replaceWith(Object.assign(document.createElement('span'), { textContent: p.name.slice(0,2), style: `font-size:0.8rem;font-weight:700;color:${p.color}` })); }}
                  />
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }}>{p.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Search ↗</div>
              </a>
            ))}
          </div>
        </>
      )}

      {FLAGS.JAM_SESSION && user && (
        <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid var(--border)', width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Want to listen together?</p>
          <button className="btn" style={{ width: '100%' }} onClick={() => navigate('/jam/new')}>
            Start a Jam Session
          </button>
        </div>
      )}
    </div>
  );
}
