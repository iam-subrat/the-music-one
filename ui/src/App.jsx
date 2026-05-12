import { Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import JamRoom from './pages/JamRoom';
import NotFound from './pages/NotFound';
import { FLAGS } from './lib/flags';
import { useAuth } from './hooks/useAuth';
import { createSession } from './lib/session';

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

// main app
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      {FLAGS.JAM_SESSION && <Route path="/jam/new" element={<JamNew />} />}
      {FLAGS.JAM_SESSION && <Route path="/jam/:code" element={<JamRoom />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
