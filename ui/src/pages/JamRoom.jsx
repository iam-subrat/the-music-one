import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthBar from '../components/AuthBar';
import NowPlaying from '../components/NowPlaying';
import QueueList from '../components/QueueList';
import QueueCard from '../components/QueueCard';
import ParticipantList from '../components/ParticipantList';
import InviteBadge from '../components/InviteBadge';
import { useAuth } from '../hooks/useAuth';
import { useSession } from '../hooks/useSession';
import { useQueue } from '../hooks/useQueue';
import { useParticipants } from '../hooks/useParticipants';
import { joinSession, endSession } from '../lib/session';
import { API_BASE } from '../lib/api';
import s from '../styles/jam.module.css';

export default function JamRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, setPreferredPlatform } = useAuth();
  const { session, loading: sessionLoading } = useSession(code);
  const { items: queueItems, refresh: refreshQueue } = useQueue(session?.id);
  const { participants, refresh: refreshParticipants } = useParticipants(session?.id);
  useEffect(() => {
    if (!authLoading && !user) navigate(`/login?next=/jam/${code}`);
  }, [authLoading, user, navigate, code]);

  useEffect(() => {
    if (!session?.id || !user?.id) return;
    joinSession(session.id).then(() => refreshParticipants());
  }, [session?.id, user?.id, refreshParticipants]);

  // Store session id in ref for cleanup
  const sessionIdRef = useRef(null);
  useEffect(() => { sessionIdRef.current = session?.id ?? null; }, [session?.id]);

  // Leave on SPA nav (unmount) or actual tab/browser close (pagehide).
  // Do NOT leave on visibilitychange:hidden — tab-switching fires that and
  // there is no re-join on return, causing false participant drops.
  useEffect(() => {
    const handlePageHide = () => {
      if (sessionIdRef.current) {
        navigator.sendBeacon(`${API_BASE}/api/sessions/${sessionIdRef.current}/leave`);
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (sessionIdRef.current) {
        navigator.sendBeacon(`${API_BASE}/api/sessions/${sessionIdRef.current}/leave`);
      }
    };
  }, []);

  // 30s heartbeat to keep session alive
  useEffect(() => {
    if (!session?.id) return;
    const interval = setInterval(() => {
      fetch(`${API_BASE}/api/sessions/${session.id}/heartbeat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [session?.id]);

  if (authLoading || sessionLoading) {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Session not found.</p>
        <a href="/" className="btn" style={{ marginTop: 20 }}>Go home</a>
      </div>
    );
  }

  if (session.status === 'ended') {
    const played = queueItems.filter(i => ['played', 'playing', 'skipped'].includes(i.status));
    return (
      <div className="page">
        <AuthBar />
        <div className={s.layout}>
          <div className={s.endedBanner}>
            <p style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Session ended</p>
            <p>{played.length} song{played.length !== 1 ? 's' : ''} played</p>
            <a href="/" className="btn" style={{ marginTop: 20 }}>Back to Home</a>
          </div>
          {played.length > 0 && (
            <div style={{ gridColumn: '1/-1' }}>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 12 }}>Songs played:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {played.map(item => <QueueCard key={item.id} item={item} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const nowPlaying = queueItems.find(i => i.status === 'playing') ?? null;
  const isDJ = session.dj_user_id === user?.id;
  const isHost = session.host_user_id === user?.id;

  return (
    <div className="page" style={{ padding: 0 }}>
      <AuthBar />
      <div className={s.layout}>
        <div className={s.jamHeader}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Jam Session</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 2 }}>
              {queueItems.filter(i => i.status === 'queued').length} song(s) in queue
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <InviteBadge code={session.invite_code} />
            {isHost && (
              <button
                className="btn btn-danger"
                style={{ fontSize: '0.82rem', padding: '8px 14px' }}
                onClick={async () => { if (window.confirm('End this jam for everyone?')) { await endSession(session.id); navigate('/'); } }}
              >
                End Session
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <NowPlaying
            nowPlaying={nowPlaying}
            sessionId={session.id}
            isDJ={isDJ}
            preferredPlatform={profile?.preferred_platform}
            participantCount={participants.length}
            userId={user?.id}
            onQueueChange={refreshQueue}
            repeatMode={session.repeat_mode ?? 'none'}
          />
          <QueueList
            items={queueItems}
            sessionId={session.id}
            userId={user?.id}
            profile={profile}
            onPlatformDetected={setPreferredPlatform}
            onAdded={refreshQueue}
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
  );
}
