import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);
const SSO_REDIRECT_KEY = 'blanktex_sso_redirect_started_at';

function clearSsoRedirectGuard() {
  window.sessionStorage.removeItem(SSO_REDIRECT_KEY);
}

function redirectToAuthentik() {
  if (!window.location.hostname.endsWith('.decoinkssuite.com')) return false;
  const lastRedirect = Number(window.sessionStorage.getItem(SSO_REDIRECT_KEY) || 0);
  if (lastRedirect && Date.now() - lastRedirect < 60_000) return false;

  window.sessionStorage.setItem(SSO_REDIRECT_KEY, String(Date.now()));
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
        clearSsoRedirectGuard();
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
    clearSsoRedirectGuard();
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
