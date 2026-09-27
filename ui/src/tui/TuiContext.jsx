import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'musicone:tui-mode';
const GUI_THEME_KEY = 'musicone:gui-theme';
const TuiContext = createContext({ tuiMode: false, toggleTui: () => {}, setTui: () => {}, guiTheme: 'pulse', setGuiTheme: () => {} });

export function TuiProvider({ children }) {
  const [tuiMode, setTuiMode] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [guiTheme, setGuiThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(GUI_THEME_KEY);
      return saved === 'studio' ? 'studio' : 'pulse';
    } catch { return 'pulse'; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, tuiMode ? '1' : '0'); } catch {}
    document.documentElement.dataset.tui = tuiMode ? '1' : '0';
  }, [tuiMode]);

  useEffect(() => {
    try { localStorage.setItem(GUI_THEME_KEY, guiTheme); } catch {}
  }, [guiTheme]);

  const toggleTui = useCallback(() => setTuiMode(v => !v), []);
  const setTui = useCallback((v) => setTuiMode(!!v), []);
  const setGuiTheme = useCallback((theme) => setGuiThemeState(theme === 'studio' ? 'studio' : 'pulse'), []);

  return (
    <TuiContext.Provider value={{ tuiMode, toggleTui, setTui, guiTheme, setGuiTheme }}>
      {children}
    </TuiContext.Provider>
  );
}

export function useTui() {
  return useContext(TuiContext);
}
