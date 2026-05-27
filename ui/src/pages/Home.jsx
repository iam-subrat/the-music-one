import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthBar from "../components/AuthBar";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { FLAGS } from "../lib/flags";
import { useToast, ToastProvider } from "../components/Toast";
import { PLATFORM_META } from "../lib/platform";
import s from "./home.module.css";
import { useAnalytics } from "../lib/analytics";

export default function Home() {
  return (
    <ToastProvider>
      <HomeContent />
    </ToastProvider>
  );
}

function HomeContent() {
  const [inputUrl, setInputUrl] = useState("");
  const [song, setSong] = useState(null); // { title, artist }
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { capture } = useAnalytics();

  // Pre-fill from ?url= query param
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const u = p.get("url");
    if (u) {
      setInputUrl(u);
      runSearch(u);
    }
  }, []);

  async function runSearch(url) {
    capture("lookup_started");
    setStatus("loading");
    setSong(null);
    try {
      const res = await api(`/song/?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Song lookup failed (${res.status})`);
      const meta = await res.json();
      setSong(meta);
      setStatus("done");
      capture("lookup_succeeded", {
        platform_count: Object.keys(meta.platformLinks ?? {}).length,
      });
      history.replaceState({}, "", `?url=${encodeURIComponent(url)}`);
    } catch (err) {
      setErrorMsg(err.message || "Failed to fetch song info.");
      setStatus("error");
      capture("lookup_failed", { error: err.message });
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    const trimmed = inputUrl.trim();
    try {
      capture("url_pasted", { url_domain: new URL(trimmed).hostname });
    } catch {
      /* non-URL input — skip domain capture */
    }
    runSearch(trimmed);
  }

  function handleReset() {
    setSong(null);
    setStatus("idle");
    setInputUrl("");
    history.replaceState({}, "", "/");
  }

  function copyPageLink() {
    navigator.clipboard
      .writeText(location.href)
      .then(() => toast("Link copied!"));
  }

  const q = song ? `${song.title} ${song.artist}` : "";

  return (
    <div className="page">
      <AuthBar />

      <header className={s.hero}>
        <h1 className={s.heroTitle}>MusicOne</h1>
        <p className={s.heroSub}>
          Paste any streaming link — listen on every platform
        </p>
      </header>

      {status !== "done" && (
        <form onSubmit={handleSubmit} className={s.searchForm}>
          <div className={s.inputGroup}>
            <SearchIcon className={s.inputIcon} />
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Spotify, YouTube Music, Apple Music…"
              className={s.searchInput}
              autoFocus
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          <button type="submit" className={`btn ${s.searchBtn}`}>
            Find on all platforms
          </button>
        </form>
      )}

      {status === "loading" && (
        <div className={`${s.loadingState} animate-fade-in`}>
          <div className="spinner" />
          <span>Looking up song…</span>
        </div>
      )}

      {status === "error" && (
        <div className={`${s.errorState} animate-fade-in-up`}>
          <div className={s.errorIcon}>✦</div>
          <p className={s.errorMsg}>{errorMsg}</p>
          <button
            onClick={handleReset}
            className="btn btn-ghost"
            style={{ marginTop: 8 }}
          >
            ← Try another link
          </button>
        </div>
      )}

      {status === "done" && song && (
        <div
          className="animate-fade-in-up"
          style={{
            width: "100%",
            maxWidth: 760,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
          }}
        >
          <div className={s.songCard}>
            {song.thumbnailUrl && (
              <img
                src={song.thumbnailUrl}
                alt={song.title}
                className={s.songThumb}
              />
            )}
            <div className={s.songInfo}>
              <div className={s.songFoundBadge}>Found</div>
              <h2 className={s.songTitle}>{song.title}</h2>
              <p className={s.songArtist}>{song.artist}</p>
            </div>
            <div className={s.songActions}>
              <button
                onClick={copyPageLink}
                className="btn btn-ghost"
                style={{ fontSize: "0.82rem", padding: "8px 14px" }}
              >
                <CopyIcon /> Share
              </button>
              <button
                onClick={handleReset}
                className="btn btn-ghost"
                style={{ fontSize: "0.82rem", padding: "8px 14px" }}
              >
                ← New
              </button>
            </div>
          </div>

          <div className={s.platformGrid}>
            {Object.entries(PLATFORM_META).map(([key, p], i) => {
              const directUrl = song?.platformLinks?.[key];
              const href = directUrl || p.searchUrl(q);
              const isDirect = !!directUrl;
              const iconSrc = p.iconSvgUrl || p.iconUrl;
              return (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${s.platformCard} ${isDirect ? s.platformCardDirect : ""}`}
                  style={{
                    "--platform-color": p.color,
                    animationDelay: `${i * 40}ms`,
                  }}
                  title={isDirect ? `Open on ${p.name}` : `Search on ${p.name}`}
                  onClick={() =>
                    capture("platform_link_clicked", {
                      platform: key,
                      song_title: song?.title,
                    })
                  }
                >
                  <div className={s.platformIconWrap}>
                    {iconSrc ? (
                      <img
                        src={iconSrc}
                        width={24}
                        height={24}
                        alt={p.name}
                        className={s.platformImg}
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextSibling &&
                            (e.target.nextSibling.style.display = "block");
                        }}
                      />
                    ) : null}
                    <span
                      className={s.platformFallback}
                      style={{ color: p.color }}
                    >
                      {p.name.slice(0, 2)}
                    </span>
                  </div>
                  <span className={s.platformName}>{p.name}</span>
                  <span
                    className={`${s.platformBadge} ${isDirect ? s.platformBadgeDirect : s.platformBadgeSearch}`}
                  >
                    {isDirect ? "Open ↗" : "Search ↗"}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {FLAGS.JAM_SESSION && user && (
        <div className={s.jamCta}>
          <p className={s.jamCtaText}>Want to listen together?</p>
          <button
            className="btn"
            style={{ width: "100%" }}
            onClick={() => navigate("/jam/new")}
          >
            Start a Jam Session
          </button>
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="4"
        width="8"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M3 9H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
