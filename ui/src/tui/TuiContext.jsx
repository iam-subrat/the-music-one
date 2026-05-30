import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'musicone:tui-mode';
const TuiContext = createContext({ tuiMode: false, toggleTui: () => {}, setTui: () => {} });

export function TuiProvider({ children }) {
  const [tuiMode, setTuiMode] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, tuiMode ? '1' : '0'); } catch {}
    document.documentElement.dataset.tui = tuiMode ? '1' : '0';
  }, [tuiMode]);

  const toggleTui = useCallback(() => setTuiMode(v => !v), []);
  const setTui = useCallback((v) => setTuiMode(!!v), []);

  return (
    <TuiContext.Provider value={{ tuiMode, toggleTui, setTui }}>
      {children}
    </TuiContext.Provider>
  );
}

export function useTui() {
  return useContext(TuiContext);
}
