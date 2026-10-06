import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  dark: boolean;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeState | null>(null);
const KEY = 'bb-theme';

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage blocked */
  }
  return 'system';
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const m = media();
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, []);

  const dark = mode === 'dark' || (mode === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* storage blocked */
    }
  }, []);

  const toggle = useCallback(() => setMode(dark ? 'light' : 'dark'), [dark, setMode]);

  return <Ctx.Provider value={{ mode, dark, setMode, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
