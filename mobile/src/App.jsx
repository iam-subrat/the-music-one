import { Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { createSession } from './lib/session';

import Home from './pages/Home';
import Login from './pages/Login';
import JamRoom from './pages/JamRoom';

function JamNew() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login?next=/jam/new'); return; }
    createSession(user.id).then(s => navigate(`/jam/${s.invite_code}`, { replace: true }));
  }, [user, loading, navigate]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f5f0]">
      <div className="w-16 h-16 border-4 border-black border-t-lime-accent rounded-full animate-spin"></div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/jam/new" element={<JamNew />} />
      <Route path="/jam/:code" element={<JamRoom />} />
    </Routes>
  );
}
