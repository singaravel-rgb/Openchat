'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi } from '@/lib/api';
import type { User, Token } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearSessionExpiry: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('access_token');
    if (storedToken) {
      setToken(storedToken);
      authApi.me()
        .then(setUser)
        .catch((err) => {
          localStorage.removeItem('access_token');
          setToken(null);
          setUser(null);
          if (err instanceof Error && err.message.includes('Session expired')) {
            setSessionExpired(true);
          } else {
            setSessionExpired(true);
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { access_token } = await authApi.login(email, password);
    localStorage.setItem('access_token', access_token);
    setToken(access_token);
    setSessionExpired(false);
    const userData = await authApi.me();
    setUser(userData);
  };

  const logout = () => {
    const hasToken = typeof window !== 'undefined' && Boolean(localStorage.getItem('access_token'));
    if (hasToken) {
      authApi.logout().catch(() => {});
    }
    localStorage.removeItem('access_token');
    setToken(null);
    setUser(null);
    setSessionExpired(false);
  };

  const clearSessionExpiry = () => {
    setSessionExpired(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, sessionExpired, login, logout, clearSessionExpiry }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}