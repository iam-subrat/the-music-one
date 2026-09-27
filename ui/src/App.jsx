import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import JamRoom from './pages/JamRoom';
import NotFound from './pages/NotFound';
import BridgePlayer from './pages/BridgePlayer';
import { FLAGS } from './lib/flags';
import { useAuth } from './hooks/useAuth';
import { createSession } from './lib/session';
import { useTui } from './tui/TuiContext';
import TuiToggle from './tui/TuiToggle';
import TuiHome from './tui/TuiHome';
import TuiJamRoom from './tui/TuiJamRoom';
import TuiLogin from './tui/TuiLogin';
import TuiPageLoader from './tui/TuiPageLoader';
import Footer from './components/Footer';
import { JamPlaybackProvider, useJamPlayback } from './playback/JamPlaybackContext';

function PlaybackRouteCleanup() {
  const { pathname } = useLocation();
  const { clearPlayback } = useJamPlayback();
  useEffect(() => {
    if (!pathname.startsWith('/jam/')) {
      clearPlayback();
    }
  }, [pathname, clearPlayback]);
  return null;
}

function JamNew({ tuiMode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login?next=/jam/new'); return; }
    createSession(user.id).then(s => navigate(`/jam/${s.invite_code}`, { replace: true }));
  }, [user, loading]);
  return <div className="page" style={{ justifyContent: 'center' }}>{tuiMode ? <TuiPageLoader /> : <div className="spinner" />}</div>;
}

export default function App() {
  const { tuiMode } = useTui();

  const HomeC    = tuiMode ? TuiHome    : Home;
  const LoginC   = tuiMode ? TuiLogin   : Login;
  const JamRoomC = tuiMode ? TuiJamRoom : JamRoom;

  return (
    <JamPlaybackProvider>
      <PlaybackRouteCleanup />
      <Routes>
        <Route path="/"      element={<HomeC />} />
        <Route path="/login" element={<LoginC />} />
        {FLAGS.JAM_SESSION && <Route path="/jam/new"   element={<JamNew tuiMode={tuiMode} />} />}
        {FLAGS.JAM_SESSION && <Route path="/jam/:code" element={<JamRoomC />} />}
        <Route path="/bridge" element={<BridgePlayer />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!tuiMode && <TuiToggle />}
      {!tuiMode && <Footer />}
    </JamPlaybackProvider>
  );
}
