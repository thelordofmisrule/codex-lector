import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth as api } from "../lib/api";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setMsg("");
    if (!token.trim()) return setMsg("Reset token required.");
    if (password.length < 6) return setMsg("Password must be 6+ characters.");
    if (password !== confirm) return setMsg("Passwords don't match.");
    try {
      await api.resetPassword(token.trim(), password);
      setDone(true);
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="animate-in" style={{ maxWidth:400, margin:"0 auto", padding:"80px 24px", textAlign:"center" }}>
      <h1 style={{ fontFamily:"var(--font-display)", fontSize:24, letterSpacing:2, marginBottom:8 }}>Reset Password</h1>
      <p style={{ color:"var(--text-light)", fontFamily:"var(--font-fell)", fontStyle:"italic", marginBottom:28 }}>
        Enter the reset token provided by an administrator.
      </p>

      {done ? (
        <div>
          <div style={{ fontSize:48, marginBottom:12 }}>✓</div>
          <p style={{ fontSize:16, marginBottom:16 }}>Password reset successfully.</p>
          <button className="btn btn-primary" onClick={()=>nav("/")}>Sign In</button>
        </div>
      ) : (
        <div style={{ textAlign:"left" }}>
          <label style={{ fontSize:12, textTransform:"uppercase", letterSpacing:1, color:"var(--text-light)", display:"block", marginBottom:4 }}>Reset Token</label>
          <input className="input" value={token} onChange={e=>setToken(e.target.value)} placeholder="Paste your reset token…"
            style={{ fontFamily:"var(--font-mono)", fontSize:13, marginBottom:12 }} />

          <label style={{ fontSize:12, textTransform:"uppercase", letterSpacing:1, color:"var(--text-light)", display:"block", marginBottom:4 }}>New Password</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="6+ characters"
            style={{ marginBottom:12 }} />

          <label style={{ fontSize:12, textTransform:"uppercase", letterSpacing:1, color:"var(--text-light)", display:"block", marginBottom:4 }}>Confirm Password</label>
          <input className="input" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat password"
            style={{ marginBottom:16 }} />

          <button className="btn btn-primary" onClick={submit} style={{ width:"100%" }}>Reset Password</button>
          {msg && <div style={{ fontSize:13, marginTop:8, color:"var(--danger)", textAlign:"center" }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
