import { useState, useEffect } from "react";
import { auth as authApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";

const OAUTH_ICONS = {
  google: { label:"Google", icon:"G", bg:"#4285F4", text:"#fff" },
  github: { label:"GitHub", icon:"⌥", bg:"#24292e", text:"#fff" },
  twitter: { label:"X / Twitter", icon:"𝕏", bg:"#000", text:"#fff" },
};

const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

export default function AuthModal({ onClose }) {
  const toast = useToast();
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    authApi.providers()
      .then(d => setProviders(d.providers || []))
      .catch(() => toast?.error("Could not load sign-in providers."));
  }, [toast]);

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
      </div>
    </div>
  );
}
