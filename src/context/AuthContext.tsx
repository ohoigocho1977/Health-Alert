import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setStoredToken, setUnauthorizedHandler } from '../lib/api';
import type { UserProfile, UserRole } from '../shared/types';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<UserProfile>;
  register: (data: {
    email: string;
    password: string;
    displayName: string;
    primaryCommunityId: string;
    requestedRole?: UserRole;
    inviteCode?: string;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res.user);
    } catch {
      setUser(null);
      setStoredToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
    refreshUser();
    return () => setUnauthorizedHandler(null);
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string, rememberMe = true) => {
    const res = await api.login({ email, password, rememberMe });
    setStoredToken(res.token, rememberMe);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      displayName: string;
      primaryCommunityId: string;
      requestedRole?: UserRole;
      inviteCode?: string;
    }) => {
      const res = await api.register(data);
      setStoredToken(res.token, true);
      setUser(res.user);
      return res.user;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Clear local session even if server call fails
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
