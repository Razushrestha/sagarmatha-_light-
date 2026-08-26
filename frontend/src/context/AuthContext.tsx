"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { authAPI } from "@/lib/api";

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  landingPage: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string>;
  logout: () => Promise<void>;
  hasPermission: (...perms: string[]) => boolean;
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

  const login = async (email: string, password: string) => {
    const res = await authAPI.login({ email, password });
    requestId.current += 1;
    setUser(res.data.data);
    setLoading(false);
    return res.data.data.landingPage;
  };

  const logout = async () => {
    requestId.current += 1;
    await authAPI.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    const res = await authAPI.getMe();
    setUser(res.data.data);
  };

  const hasPermission = (...perms: string[]) => {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    return perms.some((p) => user.permissions.includes(p));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
