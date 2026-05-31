import { Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import JamRoom from './pages/JamRoom';
import NotFound from './pages/NotFound';
import { FLAGS } from './lib/flags';
import { useAuth } from './hooks/useAuth';
import { createSession } from './lib/session';
import { useTui } from './tui/TuiContext';
import TuiToggle from './tui/TuiToggle';
import TuiHome from './tui/TuiHome';
import TuiJamRoom from './tui/TuiJamRoom';
import TuiLogin from './tui/TuiLogin';
import Footer from './components/Footer';

function JamNew() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login?next=/jam/new'); return; }
    createSession(user.id).then(s => navigate(`/jam/${s.invite_code}`, { replace: true }));
  }, [user, loading]);
  return <div className="page" style={{ justifyContent: 'center' }}><div className="spinner" /></div>;
}

export default function App() {
  const { tuiMode } = useTui();

  const HomeC    = tuiMode ? TuiHome    : Home;
  const LoginC   = tuiMode ? TuiLogin   : Login;
  const JamRoomC = tuiMode ? TuiJamRoom : JamRoom;

  return (
    <>
      <Routes>
        <Route path="/"      element={<HomeC />} />
        <Route path="/login" element={<LoginC />} />
        {FLAGS.JAM_SESSION && <Route path="/jam/new"   element={<JamNew />} />}
        {FLAGS.JAM_SESSION && <Route path="/jam/:code" element={<JamRoomC />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!tuiMode && <TuiToggle />}
      {!tuiMode && <Footer />}
    </>
  );
}
