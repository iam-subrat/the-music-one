import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "./lib/api";
import JamCreate from "./pages/JamCreate";
import { JamPlaybackProvider } from "../../ui/src/playback/JamPlaybackContext";
import { IndependentPlaybackProvider, useIndependentControls } from "../../ui/src/playback/IndependentPlaybackContext";
import IndependentBridgePlayer from "./components/IndependentBridgePlayer";

import Home from "./pages/Home";
import Login from "./pages/Login";
import JamRoom from "./pages/JamRoom";

async function resolveItem(item) {
  const response = await api('/items/' + item.id + '/resolve-playback', { method: 'POST' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Could not play this song');
  return data;
}

function Screens() {
  const { pathname } = useLocation();
  const { reset } = useIndependentControls();
  const [enabled, setEnabled] = useState(JSON.parse(__FLAG_INDEPENDENT_PLAYBACK__));
  useEffect(() => {
    api('/flags/').then(async response => {
      if (response.ok) {
        const flags = await response.json(), flag = flags.find(value => value.key === 'INDEPENDENT_PLAYBACK');
        if (flag) setEnabled(flag.enabled && flags.find(value => value.key === 'YOUTUBE_EMBED')?.enabled !== false);
      }
    }).catch(() => {});
  }, []);
  useEffect(() => { if (!pathname.startsWith('/jam/') || pathname === '/jam/new') reset(); }, [pathname, reset]);
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/jam/new" element={<JamCreate enabled={enabled} />} />
      <Route path="/jam/:code" element={<JamRoom independentEnabled={enabled} />} />
    </Routes>
  );
}

export default function App() {
  return <JamPlaybackProvider PlayerComponent={IndependentBridgePlayer} playerChrome={false}>
    <IndependentPlaybackProvider resolveItem={resolveItem}><Screens /></IndependentPlaybackProvider>
  </JamPlaybackProvider>;
}
