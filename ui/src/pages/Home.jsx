import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthBar from '../components/AuthBar';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { FLAGS } from '../lib/flags';
import { useToast } from '../components/Toast';
import { PLATFORM_META } from '../lib/platform';

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
      const res = await api(`/song/?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Song lookup failed (${res.status})`);
      const meta = await res.json();
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

  const q = song ? `${song.title} ${song.artist}` : '';

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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, width: '100%', maxWidth: 800 }}>
            {Object.entries(PLATFORM_META).map(([key, p]) => {
              const directUrl = song?.platformLinks?.[key];
              const href = directUrl || p.searchUrl(q);
              const isDirect = !!directUrl;
              const iconSrc = p.iconSvgUrl || p.iconUrl;
              return (
                <a key={key} href={href} target="_blank" rel="noopener noreferrer"
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${isDirect ? p.color + '55' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    padding: 'clamp(12px, 4vw, 20px) clamp(10px, 3vw, 16px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    textDecoration: 'none',
                    color: 'var(--text)',
                    transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
                    boxShadow: isDirect ? `0 0 0 1px ${p.color}33` : 'none',
                    opacity: isDirect ? 1 : 0.8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = p.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isDirect ? p.color + '55' : 'var(--border)'; e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = isDirect ? '1' : '0.8'; }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: p.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {iconSrc
                      ? <img src={iconSrc} width={24} height={24} alt={p.name} onError={e => { e.target.replaceWith(Object.assign(document.createElement('span'), { textContent: p.name.slice(0,2), style: `font-size:0.8rem;font-weight:700;color:${p.color}` })); }} />
                      : <span style={{ fontSize: '0.8rem', fontWeight: 700, color: p.color }}>{p.name.slice(0, 2)}</span>
                    }
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }}>{p.name}</div>
                  <div style={{ fontSize: '0.72rem', color: isDirect ? p.color : 'var(--muted)', fontWeight: isDirect ? 600 : 400 }}>
                    {isDirect ? 'Open ↗' : 'Search ↗'}
                  </div>
                </a>
              );
            })}
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
