import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth as api } from "./api";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("codex-dark") === "true");

  useEffect(() => { api.me().then(setUser).catch(()=>{}).finally(()=>setReady(true)); }, []);

  // Check for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("auth");
    if (authResult === "success") {
      api.me().then(setUser).catch(()=>{});
      window.history.replaceState({}, "", window.location.pathname);
    } else if (authResult === "failed") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("codex-dark", dark);
  }, [dark]);

  const login = useCallback(async (u,p) => { const d=await api.login(u,p); setUser(d); return d; }, []);
  const logout = useCallback(async () => { await api.logout(); setUser(null); }, []);
  const toggleDark = useCallback(() => setDark(d=>!d), []);
  const refreshUser = useCallback(async () => { try { const u = await api.me(); setUser(u); } catch {} }, []);

  if (!ready) return null;
  return <Ctx.Provider value={{ user, login, logout, dark, toggleDark, refreshUser }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
