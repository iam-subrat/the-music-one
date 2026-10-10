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
  castSkipVote,
  removeSkipVote,
} from "../lib/queue";
import { useSkipVotes } from "../hooks/useSkipVotes";
import { endSession, setRepeatMode, setAutoPilot, joinSession } from "../lib/session";
import { useIndependentPlayback } from "../../../ui/src/playback/IndependentPlaybackContext";
import IndependentControls from "../components/IndependentControls";
import PlaybackModeControl from "../components/PlaybackModeControl";
import { isAuthError, promptSignIn } from "../lib/authPrompt";
import PlayerControls from "../components/PlayerControls";
import { Search, Users, Copy, Check, Music, ArrowLeft, X } from "lucide-react";
import DeleteVoteButton from "../../../ui/src/components/DeleteVoteButton";

function QueueVoteButton({ item, sessionId, userId, participantCount, refresh, code }) {
  const { count, hasVoted } = useSkipVotes(item.id, userId, sessionId);
  const [isVoting, setIsVoting] = useState(false);
  const threshold = Math.floor(participantCount / 2) + 1;

  const vote = async () => {
    if (!userId) {
      promptSignIn("Please sign in to vote to delete this song from the queue.", `/jam/${code}`);
      return;
    }
    setIsVoting(true);
    try {
      if (hasVoted) {
        await removeSkipVote(item.id);
      } else {
        const skipped = await castSkipVote(item.id, threshold);
        if (skipped) await refresh();
      }
    } catch (error) {
      if (isAuthError(error)) {
        promptSignIn("Your session expired. Would you like to sign in again to vote to delete?", `/jam/${code}`);
      } else {
        alert(`Could not vote to delete: ${error.message}`);
      }
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <DeleteVoteButton
      title={item.title} count={count} threshold={threshold} hasVoted={hasVoted}
      onClick={vote}
      disabled={isVoting}
      className={`ml-auto shrink-0 inline-flex items-center gap-1.5 border-2 border-black rounded-lg px-2 py-2 text-xs font-black active:scale-95 ${hasVoted ? "bg-black text-lime-accent" : "bg-white"}`}
    />
  );
}

export default function JamRoom({ independentEnabled }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const { session, loading: sessionLoading, error: sessionError, setSession, refresh: refreshSession } = useSession(code);
  const { items: queueItems, refresh } = useQueue(session?.id);
  const { participants, refresh: refreshParticipants } = useParticipants(session?.id);
  const independent = session?.playback_mode === 'independent';
  const local = useIndependentPlayback(session, queueItems, user?.id,
    !authLoading && !sessionLoading && (!independent || participants.some(p => p.id === user?.id)));
  useEffect(() => {
    if (!user || !session?.id || session.status !== 'active') return;
    joinSession(session.id).then(data => {
      if (data.expires_at) setSession(prev => prev?.id === session.id ? { ...prev, expires_at: data.expires_at } : prev);
      refreshParticipants();
    }).catch(() => {});
  }, [user, session?.id, session?.status, refreshParticipants]);

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
          <h1 className="text-3xl font-black mb-2">{sessionError ? 'Could not load jam' : 'Jam not found'}</h1>
          <p className="font-medium text-gray-600 mb-6">
            {sessionError || "This room doesn't exist or has ended."}
          </p>
          {sessionError && <button type="button" onClick={refreshSession} className="brutal-btn w-full py-4 mb-3">Retry</button>}
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
  const isDJ = !independent && (session.dj_user_id === user?.id || isHost);

  const playingItem = queueItems.find((i) => i.status === "playing") ?? null;

  // ── Repeat mode: read from server session, write back via API ─────────────
  const repeatMode = session.repeat_mode ?? "none";
  const handleRepeatModeChange = async (next) => {
    // Optimistic local update so the UI responds immediately
    setSession((prev) => ({ ...prev, repeat_mode: next }));
    try {
      await setRepeatMode(session.id, next);
    } catch (e) {
      // Roll back on failure
      setSession((prev) => ({ ...prev, repeat_mode: repeatMode }));
      if (isAuthError(e)) {
        promptSignIn(
          "Your session expired. Would you like to sign in again to change playback settings?",
          `/jam/${code}`,
        );
      }
      throw e;
    }
  };

  const autoPilot = session.auto_pilot ?? false;
  const handleAutoPilotChange = (next) => {
    setSession((prev) => ({ ...prev, auto_pilot: next }));
    setAutoPilot(session.id, next).catch((e) => {
      setSession((prev) => ({ ...prev, auto_pilot: autoPilot }));
      if (isAuthError(e)) {
        promptSignIn(
          "Your session expired. Would you like to sign in again to change playback settings?",
          `/jam/${code}`,
        );
      }
    });
  };

  // ── Queue display: upcoming only ──────────────────────────────────────────
  function getUpcoming(items, mode) {
    if (!items || items.length === 0) return [];
    const playing = items.find((i) => i.status === "playing");

    if (mode === "song") {
      return playing ? [{ ...playing, status: "queued" }] : [];
    }

    const eligible = items.filter(
      (i) => i.status !== "skipped" && i.status !== "playing",
    );
    if (!playing) return eligible;

    // Songs after current playing position till the last song added
    const after = eligible
      .filter((i) => i.position > playing.position)
      .sort((a, b) => a.position - b.position);

    if (mode === "queue") {
      const before = eligible
        .filter((i) => i.position < playing.position)
        .sort((a, b) => a.position - b.position);
      return [...after, ...before];
    }

    return after;
  }

  const upcomingItems = independent ? queueItems.filter(item => item.status !== 'skipped').sort((a, b) => a.position - b.position) : getUpcoming(queueItems, repeatMode);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (!user) {
      promptSignIn(
        "You need to sign in to add songs to the queue. Would you like to sign in now?",
        `/jam/${code}`,
      );
      return;
    }
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
      if (isAuthError(err)) {
        promptSignIn(
          "Your session expired. Would you like to sign in again to add songs?",
          `/jam/${code}`,
        );
      } else {
        alert(`Could not add song: ${err.message}`);
      }
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
      if (isAuthError(e)) {
        promptSignIn(
          "Your session expired. Would you like to sign in again to end the session?",
          `/jam/${code}`,
        );
      } else {
        alert("Failed to end session: " + e.message);
      }
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
        {sessionError && <div role="alert" className="text-red-700 mb-4">
          {sessionError} <button type="button" className="underline font-bold" onClick={refreshSession}>Retry</button>
        </div>}
        <PlaybackModeControl session={session} userId={user?.id} enabled={independentEnabled} onChange={setSession} onRefresh={refreshSession} />
        {independent && <IndependentControls local={local} />}
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
        <h2 className="text-xl font-black mb-4">{independent ? 'Shared Queue' : 'Up Next'}</h2>
        {!independent && !playingItem && queueItems.length > 0 && (
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
            <div
              key={item.id}
              className={`w-full brutal-card p-4 flex flex-wrap items-center gap-4 transition-transform ${
                !independent && item.status === "played"
                  ? "opacity-50 hover:-translate-y-1"
                  : "hover:-translate-y-1"
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  independent ? local.select(item) : isDJ
                    ? playSpecificSong(session.id, item.id)
                        .then(() => refresh())
                        .catch((e) => {
                          if (isAuthError(e)) {
                            promptSignIn(
                              "Your session expired. Would you like to sign in again to control playback?",
                              `/jam/${code}`,
                            );
                          } else {
                            alert("Could not skip to this song: " + e.message);
                          }
                        })
                    : null
                }
                disabled={independent ? item.resolve_status === 'failed' || local.state.loading : !isDJ}
                className="min-w-0 w-full sm:w-auto sm:flex-1 flex items-center gap-4 text-left disabled:cursor-default"
              >
              <div className="w-8 h-8 flex items-center justify-center shrink-0 font-black text-gray-400 text-sm">
                {idx + 1}
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
                {independent && local.state.item?.id === item.id && <p className="text-xs font-bold text-green-800">On your device</p>}
                {independent && item.resolve_status === 'failed' && <p className="text-xs text-red-700">Unavailable</p>}
              </div>
              </button>
              {!independent && item.status === "queued" && (
                <QueueVoteButton
                  item={item}
                  sessionId={session.id}
                  userId={user?.id}
                  participantCount={participants.length}
                  refresh={refresh}
                  code={code}
                />
              )}
            </div>
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
      {!independent && <PlayerControls
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
        autoPilot={autoPilot}
        onAutoPilotChange={handleAutoPilotChange}
      />}
    </div>
  );
}
