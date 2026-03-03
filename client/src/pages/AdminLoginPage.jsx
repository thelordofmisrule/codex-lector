import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export default function AdminLoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) return;
    setError("");
    setBusy(true);
    try {
      await login(username.trim(), password);
      nav("/");
    } catch (e) {
      setError(e.message || "Invalid credentials.");
    }
    setBusy(false);
  };

  return (
    <div className="animate-in" style={{ maxWidth: 420, margin: "72px auto", padding: "0 24px" }}>
      <div style={{ background:"var(--surface)", borderRadius:10, border:"1px solid var(--border)", boxShadow:"0 16px 64px var(--shadow)", padding:32 }}>
        <h1 style={{ fontFamily:"var(--font-display)", fontSize:22, color:"var(--accent)", marginBottom:6 }}>Admin Sign In</h1>
        <p style={{ color:"var(--text-light)", fontSize:14, marginBottom:20, fontFamily:"var(--font-fell)", fontStyle:"italic" }}>
          Restricted access.
        </p>
        {error && (
          <div style={{ background:"rgba(139,32,32,0.08)", color:"var(--danger)", padding:"8px 12px", borderRadius:5, fontSize:14, marginBottom:12 }}>
            {error}
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <input className="input" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" />
          <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e=>e.key==="Enter"&&submit()} />
          <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? "…" : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

