import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

function redirectToAuthentik() {
  if (!window.location.hostname.endsWith('.decoinkssuite.com')) return false;
  const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  window.location.replace(
    `${window.location.origin}/outpost.goauthentik.io/start?rd=${encodeURIComponent(returnTo)}`,
  );
  return true;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const result = await api.authMe();
      setUser(result.user);
    } catch {
      try {
        const result = await api.sso();
        setUser(result.user);
      } catch {
        if (!redirectToAuthentik()) setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
    const handleUnauthorized = () => setUser(null);
    window.addEventListener('blanktex:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('blanktex:unauthorized', handleUnauthorized);
  }, [loadUser]);

  const login = async (email, password) => {
    const result = await api.login(email, password);
    setUser(result.user);
    return result.user;
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
