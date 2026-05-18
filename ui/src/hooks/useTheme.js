import { useState, useEffect } from 'react';

const STORAGE_KEY = 'theme';
const DARK = 'dark';
const LIGHT = 'light';

function applyTheme(theme) {
  if (theme === DARK) {
    document.documentElement.setAttribute('data-theme', DARK);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || LIGHT);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    const next = theme === DARK ? LIGHT : DARK;
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }

  return { theme, toggle };
}
