import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth as api } from "./api";

const Ctx = createContext(null);
const THEMES = new Set(["light", "dark", "eva"]);

function initialThemeMode() {
  const stored = localStorage.getItem("codex-theme");
  if (THEMES.has(stored)) return stored;
  return localStorage.getItem("codex-dark") === "true" ? "dark" : "light";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [themeMode, setThemeMode] = useState(initialThemeMode);

  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  // Check for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("auth");
    if (!authResult) return;
    params.delete("auth");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    if (authResult === "success") {
      api.me().then(setUser).catch(()=>{});
    }
    window.history.replaceState({}, "", nextUrl);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    localStorage.setItem("codex-theme", themeMode);
    localStorage.setItem("codex-dark", String(themeMode === "dark"));
  }, [themeMode]);

  const login = useCallback(async (u,p) => { const d=await api.login(u,p); setUser(d); return d; }, []);
  const logout = useCallback(async () => { await api.logout(); setUser(null); }, []);
  const toggleDark = useCallback(() => setThemeMode(mode => mode === "dark" ? "light" : "dark"), []);
  const refreshUser = useCallback(async () => {
    try {
      const u = await api.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setAuthReady(true);
    }
  }, []);
  const dark = themeMode === "dark";

  return <Ctx.Provider value={{ user, authReady, login, logout, dark, themeMode, setThemeMode, toggleDark, refreshUser }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
