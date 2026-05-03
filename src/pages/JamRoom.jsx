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
import { useYouTubePreResolver } from '../hooks/useYouTubePreResolver';
import { useParticipants } from '../hooks/useParticipants';
import { joinSession, leaveSession, endSession } from '../lib/session';
import s from '../styles/jam.module.css';

export default function JamRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, setPreferredPlatform } = useAuth();
  const { session, loading: sessionLoading } = useSession(code);
  const { items: queueItems, refresh: refreshQueue } = useQueue(session?.id);
  const participants = useParticipants(session?.id);
  useYouTubePreResolver(queueItems);

  useEffect(() => {
    if (!authLoading && !user) navigate(`/login?next=/jam/${code}`);
  }, [authLoading, user, navigate, code]);

  useEffect(() => {
    if (session?.id && user?.id) joinSession(session.id, user.id);
  }, [session?.id, user?.id]);

  // Store latest ids in refs so cleanup always has current values
  const sessionIdRef = useRef(null);
  const userIdRef = useRef(null);
  useEffect(() => { sessionIdRef.current = session?.id ?? null; }, [session?.id]);
  useEffect(() => { userIdRef.current = user?.id ?? null; }, [user?.id]);

  // Cleanup on unmount only — reads from refs, not stale closure values
  useEffect(() => {
    return () => {
      if (sessionIdRef.current && userIdRef.current) {
        leaveSession(sessionIdRef.current, userIdRef.current);
      }
    };
  }, []); // intentionally empty — runs once on mount/unmount

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
                onClick={() => { if (window.confirm('End this jam for everyone?')) endSession(session.id); }}
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
