// ui/src/pages/Home.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthBar from '../components/AuthBar';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { FLAGS } from '../lib/flags';
import { useToast } from '../components/Toast';
import { PLATFORM_META } from '../lib/platform';
import { NeuSurface, NeuButton, NeuInput, NeuIconWrapper, PlatformIcon } from '../components/base';

function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

export default function Home() {
  const [inputUrl, setInputUrl] = useState('');
  const [song, setSong] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

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

      <header style={{ textAlign: 'center', marginBottom: 8 }}>
        <h1 style={{
          fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-1px',
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 8,
        }}>MusicOne</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Paste any streaming link — find it on every platform
        </p>
      </header>

      {status !== 'done' && (
        <NeuSurface size="lg" style={{ width: '100%', maxWidth: 560, padding: '28px 28px 24px', marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Streaming URL
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <NeuInput
              icon={<LinkIcon />}
              type="url"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              placeholder="https://open.spotify.com/track/…"
            />
            <NeuButton
              variant="primary"
              type="submit"
              icon={<ArrowRight />}
              style={{ width: '100%' }}
            >
              Search all platforms
            </NeuButton>
          </form>
        </NeuSurface>
      )}

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--muted)', marginTop: 32 }}>
          <div className="spinner" />
          <span style={{ fontSize: '0.9rem' }}>Fetching song info…</span>
        </div>
      )}

      {status === 'error' && (
        <NeuSurface style={{ textAlign: 'center', maxWidth: 420, marginTop: 32, padding: 28 }}>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>{errorMsg}</p>
          <NeuButton variant="ghost" onClick={handleReset} icon={<BackIcon />}>Try another link</NeuButton>
        </NeuSurface>
      )}

      {status === 'done' && song && (
        <>
          <NeuSurface style={{ width: '100%', maxWidth: 560, padding: '22px 26px', marginTop: 24, display: 'flex', alignItems: 'center', gap: 18 }}>
            <NeuIconWrapper size={58} radius={16}>
              <MusicIcon />
            </NeuIconWrapper>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'var(--surface)', borderRadius: 20, padding: '4px 10px',
                boxShadow: 'var(--recessed)', fontSize: '0.68rem', fontWeight: 700,
                letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
              }}>
                ✦ Found
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 2 }}>{song.title}</div>
              <div style={{ fontSize: '0.87rem', color: 'var(--muted)' }}>{song.artist}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <NeuButton variant="ghost" onClick={copyPageLink} icon={<CopyIcon />} style={{ padding: '10px 14px' }} />
              <NeuButton variant="ghost" onClick={handleReset} icon={<BackIcon />} style={{ padding: '10px 14px' }} />
            </div>
          </NeuSurface>

          <div style={{ width: '100%', maxWidth: 560, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginTop: 24 }}>
            Open on your platform
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))', gap: 14, width: '100%', maxWidth: 560 }}>
            {Object.entries(PLATFORM_META).map(([key, p]) => {
              const directUrl = song?.platformLinks?.[key];
              const href = directUrl || p.searchUrl(q);
              const isDirect = !!directUrl;
              return (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius)',
                    padding: '18px 14px',
                    textAlign: 'center',
                    boxShadow: 'var(--raised)',
                    textDecoration: 'none',
                    color: 'var(--text)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 9,
                    transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--raised-lg)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--raised)'; e.currentTarget.style.transform = ''; }}
                  onMouseDown={e => { e.currentTarget.style.boxShadow = 'var(--pressed)'; e.currentTarget.style.transform = 'none'; }}
                  onMouseUp={e => { e.currentTarget.style.boxShadow = 'var(--raised)'; }}
                >
                  <NeuIconWrapper size={48} radius={14}>
                    <PlatformIcon platform={key} size={22} />
                  </NeuIconWrapper>
                  <div style={{ fontSize: '0.81rem', fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: '0.7rem', color: isDirect ? 'var(--accent)' : 'var(--muted)', fontWeight: isDirect ? 700 : 500 }}>
                    {isDirect ? 'Open ↗' : 'Search ↗'}
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}

      {FLAGS.JAM_SESSION && user && (
        <div style={{ marginTop: 40, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Want to listen together?</p>
          <NeuButton variant="primary" style={{ width: '100%' }} onClick={() => navigate('/jam/new')}>
            Start a Jam Session
          </NeuButton>
        </div>
      )}
    </div>
  );
}
