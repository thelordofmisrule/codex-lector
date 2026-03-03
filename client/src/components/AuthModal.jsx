import { useState, useEffect } from "react";
import { useAuth } from "../lib/AuthContext";
import { auth as authApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";

const OAUTH_ICONS = {
  google: { label:"Google", icon:"G", bg:"#4285F4", text:"#fff" },
  github: { label:"GitHub", icon:"⌥", bg:"#24292e", text:"#fff" },
  twitter: { label:"X / Twitter", icon:"𝕏", bg:"#000", text:"#fff" },
};

const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

export default function AuthModal({ onClose }) {
  const { login } = useAuth();
  const toast = useToast();
  const [providers, setProviders] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authApi.providers()
      .then(d => setProviders(d.providers || []))
      .catch(() => toast?.error("Could not load sign-in providers."));
  }, [toast]);

  const adminLogin = async () => {
    setError(""); setBusy(true);
    try {
      await login(username.trim(), password);
      onClose();
    } catch(e) {
      setError(e.message || "Invalid credentials.");
    }
    setBusy(false);
  };

  const oauthLogin = (provider) => {
    window.location.href = `${API_BASE}/api/auth/${provider}`;
  };

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(42,31,14,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} className="animate-in" style={{ background:"var(--surface)",borderRadius:10,border:"1px solid var(--border)",boxShadow:"0 16px 64px var(--shadow)",maxWidth:420,width:"90%",padding:32 }}>
        <h2 style={{ fontFamily:"var(--font-display)",fontSize:22,color:"var(--accent)",marginBottom:4 }}>Sign In</h2>
        <p style={{ color:"var(--text-light)",fontSize:14,marginBottom:24,fontFamily:"var(--font-fell)",fontStyle:"italic" }}>
          Welcome, gentle reader.
        </p>

        {error && (
          <div style={{ background:"rgba(139,32,32,0.08)",color:"var(--danger)",padding:"8px 12px",borderRadius:5,fontSize:14,marginBottom:12 }}>
            {error}
          </div>
        )}

        {/* OAuth buttons */}
        {providers.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
            {providers.map(p => {
              const cfg = OAUTH_ICONS[p] || { label:p, icon:"●", bg:"#555", text:"#fff" };
              return (
                <button key={p} onClick={()=>oauthLogin(p)} style={{
                  display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                  padding:"12px 16px", borderRadius:6, border:"none", cursor:"pointer",
                  background:cfg.bg, color:cfg.text, fontSize:15, fontWeight:600,
                  fontFamily:"var(--font-body)", letterSpacing:0.5,
                  transition:"opacity 0.15s",
                }}
                  onMouseEnter={e=>e.currentTarget.style.opacity="0.9"}
                  onMouseLeave={e=>e.currentTarget.style.opacity="1"}
                >
                  <span style={{ fontSize:18, fontWeight:700, width:24, textAlign:"center" }}>{cfg.icon}</span>
                  Continue with {cfg.label}
                </button>
              );
            })}
          </div>
        )}

        {providers.length === 0 && (
          <div style={{ padding:"16px", background:"var(--gold-faint)", borderRadius:6, marginBottom:16, fontSize:14, color:"var(--text-muted)", lineHeight:1.6 }}>
            No OAuth providers are configured yet. Add your credentials to <code style={{fontSize:12}}>.env</code> — see <code style={{fontSize:12}}>.env.example</code> for details.
          </div>
        )}

        {/* Admin local login (collapsible) */}
        <div style={{ borderTop:"1px solid var(--border-light)", paddingTop:14 }}>
          <button className="btn btn-ghost" onClick={()=>{setShowAdmin(!showAdmin);setError("");}} style={{
            fontSize:12, color:"var(--text-light)", width:"100%", textAlign:"center", letterSpacing:1,
          }}>
            {showAdmin ? "▾ Admin Login" : "▸ Admin Login"}
          </button>

          {showAdmin && (
            <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
              <input className="input" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)}
                autoComplete="username" style={{ fontSize:14 }} />
              <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&adminLogin()} autoComplete="current-password" style={{ fontSize:14 }} />
              <button className="btn btn-primary" onClick={adminLogin} disabled={busy} style={{opacity:busy?0.6:1}}>
                {busy ? "…" : "Sign In"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
