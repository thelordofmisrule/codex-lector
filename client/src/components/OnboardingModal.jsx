import { useState } from "react";
import { auth as api } from "../lib/api";

export default function OnboardingModal({ user, onComplete }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (!username.trim()) return setError("Choose a username.");
    if (username.trim().length < 3) return setError("Username must be at least 3 characters.");
    if (!/^[a-z0-9_]+$/i.test(username.trim())) return setError("Letters, numbers, and underscores only.");
    if (!displayName.trim()) return setError("Choose a display name.");
    setBusy(true);
    try {
      const updated = await api.onboard(username.trim(), displayName.trim());
      onComplete(updated);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    }
    setBusy(false);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(42,31,14,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3000, backdropFilter:"blur(6px)" }}>
      <div className="animate-in" style={{ background:"var(--surface)", borderRadius:12, border:"1px solid var(--border)", boxShadow:"0 16px 64px var(--shadow)", maxWidth:440, width:"90%", padding:"36px 32px" }}>
        <h2 style={{ fontFamily:"var(--font-display)", fontSize:24, color:"var(--accent)", marginBottom:4 }}>Welcome to Codex Lector</h2>
        <p style={{ color:"var(--text-light)", fontSize:15, marginBottom:24, fontFamily:"var(--font-fell)", fontStyle:"italic", lineHeight:1.6 }}>
          Choose how you'll appear to other readers.
        </p>

        {error && (
          <div style={{ background:"rgba(139,32,32,0.08)", color:"var(--danger)", padding:"8px 12px", borderRadius:5, fontSize:14, marginBottom:12 }}>
            {error}
          </div>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={{ fontSize:12, textTransform:"uppercase", letterSpacing:1, color:"var(--text-light)", display:"block", marginBottom:4, fontFamily:"var(--font-display)" }}>
              Username
            </label>
            <div style={{ display:"flex", alignItems:"center", gap:0 }}>
              <span style={{ padding:"8px 10px", background:"var(--bg)", border:"1px solid var(--border-light)", borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:15, color:"var(--text-light)" }}>@</span>
              <input className="input" value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}
                placeholder="your_handle" maxLength={24}
                style={{ borderRadius:"0 6px 6px 0", fontSize:15 }} />
            </div>
            <div style={{ fontSize:12, color:"var(--text-light)", marginTop:3 }}>Letters, numbers, underscores. 3–24 characters.</div>
          </div>

          <div>
            <label style={{ fontSize:12, textTransform:"uppercase", letterSpacing:1, color:"var(--text-light)", display:"block", marginBottom:4, fontFamily:"var(--font-display)" }}>
              Display Name
            </label>
            <input className="input" value={displayName} onChange={e=>setDisplayName(e.target.value)}
              placeholder="How others will see you" maxLength={50}
              style={{ fontSize:15 }} />
          </div>
        </div>

        <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ marginTop:20, width:"100%", fontSize:16, padding:"12px", opacity:busy?0.6:1 }}>
          {busy ? "…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
