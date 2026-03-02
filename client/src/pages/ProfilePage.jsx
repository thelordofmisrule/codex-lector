import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { auth as api } from "../lib/api";

const COLORS = ["#7A1E2E","#2E5A3C","#1E3A5F","#5C3D6E","#8B6914","#6B3A2E","#2E6B6B","#4A4A6A","#8C4A2F","#2F4858"];
function fmt(iso) { try { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}); } catch { return ""; } }

export default function ProfilePage() {
  const { username } = useParams();
  const nav = useNavigate();
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarColor, setAvatarColor] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const isOwn = !!(user && user.username === username);
  const isAdmin = !!user?.isAdmin;

  useEffect(() => {
    setLoading(true);
    setProfile(null);
    api.profile(username).then(p => {
      setProfile(p);
      setDisplayName(p.displayName || "");
      setEditUsername(p.username || "");
      setBio(p.bio || "");
      setAvatarColor(p.avatarColor || "#7A1E2E");
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, [username]);

  const save = async () => {
    setSaveMsg("");
    try {
      const usernameChanged = editUsername !== profile.username;
      if (usernameChanged) await api.changeUsername(editUsername);
      await api.updateProfile({ displayName, bio, avatarColor });
      const newUsername = usernameChanged ? editUsername : profile.username;
      setProfile(prev => {
        if (!prev) return prev;
        return { ...prev, username:newUsername, displayName, bio, avatarColor, stats:prev.stats||{annotations:0,discussions:0,forumThreads:0} };
      });
      setEditing(false);
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(""), 2000);
      if (refreshUser) refreshUser();
      if (usernameChanged) nav(`/profile/${newUsername}`, { replace:true });
    } catch (e) {
      setSaveMsg(e.message || "Failed to save.");
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    if (profile) {
      setDisplayName(profile.displayName || "");
      setEditUsername(profile.username || "");
      setBio(profile.bio || "");
      setAvatarColor(profile.avatarColor || "#7A1E2E");
    }
  };

  const generateReset = async () => {
    setResetMsg("");
    try {
      const r = await api.adminResetPassword(username);
      setResetToken(r.token);
      setResetMsg(`Token generated. Expires ${fmt(r.expiresAt)}.`);
    } catch(e) { setResetMsg(e.message); }
  };

  if (loading) return <div style={{padding:60,textAlign:"center"}}><div className="spinner"/></div>;
  if (!profile) return <div style={{padding:60,textAlign:"center",color:"var(--danger)"}}>User not found.</div>;

  const stats = profile.stats || { annotations: 0, discussions: 0, forumThreads: 0 };

  return (
    <div className="animate-in" style={{ maxWidth:600, margin:"0 auto", padding:"48px 24px 80px" }}>
      {/* Avatar + Name */}
      <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:32 }}>
        {profile.oauthAvatar ? (
          <img src={profile.oauthAvatar} alt="" style={{
            width:72, height:72, borderRadius:"50%", objectFit:"cover", flexShrink:0,
            border:"3px solid var(--accent)",
          }} />
        ) : (
          <div style={{
            width:72, height:72, borderRadius:"50%", background: profile.avatarColor || "#7A1E2E",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:28, fontWeight:700, color:"#FFF8F0", fontFamily:"var(--font-display)", letterSpacing:1,
            flexShrink:0,
          }}>
            {(profile.displayName || "?").slice(0,2).toUpperCase()}
          </div>
        )}
        <div style={{ flex:1 }}>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:600, marginBottom:2 }}>{profile.displayName}</h1>
          <div style={{ fontSize:14, color:"var(--text-light)" }}>
            @{profile.username}
            {profile.isAdmin && <span className="admin-badge" style={{marginLeft:8}}>Admin</span>}
            {profile.oauthProvider && <span style={{ marginLeft:6, opacity:0.6, fontSize:12 }}>via {profile.oauthProvider}</span>}
          </div>
          <div style={{ fontSize:13, color:"var(--text-light)", marginTop:4 }}>Joined {fmt(profile.createdAt)}</div>
        </div>
      </div>

      {/* Bio */}
      {(profile.bio || isOwn) && (
        <div style={{ marginBottom:28, padding:"16px 20px", background:"var(--surface)", borderRadius:8, border:"1px solid var(--border-light)" }}>
          <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:2, color:"var(--text-light)", fontFamily:"var(--font-display)", marginBottom:8 }}>About</div>
          {editing ? (
            <textarea className="input" value={bio} onChange={e=>setBio(e.target.value)} placeholder="A few words about yourself…"
              maxLength={500} style={{ minHeight:80, resize:"vertical", lineHeight:1.7 }} />
          ) : (
            <p style={{ fontSize:16, lineHeight:1.8, color: profile.bio ? "var(--text)" : "var(--text-light)", fontStyle: profile.bio ? "normal" : "italic" }}>
              {profile.bio || "No bio yet."}
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ display:"flex", gap:12, marginBottom:28, flexWrap:"wrap" }}>
        {[
          { label:"Annotations", n: stats.annotations, icon:"📖" },
          { label:"Discussions", n: stats.discussions, icon:"💬" },
          { label:"Forum Threads", n: stats.forumThreads, icon:"📝" },
        ].map(s => (
          <div key={s.label} style={{ flex:"1 1 120px", padding:"14px 16px", background:"var(--surface)", borderRadius:8, border:"1px solid var(--border-light)", textAlign:"center" }}>
            <div style={{ fontSize:24, marginBottom:2 }}>{s.icon}</div>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"var(--font-display)", color:"var(--accent)" }}>{s.n || 0}</div>
            <div style={{ fontSize:11, color:"var(--text-light)", letterSpacing:1, textTransform:"uppercase" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Edit controls (own profile) */}
      {isOwn && !editing && (
        <div style={{ marginBottom:16 }}>
          <button className="btn btn-secondary" onClick={()=>setEditing(true)}>Edit Profile</button>
          {saveMsg && <span style={{ marginLeft:12, fontSize:13, color:"var(--success)" }}>{saveMsg}</span>}
        </div>
      )}
      {isOwn && editing && (
        <div style={{ marginBottom:24, padding:20, background:"var(--surface)", borderRadius:8, border:"1px solid var(--border-light)" }}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, textTransform:"uppercase", letterSpacing:1, color:"var(--text-light)", display:"block", marginBottom:4 }}>Username</label>
            <div style={{ display:"flex", alignItems:"center", gap:0 }}>
              <span style={{ padding:"8px 10px", background:"var(--bg)", border:"1px solid var(--border-light)", borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:14, color:"var(--text-light)" }}>@</span>
              <input className="input" value={editUsername} onChange={e=>setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} maxLength={24} style={{ borderRadius:"0 6px 6px 0" }} />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, textTransform:"uppercase", letterSpacing:1, color:"var(--text-light)", display:"block", marginBottom:4 }}>Display Name</label>
            <input className="input" value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={50} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, textTransform:"uppercase", letterSpacing:1, color:"var(--text-light)", display:"block", marginBottom:4 }}>Avatar Color</label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {COLORS.map(c => (
                <button key={c} onClick={()=>setAvatarColor(c)} style={{
                  width:32, height:32, borderRadius:"50%", background:c, border: c===avatarColor ? "3px solid var(--gold)" : "3px solid transparent",
                  cursor:"pointer", transition:"border-color 0.15s",
                }} />
              ))}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <button className="btn btn-primary" onClick={save}>Save</button>
            <button className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
          </div>
          {saveMsg && <div style={{ fontSize:13, marginTop:8, color: saveMsg === "Saved!" ? "var(--success)" : "var(--danger)" }}>{saveMsg}</div>}
        </div>
      )}

      {/* Admin: reset password for this user */}
      {isAdmin && !isOwn && (
        <div style={{ marginTop:20, padding:16, background:"var(--gold-faint)", borderRadius:8, border:"1px solid rgba(155,119,36,0.2)" }}>
          <div style={{ fontSize:12, textTransform:"uppercase", letterSpacing:2, color:"var(--gold)", fontFamily:"var(--font-display)", marginBottom:8 }}>Admin Tools</div>
          <button className="btn btn-secondary btn-sm" onClick={generateReset}>Generate Password Reset Token</button>
          {resetToken && (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:12, color:"var(--text-light)", marginBottom:4 }}>{resetMsg}</div>
              <code style={{ display:"block", padding:8, background:"var(--code-bg)", borderRadius:4, fontSize:12, wordBreak:"break-all", userSelect:"all" }}>{resetToken}</code>
              <p style={{ fontSize:12, color:"var(--text-light)", marginTop:6 }}>Give this token to the user. They can reset their password at <strong>/reset-password</strong>.</p>
            </div>
          )}
          {resetMsg && !resetToken && <div style={{ fontSize:13, marginTop:8, color:"var(--danger)" }}>{resetMsg}</div>}
        </div>
      )}
    </div>
  );
}
