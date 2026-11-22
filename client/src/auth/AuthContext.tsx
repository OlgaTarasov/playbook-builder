import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../api/authApi';
import { setUnauthorizedHandler } from '../api/apiClient';
import type { UserDto } from '../api/types';
import { MESSAGES } from '../validation/messages';

/**
 * loading: checking the session cookie with /auth/me on first load.
 * authenticated: the server accepted the cookie (or login just set it).
 * anonymous: no valid session.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: UserDto | null;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  /**
   * Test seam. When given (a user, or null for signed out), the provider starts
   * in that state and skips the /auth/me check. Omit in the app.
   */
  initialUser?: UserDto | null;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const navigate = useNavigate();
  const skipRestore = initialUser !== undefined;

  const [user, setUser] = useState<UserDto | null>(initialUser ?? null);
  const [status, setStatus] = useState<AuthStatus>(() => {
    if (!skipRestore) return 'loading';
    return initialUser ? 'authenticated' : 'anonymous';
  });

  // Restore the session on load. The HttpOnly cookie is sent automatically, so
  // the page never reads it. A failed check means signed out.
  useEffect(() => {
    if (skipRestore) return;
    let cancelled = false;
    authApi.me().then(
      (current) => {
        if (cancelled) return;
        setUser(current);
        setStatus('authenticated');
      },
      () => {
        if (cancelled) return;
        setUser(null);
        setStatus('anonymous');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [skipRestore]);

  const applyUser = useCallback((next: UserDto | null) => {
    setUser(next);
    setStatus(next ? 'authenticated' : 'anonymous');
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Clear the local state even if the request fails. The cookie expires within 24 hours.
    }
    applyUser(null);
    navigate('/login', { replace: true });
  }, [applyUser, navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      applyUser(null);
      navigate('/login', { replace: true, state: { message: MESSAGES.sessionExpired } });
    });
  }, [applyUser, navigate]);

  const login = useCallback(
    async (email: string, password: string) => {
      applyUser(await authApi.login(email, password));
    },
    [applyUser],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      applyUser(await authApi.register(email, password));
    },
    [applyUser],
  );

  const value = useMemo<AuthState>(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
