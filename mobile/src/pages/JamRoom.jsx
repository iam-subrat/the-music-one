import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSession } from "../hooks/useSession";
import { useQueue } from "../hooks/useQueue";
import { useParticipants } from "../hooks/useParticipants";
import {
  addToQueue,
  searchAndAddToQueue,
  playSpecificSong,
  playNext,
} from "../lib/queue";
import { endSession, setRepeatMode } from "../lib/session";
import PlayerControls from "../components/PlayerControls";
import { Search, Users, Copy, Check, Music, ArrowLeft, X } from "lucide-react";

export default function JamRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const { session, loading: sessionLoading, setSession } = useSession(code);
  const { items: queueItems, refresh } = useQueue(session?.id);
  const { participants } = useParticipants(session?.id);

  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  // For "End Session" analytics guard
  const joinedAtRef = useRef(null);
  useEffect(() => {
    if (session?.id && !joinedAtRef.current) {
      joinedAtRef.current = Date.now();
    }
  }, [session?.id]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login?next=/jam/" + code);
  }, [user, authLoading, code, navigate]);

  // ── Ended session screen ───────────────────────────────────────────────────
  if (authLoading || sessionLoading) {
    return (
      <div className="screen bg-[#f4f5f0] items-center justify-center">
        <div className="w-16 h-16 border-4 border-black border-t-lime-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="screen bg-[#f4f5f0] items-center px-6">
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm w-full mx-auto text-center">
          <h1 className="text-3xl font-black mb-2">Jam not found</h1>
          <p className="font-medium text-gray-600 mb-6">
            This room doesn't exist or has ended.
          </p>
          <button
            onClick={() => navigate("/")}
            className="brutal-btn w-full py-4"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // ── Ended session screen ───────────────────────────────────────────────────
  if (session.status === "ended") {
    const played = queueItems.filter((i) =>
      ["played", "playing", "skipped"].includes(i.status),
    );
    return (
      <div className="screen bg-[#f4f5f0]">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-2xl font-black">Session ended</p>
          <p className="font-medium text-gray-600 mt-1">
            {played.length} song{played.length !== 1 ? "s" : ""} played
          </p>
          <button
            onClick={() => navigate("/")}
            className="brutal-btn w-full max-w-sm py-4 mt-6"
          >
            Back to Home
          </button>
        </div>
        {played.length > 0 && (
          <div className="overflow-y-auto px-6 pb-6 flex flex-col gap-3 max-h-[40%]">
            {played.map((item) => (
              <div key={item.id} className="brutal-card p-3 flex gap-3">
                <div className="w-10 h-10 bg-black rounded flex items-center justify-center shrink-0">
                  <Music className="text-lime-accent" size={20} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">{item.title}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {item.artist}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  // Mirror exactly how the web computes isHost: only the session host_user_id.
  // Do NOT mix in dj_user_id — that grants separate DJ controls on the web.
  const isHost = session.host_user_id === user?.id;
  const isDJ = session.dj_user_id === user?.id || isHost;

  const playingItem = queueItems.find((i) => i.status === "playing") ?? null;

  // ── Repeat mode: read from server session, write back via API ─────────────
  const repeatMode = session.repeat_mode ?? "none";
  const handleRepeatModeChange = (next) => {
    // Optimistic local update so the UI responds immediately
    setSession((prev) => ({ ...prev, repeat_mode: next }));
    setRepeatMode(session.id, next).catch(() => {
      // Roll back on failure
      setSession((prev) => ({ ...prev, repeat_mode: repeatMode }));
    });
  };

  // ── Queue display: upcoming only (same as web getUpcoming) ────────────────
  function getUpcoming(items, mode) {
    if (mode !== "queue") return items.filter((i) => i.status === "queued");
    const playing = items.find((i) => i.status === "playing");
    const eligible = items.filter(
      (i) => i.status !== "skipped" && i.status !== "playing",
    );
    if (!playing) return eligible;
    const after = eligible.filter((i) => i.position > playing.position);
    const before = eligible.filter((i) => i.position < playing.position);
    return [...after, ...before];
  }

  const upcomingItems = getUpcoming(queueItems, repeatMode);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsAdding(true);
    try {
      const text = query.trim();
      if (text.startsWith("http://") || text.startsWith("https://")) {
        await addToQueue(session.id, text);
      } else {
        await searchAndAddToQueue(session.id, text, "");
      }
      // Bug 1 fix: do NOT call addItem() optimistically — it races with
      // the server-authoritative refresh() and scrambles queue order.
      // refresh() + SSE queue_changed delivers the correct ordered list.
      await refresh();
      setQuery("");
    } catch (err) {
      console.error(err);
      alert(`Could not add song: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleEndSession = async () => {
    if (!window.confirm("End this jam for everyone?")) return;
    try {
      await endSession(session.id);
      navigate("/");
    } catch (e) {
      alert("Failed to end session: " + e.message);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="screen bg-[#f4f5f0]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="p-4 border-b-2 border-black bg-white sticky top-0 z-10 flex justify-between items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/")}
            className="bg-white border-2 border-black rounded-lg p-2 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="text-xs font-bold tracking-wider text-green-800 uppercase">
              Jam Session
            </div>
            <h1 className="text-xl font-black truncate">{session.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Invite code copy */}
          <button
            onClick={copyCode}
            className="brutal-card p-2 flex items-center gap-2 hover:bg-gray-50 active:scale-95"
          >
            {copied ? (
              <Check size={18} className="text-green-600" />
            ) : (
              <Copy size={18} />
            )}
            <span className="font-bold text-sm">{code}</span>
          </button>

          {/* Bug 3 fix: End Session button — host only, mirrors web JamRoom.jsx */}
          {isHost && (
            <button
              onClick={handleEndSession}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white border-2 border-black rounded-lg font-bold text-sm active:scale-95 transition-transform shadow-[2px_2px_0_0_rgba(0,0,0,1)]"
            >
              <X size={16} />
              End
            </button>
          )}
        </div>
      </header>

      {/* ── Main content — flex-1 scrolls only within the remaining screen height */}
      <main className="flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-32">
        {/* Participants */}
        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
          {participants.map((p) => (
            <div
              key={p.id}
              className="brutal-card px-4 py-2 flex items-center gap-2 whitespace-nowrap shrink-0 bg-lime-accent/20"
            >
              <Users size={16} />
              <span className="font-bold text-sm">{p.display_name}</span>
            </div>
          ))}
        </div>

        {/* Search / Add song */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="relative">
            <input
              className="w-full brutal-card px-4 py-4 pr-12 text-lg font-bold outline-none focus:ring-4 focus:ring-lime-accent"
              placeholder="Search to add a song..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isAdding}
            />
            <button
              type="submit"
              disabled={isAdding || !query.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-lime-accent border-2 border-black rounded-lg flex items-center justify-center active:scale-90"
            >
              {isAdding ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Search size={20} />
              )}
            </button>
          </div>
        </form>

        {/* Start button when nothing is playing yet */}
        <h2 className="text-xl font-black mb-4">Up Next</h2>
        {!playingItem && queueItems.length > 0 && (
          <button
            onClick={() =>
              isDJ
                ? playNext(session.id)
                    .then(() => refresh())
                    .catch((e) => alert("Could not play: " + e.message))
                : alert("Only the host can start the jam!")
            }
            className="w-full bg-lime-accent border-2 border-black rounded-lg py-4 mb-4 text-lg font-black shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
          >
            Start Playing First Song
          </button>
        )}

        {/* Queue list — upcoming only (no played/skipped clutter) */}
        <div className="space-y-3">
          {upcomingItems.map((item, idx) => (
            <button
              key={item.id}
              onClick={() =>
                isDJ
                  ? playSpecificSong(session.id, item.id)
                      .then(() => refresh())
                      .catch((e) =>
                        alert("Could not skip to this song: " + e.message),
                      )
                  : null
              }
              disabled={!isDJ}
              className={`w-full text-left brutal-card p-4 flex items-center gap-4 transition-transform ${
                item.status === "playing"
                  ? "bg-lime-accent/50 border-lime-600 border-4"
                  : item.status === "played"
                    ? "opacity-50 hover:-translate-y-1"
                    : "hover:-translate-y-1"
              }`}
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0 font-black text-gray-400 text-sm">
                {item.status === "playing" ? "▶" : idx + 1}
              </div>
              <div className="w-12 h-12 bg-black rounded flex items-center justify-center shrink-0">
                {item.thumbnail_url ? (
                  <img
                    src={item.thumbnail_url}
                    alt=""
                    className="w-12 h-12 rounded object-cover"
                  />
                ) : (
                  <Music className="text-lime-accent" size={24} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg truncate">{item.title}</h3>
                <p className="text-sm font-medium text-gray-600 truncate">
                  {item.artist || "Unknown Artist"}
                </p>
                {item.status === "playing" && (
                  <span className="text-xs font-black uppercase text-lime-700 tracking-wider">
                    Now Playing
                  </span>
                )}
              </div>
            </button>
          ))}

          {upcomingItems.length === 0 && (
            <div className="text-center p-8 border-2 border-dashed border-gray-400 rounded-xl">
              <p className="font-bold text-gray-500">
                {repeatMode === "queue" && queueItems.length > 0
                  ? "Looping all songs…"
                  : "Queue is empty. Add a song!"}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ── Fixed player bar ───────────────────────────────────────────────── */}
      <PlayerControls
        session={session}
        playingItem={playingItem}
        isHost={isHost}
        isDJ={isDJ}
        queueItems={queueItems}
        refresh={refresh}
        userId={user?.id}
        participantCount={participants?.length || 1}
        repeatMode={repeatMode}
        onRepeatModeChange={handleRepeatModeChange}
      />
    </div>
  );
}
