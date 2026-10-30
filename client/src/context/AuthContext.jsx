import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onUnauthorized, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'loading' : 'anonymous'));

  const signOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const startSession = useCallback(({ token, user: nextUser }) => {
    if (token) tokenStore.set(token);
    if (nextUser) setUser(nextUser);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    onUnauthorized(signOut);
    if (!tokenStore.get()) return undefined;
    const controller = new AbortController();
    api('/auth/me', { signal: controller.signal })
      .then(({ user: me }) => startSession({ user: me }))
      .catch((err) => {
        if (err.name !== 'AbortError') signOut();
      });
    return () => controller.abort();
  }, [signOut, startSession]);

  const value = useMemo(
    () => ({
      user,
      status,
      signIn: async (credentials) => startSession(await api('/auth/login', { method: 'POST', body: credentials })),
      signUp: async (details) => startSession(await api('/auth/signup', { method: 'POST', body: details })),
      signOut,
      startSession,
      updateUser: setUser,
    }),
    [user, status, signOut, startSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
