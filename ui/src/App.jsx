import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import JamRoom from './pages/JamRoom';
import NotFound from './pages/NotFound';
import BridgePlayer from './pages/BridgePlayer';
import JamCreate from './pages/JamCreate';
import { IndependentPlaybackProvider, useIndependentControls } from './playback/IndependentPlaybackContext';
import { FLAGS } from './lib/flags';
import { useTui } from './tui/TuiContext';
import TuiToggle from './tui/TuiToggle';
import TuiHome from './tui/TuiHome';
import TuiJamRoom from './tui/TuiJamRoom';
import TuiLogin from './tui/TuiLogin';
import Footer from './components/Footer';
import { JamPlaybackProvider, useJamPlayback } from './playback/JamPlaybackContext';


function PlaybackRouteCleanup() {
  const { pathname } = useLocation();
  const { clearPlayback } = useJamPlayback();
  const local = useIndependentControls();
  useEffect(() => {
    if (!pathname.startsWith('/jam/')) {
      clearPlayback();
      local.reset();
    }
  }, [pathname, clearPlayback, local.reset]);
  return null;
}


export default function App() {
  const { tuiMode } = useTui();
  const { pathname } = useLocation();
  const isJamRoom = pathname.startsWith('/jam/') && pathname !== '/jam/new';

  const HomeC    = tuiMode ? TuiHome    : Home;
  const LoginC   = tuiMode ? TuiLogin   : Login;
  const JamRoomC = tuiMode ? TuiJamRoom : JamRoom;

  return (
    <JamPlaybackProvider>
      <IndependentPlaybackProvider capable={FLAGS.YOUTUBE_EMBED}>
      <PlaybackRouteCleanup />
      <Routes>
        <Route path="/"      element={<HomeC />} />
        <Route path="/login" element={<LoginC />} />
        {FLAGS.JAM_SESSION && <Route path="/jam/new"   element={<JamCreate />} />}
        {FLAGS.JAM_SESSION && <Route path="/jam/:code" element={<JamRoomC />} />}
        <Route path="/bridge" element={<BridgePlayer />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!tuiMode && <TuiToggle />}
      {!tuiMode && !isJamRoom && <Footer />}
      </IndependentPlaybackProvider>
    </JamPlaybackProvider>
  );
}
