"use client";

import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from "react";
import { authAPI } from "@/lib/api";
import { hasModule as moduleEnabled, type PartnerLabel, type ShopModules } from "@/lib/industry";

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  landingPage: string;
  tenantId?: string | null;
  tenantName?: string | null;
  tenantSlug?: string | null;
  tenantStatus?: string | null;
  companyName?: string | null;
  mustChangePassword?: boolean;
  impersonating?: boolean;
  impersonatingUntil?: number | null;
  industry?: string | null;
  modules?: ShopModules;
  partnerLabel?: PartnerLabel;
  subscription?: {
    plan: string;
    status: string;
    trialEndsAt?: string | null;
    trialExpired?: boolean;
    limits: { users: number; storageGb: number };
    usage: { users: number; storageBytes: number };
    storageOptionsGb?: number[];
  } | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string>;
  acceptSession: (data: User) => string;
  logout: () => Promise<void>;
  hasPermission: (...perms: string[]) => boolean;
  hasModule: (name: keyof ShopModules) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    authAPI.getMe()
      .then((res) => {
        if (id !== requestId.current) return;
        setUser(res.data.data);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setUser(null);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, []);

  const acceptSession = useCallback((data: User) => {
    requestId.current += 1;
    setUser(data);
    setLoading(false);
    return data.landingPage || "/dashboard";
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authAPI.login({ email, password });
    return acceptSession(res.data.data);
  }, [acceptSession]);

  const logout = useCallback(async () => {
    requestId.current += 1;
    await authAPI.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await authAPI.getMe();
    setUser(res.data.data);
  }, []);

  const hasPermission = useCallback((...perms: string[]) => {
    if (!user) return false;
    if (user.role === "platform_admin") return user.impersonating === true;
    if (user.role === "super_admin") return true;
    return perms.some((p) => user.permissions.includes(p));
  }, [user]);

  const hasModule = useCallback(
    (name: keyof ShopModules) => moduleEnabled(user?.modules, name, user?.industry),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, login, acceptSession, logout, hasPermission, hasModule, refreshUser }),
    [user, loading, login, acceptSession, logout, hasPermission, hasModule, refreshUser]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
