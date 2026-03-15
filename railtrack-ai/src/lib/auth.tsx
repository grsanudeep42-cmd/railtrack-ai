'use client';
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export type UserRole = 'CONTROLLER' | 'SUPERVISOR' | 'LOGISTICS' | 'ADMIN';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  section: string;
  isDemo: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (credentials: { email: string; password: string; role: UserRole }) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthReady: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// Cookie helpers (client-side only — httpOnly set by middleware for security)
function setCookie(name: string, value: string, maxAgeSeconds = 86400) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Hydrate user from /api/auth/me on mount if a token cookie exists
  useEffect(() => {
    const token = getCookie('railtrack_token');
    if (!token) {
      // No token — auth is ready immediately (unauthenticated)
      setIsAuthReady(true);
      return;
    }

    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Session expired');
        return res.json();
      })
      .then(data => {
        setUser({
          id:      data.id,
          name:    data.name,
          email:   data.email,
          role:    data.role as UserRole,
          section: data.section,
          isDemo:  false,
        });
      })
      .catch(() => {
        deleteCookie('railtrack_token');
        deleteCookie('rt_role');
      })
      .finally(() => {
        // Auth hydration is complete regardless of success or failure
        setIsAuthReady(true);
      });
  }, []);

  const login = useCallback(async ({ email, password }: { email: string; password: string; role: UserRole }) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Login failed' }));
        throw new Error(err.detail ?? 'Invalid credentials');
      }

      const data = await res.json();
      const { access_token, user: apiUser } = data;

      // Store JWT in a client-readable cookie (middleware will also read it)
      setCookie('railtrack_token', access_token, 86400);    // 24 hours
      setCookie('rt_role',  apiUser.role,    86400);

      const authUser: AuthUser = {
        id:      apiUser.id,
        name:    apiUser.name,
        email:   apiUser.email,
        role:    apiUser.role as UserRole,
        section: apiUser.section,
        isDemo:  false,
      };
      setUser(authUser);

      // Route based on role
      switch (apiUser.role as UserRole) {
        case 'CONTROLLER': router.push('/dashboard/controller'); break;
        case 'SUPERVISOR': router.push('/analytics');             break;
        case 'LOGISTICS':  router.push('/simulate');              break;
        case 'ADMIN':      router.push('/admin');                 break;
        default:           router.push('/dashboard/controller');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const logout = useCallback(() => {
    setUser(null);
    deleteCookie('railtrack_token');
    deleteCookie('rt_role');
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, isAuthReady, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * Helper used by server components and middleware to get the current token.
 * Pass the cookie string from headers/cookies().
 */
export function getTokenFromCookie(cookieString: string): string | null {
  const match = cookieString.match(/(?:^|;\\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
