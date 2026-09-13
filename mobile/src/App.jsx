import { Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { createSession } from "./lib/session";
import { isAuthError, promptSignIn } from "./lib/authPrompt";

import Home from "./pages/Home";
import Login from "./pages/Login";
import JamRoom from "./pages/JamRoom";

function JamNew() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login?next=/jam/new");
      return;
    }
    createSession(user.id)
      .then((s) => navigate(`/jam/${s.invite_code}`, { replace: true }))
      .catch((err) => {
        console.error("Create session failed:", err);
        if (isAuthError(err)) {
          promptSignIn(
            "Your session has expired. Would you like to sign in to start a new Jam?",
            "/jam/new",
          );
        } else {
          alert("Could not start jam: " + err.message);
          navigate("/");
        }
      });
  }, [user, loading, navigate]);

  return (
    <div className="screen bg-[#f4f5f0] items-center justify-center">
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
