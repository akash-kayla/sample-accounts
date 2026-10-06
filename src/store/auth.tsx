import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clearDataCache } from '../lib/cache';
import { auth } from '../lib/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      }),
    [],
  );
  return <Ctx.Provider value={{ user, loading, logout: () => (clearDataCache(), signOut(auth)) }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
