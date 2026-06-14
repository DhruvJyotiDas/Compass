"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (org_name: string, name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          setUser(await api.me());
        } catch {
          clearToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setToken(res.access_token);
    setUser(res.user);
    router.push("/dashboard");
  };

  const register = async (org_name: string, name: string, email: string, password: string) => {
    const res = await api.register({ org_name, name, email, password });
    setToken(res.access_token);
    setUser(res.user);
    router.push("/dashboard");
  };

  const logout = () => {
    clearToken();
    setUser(null);
    router.push("/login");
  };

  const refresh = async () => setUser(await api.me());

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function can(user: User | null, action: "create" | "edit" | "delete" | "manage_users" | "manage_settings") {
  if (!user) return false;
  const perms: Record<string, string[]> = {
    admin: ["create", "edit", "delete", "manage_users", "manage_settings"],
    manager: ["create", "edit", "delete", "manage_settings"],
    sales_rep: ["create", "edit"],
  };
  return perms[user.role]?.includes(action) ?? false;
}
