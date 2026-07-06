import type { User } from "@squadvault/shared";
import * as React from "react";
import { api, ApiError } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (name: string, email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = React.useCallback(async (name: string, email: string) => {
    const res = await api<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ name, email }),
    });
    setUser(res.user);
  }, []);

  const logout = React.useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
