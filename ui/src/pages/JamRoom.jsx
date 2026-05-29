import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AuthBar from "../components/AuthBar";
import NowPlaying from "../components/NowPlaying";
import QueueList from "../components/QueueList";
import QueueCard from "../components/QueueCard";
import ParticipantList from "../components/ParticipantList";
import InviteBadge from "../components/InviteBadge";
import { useAuth } from "../hooks/useAuth";
import { useSession } from "../hooks/useSession";
import { useQueue } from "../hooks/useQueue";
import { useParticipants } from "../hooks/useParticipants";
import { joinSession, endSession } from "../lib/session";
import { useAnalytics } from "../lib/analytics";
import { API_BASE } from "../lib/api";
import { ToastProvider } from "../components/Toast";
import s from "../styles/jam.module.css";

export default function JamRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const {
    user,
    profile,
    loading: authLoading,
    setPreferredPlatform,
  } = useAuth();
  const { session, loading: sessionLoading, setSession } = useSession(code);
  const {
    items: queueItems,
    refresh: refreshQueue,
    addItem,
  } = useQueue(session?.id);
  const { participants, refresh: refreshParticipants } = useParticipants(
    session?.id,
  );
  const { capture } = useAnalytics();
  const joinedAtRef = useRef(null);
  const activeSecondsRef = useRef(0);
  const lastVisibleAtRef = useRef(null);
  const songsHeardRef = useRef(0);
  const peakParticipantsRef = useRef(0);
  const didFireJoinRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) navigate(`/login?next=/jam/${code}`);
  }, [authLoading, user, navigate, code]);

  useEffect(() => {
    if (!session?.id || !user?.id || didFireJoinRef.current) return;
    didFireJoinRef.current = true;
    joinedAtRef.current = Date.now();
    lastVisibleAtRef.current =
      document.visibilityState === "visible" ? Date.now() : null;

    joinSession(session.id).then(() => {
      refreshParticipants();
      capture("jam_session_joined", {
        session_code: code,
        participant_count: participants.length + 1,
      });
      if (session.host_user_id === user.id) {
        capture("jam_session_created", { session_code: code });
      }
    });
  }, [session?.id, user?.id]);

  // Store session id in ref for cleanup
  const sessionIdRef = useRef(null);
  useEffect(() => {
    sessionIdRef.current = session?.id ?? null;
  }, [session?.id]);

  // Leave on SPA nav (unmount) or actual tab/browser close (pagehide).
  // Do NOT leave on visibilitychange:hidden — tab-switching fires that and
  // there is no re-join on return, causing false participant drops.
  useEffect(() => {
    const handlePageHide = () => {
      if (sessionIdRef.current) {
        navigator.sendBeacon(
          `${API_BASE}/api/sessions/${sessionIdRef.current}/leave`,
        );
      }
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (sessionIdRef.current && joinedAtRef.current) {
        const now = Date.now();
        const duration = Math.round((now - joinedAtRef.current) / 1000);
        const extraActive =
          lastVisibleAtRef.current !== null
            ? (now - lastVisibleAtRef.current) / 1000
            : 0;
        const active = Math.round(activeSecondsRef.current + extraActive);
        capture("jam_session_left", {
          session_code: code,
          duration_seconds: duration,
          active_seconds: active,
          songs_heard: songsHeardRef.current,
          peak_participants: peakParticipantsRef.current,
        });
      }
    };
  }, []);

  // 30s heartbeat to keep session alive
  useEffect(() => {
    if (!session?.id) return;
    const interval = setInterval(() => {
      fetch(`${API_BASE}/api/sessions/${session.id}/heartbeat`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [session?.id]);

  useEffect(() => {
    if (!session?.id) return;

    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        if (lastVisibleAtRef.current !== null) {
          activeSecondsRef.current +=
            (Date.now() - lastVisibleAtRef.current) / 1000;
          lastVisibleAtRef.current = null;
        }
        capture("jam_tab_hidden", { session_code: code });
      } else {
        lastVisibleAtRef.current = Date.now();
        capture("jam_tab_visible", { session_code: code });
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [session?.id]);

  useEffect(() => {
    if (participants.length > peakParticipantsRef.current) {
      peakParticipantsRef.current = participants.length;
    }
  }, [participants.length]);

  if (authLoading || sessionLoading) {
    return (
      <div className="page" style={{ justifyContent: "center" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!session) {
    return (
      <div
        className="page"
        style={{ justifyContent: "center", textAlign: "center" }}
      >
        <p style={{ color: "var(--muted)" }}>Session not found.</p>
        <a href="/" className="btn" style={{ marginTop: 20 }}>
          Go home
        </a>
      </div>
    );
  }

  if (session.status === "ended") {
    const played = queueItems.filter((i) =>
      ["played", "playing", "skipped"].includes(i.status),
    );
    return (
      <div className="page">
        <AuthBar />
        <div className={s.layout}>
          <div className={s.endedBanner}>
            <p style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8 }}>
              Session ended
            </p>
            <p>
              {played.length} song{played.length !== 1 ? "s" : ""} played
            </p>
            <a href="/" className="btn" style={{ marginTop: 20 }}>
              Back to Home
            </a>
          </div>
          {played.length > 0 && (
            <div style={{ gridColumn: "1/-1" }}>
              <p
                style={{
                  color: "var(--muted)",
                  fontSize: "0.85rem",
                  marginBottom: 12,
                }}
              >
                Songs played:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {played.map((item) => (
                  <QueueCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const nowPlaying = queueItems.find((i) => i.status === "playing") ?? null;
  console.log('[JamRoom] render', { queueCount: queueItems.length, nowPlayingId: nowPlaying?.id, title: nowPlaying?.title });
  const isDJ = session.dj_user_id === user?.id;
  const isHost = session.host_user_id === user?.id;

  return (
    <ToastProvider>
      <div className="page" style={{ padding: 0 }}>
        <AuthBar />
        <div className={s.layout}>
          <div className={s.jamHeader}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                Jam Session
              </h2>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <InviteBadge code={session.invite_code} />
              {isHost && (
                <button
                  className="btn btn-danger"
                  style={{ fontSize: "0.82rem", padding: "8px 14px" }}
                  onClick={async () => {
                    if (window.confirm("End this jam for everyone?")) {
                      const played = queueItems.filter((i) =>
                        ["played", "playing", "skipped"].includes(i.status),
                      );
                      capture("jam_session_ended", {
                        session_code: code,
                        total_songs: played.length,
                        peak_participants: peakParticipantsRef.current,
                        duration_seconds: joinedAtRef.current
                          ? Math.round(
                              (Date.now() - joinedAtRef.current) / 1000,
                            )
                          : 0,
                      });
                      await endSession(session.id);
                      navigate("/");
                    }
                  }}
                >
                  End Session
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <NowPlaying
              nowPlaying={nowPlaying}
              sessionId={session.id}
              isDJ={isDJ}
              preferredPlatform={profile?.preferred_platform}
              participantCount={participants.length}
              userId={user?.id}
              onQueueChange={refreshQueue}
              repeatMode={session.repeat_mode ?? "none"}
              onRepeatModeChange={(mode) =>
                setSession((prev) => ({ ...prev, repeat_mode: mode }))
              }
            />
            <QueueList
              items={queueItems}
              repeatMode={session.repeat_mode ?? "none"}
              sessionId={session.id}
              userId={user?.id}
              profile={profile}
              onPlatformDetected={setPreferredPlatform}
              onAdded={(item) => {
                addItem(item);
                refreshQueue();
              }}
            />
          </div>

          <div className={s.sidebar}>
            <ParticipantList
              participants={participants}
              session={session}
              currentUserId={user?.id}
            />
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
