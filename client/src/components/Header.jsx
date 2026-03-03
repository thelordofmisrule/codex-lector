import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { auth as authApi, notifications as notifApi } from "../lib/api";
import AuthModal from "./AuthModal";

export default function Header() {
  const { user, logout, dark, toggleDark } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [menu, setMenu] = useState(false);
  const [changePw, setChangePw] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const nav = useNavigate();
  const loc = useLocation();

  const links = [
    { to:"/", label:"Works" },
    { to:"/layers", label:"Layers" },
    { to:"/forum", label:"Forum" },
    { to:"/blog", label:"Blog" },
    { to:"/search", label:"🔍" },
  ];
  const active = to => to==="/" ? (loc.pathname==="/"||loc.pathname.startsWith("/read")) : loc.pathname.startsWith(to);

  const submitPw = async () => {
    setPwMsg("");
    try { await authApi.changePassword(curPw, newPw); setPwMsg("Password changed!"); setCurPw(""); setNewPw(""); }
    catch (e) { setPwMsg(e.message); }
  };

  // Poll notifications every 30s
  const loadNotifs = useCallback(async () => {
    if (!user) return;
    try {
      const d = await notifApi.list();
      setNotifs(d.notifications || []);
      setUnread(d.unreadCount || 0);
    } catch {}
  }, [user]);
  useEffect(() => { loadNotifs(); const t=setInterval(loadNotifs,30000); return ()=>clearInterval(t); }, [loadNotifs]);

  const openNotif = async (n) => {
    if (!n.read) { await notifApi.markRead(n.id); setUnread(u=>Math.max(0,u-1)); setNotifs(prev=>prev.map(x=>x.id===n.id?{...x,read:1}:x)); }
    setShowNotifs(false);
    if (n.link) nav(n.link);
  };
  const markAllRead = async () => { await notifApi.markAllRead(); setUnread(0); setNotifs(prev=>prev.map(x=>({...x,read:1}))); };

  return (
    <>
      <header style={{
        position:"sticky", top:0, zIndex:100,
        background: dark ? "rgba(26,22,18,0.95)" : "rgba(242,235,217,0.94)",
        backdropFilter:"blur(12px)", borderBottom:"1px solid var(--border)", padding:"0 24px",
      }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:58 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            {loc.pathname!=="/" && <button className="btn btn-ghost" aria-label="Go back" onClick={()=>nav(-1)} style={{fontSize:18}}>←</button>}
            <div
              role="button"
              tabIndex={0}
              aria-label="Go to home"
              onClick={()=>nav("/")}
              onKeyDown={(e)=>{ if (e.key === "Enter" || e.key === " ") nav("/"); }}
              style={{ cursor:"pointer", display:"flex", alignItems:"baseline", gap:8 }}
            >
              <span style={{ fontFamily:"'Cinzel Decorative',var(--font-display)", fontSize:20, fontWeight:700, color:"var(--accent)", letterSpacing:1 }}>Codex</span>
              <span style={{ fontFamily:"var(--font-display)", fontSize:12, color:"var(--gold)", letterSpacing:3, textTransform:"uppercase" }}>Lector</span>
            </div>
          </div>

          <nav style={{ display:"flex", gap:2 }}>
            {links.map(l => (
              <button key={l.to} className="btn btn-ghost" onClick={()=>nav(l.to)} style={{
                padding:"8px 14px", fontFamily:"var(--font-display)", fontSize:13,
                color:active(l.to)?"var(--accent)":"var(--text-muted)", fontWeight:active(l.to)?600:400,
              }}>{l.label}</button>
            ))}
          </nav>

          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {/* Notification bell */}
            {user && (
              <div style={{ position:"relative" }}>
                <button className="btn btn-ghost" aria-label="Toggle notifications" onClick={()=>{setShowNotifs(!showNotifs);setMenu(false);}} title="Notifications" style={{
                  fontSize:18, padding:"6px 10px", position:"relative",
                }}>
                  🔔
                  {unread > 0 && <span style={{ position:"absolute", top:2, right:2, width:16, height:16, borderRadius:"50%", background:"var(--danger)", color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{unread > 9 ? "9+" : unread}</span>}
                </button>
                {showNotifs && <div onClick={()=>setShowNotifs(false)} style={{ position:"fixed", inset:0, zIndex:199 }} />}
                {showNotifs && (
                  <div style={{ position:"absolute", top:42, right:0, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, boxShadow:"0 8px 24px var(--shadow)", width:320, maxHeight:400, overflowY:"auto", zIndex:200 }}>
                    <div style={{ padding:"10px 14px", borderBottom:"1px solid var(--border-light)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontFamily:"var(--font-display)", fontSize:13, letterSpacing:1, color:"var(--accent)" }}>NOTIFICATIONS</span>
                      {unread > 0 && <button className="btn btn-ghost" onClick={markAllRead} style={{ fontSize:11, color:"var(--text-light)" }}>Mark all read</button>}
                    </div>
                    {notifs.length === 0 ? (
                      <div style={{ padding:20, textAlign:"center", color:"var(--text-light)", fontStyle:"italic", fontSize:14 }}>No notifications yet.</div>
                    ) : notifs.slice(0,20).map(n => (
                      <div key={n.id} onClick={()=>openNotif(n)} style={{
                        padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid var(--border-light)",
                        background: n.read ? "transparent" : "var(--accent-faint)",
                        transition:"background 0.1s",
                      }} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-faint)"} onMouseLeave={e=>e.currentTarget.style.background=n.read?"transparent":"var(--accent-faint)"}>
                        <div style={{ fontSize:14, lineHeight:1.5, color:"var(--text)" }}>{n.message}</div>
                        <div style={{ fontSize:11, color:"var(--text-light)", marginTop:2 }}>{new Date(n.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Dark mode toggle */}
            <button className="btn btn-ghost" aria-label={dark?"Switch to light mode":"Switch to dark mode"} onClick={toggleDark} title={dark?"Light mode":"Dark mode"} style={{
              fontSize:20, padding:"6px 10px", borderRadius:6,
              background: dark ? "rgba(255,248,240,0.08)" : "rgba(0,0,0,0.05)",
              border:"1px solid var(--border-light)",
            }}>
              {dark ? "☀️" : "🌙"}
            </button>

            {user ? (
              <div style={{ position:"relative" }}>
                {user.oauthAvatar ? (
                  <button className="btn" onClick={()=>{setMenu(!menu);setChangePw(false);}} style={{
                    width:36, height:36, borderRadius:"50%", padding:0, border:"2px solid var(--accent)", overflow:"hidden",
                    display:"flex", alignItems:"center", justifyContent:"center", background:"var(--surface)",
                  }}><img src={user.oauthAvatar} alt="Profile avatar" style={{ width:"100%", height:"100%", objectFit:"cover" }} /></button>
                ) : (
                  <button className="btn" onClick={()=>{setMenu(!menu);setChangePw(false);}} style={{
                    background:"var(--accent)", color:"#FFF8F0", width:36, height:36, borderRadius:"50%",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:600, fontFamily:"var(--font-display)",
                  }}>{user.displayName?.[0]?.toUpperCase()||"?"}</button>
                )}
                {menu && <div onClick={()=>setMenu(false)} style={{ position:"fixed", inset:0, zIndex:199 }} />}
                {menu && (
                  <div style={{ position:"absolute", top:44, right:0, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:8, boxShadow:"0 8px 24px var(--shadow)", minWidth:210, zIndex:200 }}>
                    <div style={{ padding:"8px 12px", borderBottom:"1px solid var(--border-light)", marginBottom:4 }}>
                      <div style={{ fontWeight:600, fontSize:15 }}>{user.displayName}</div>
                      <div style={{ fontSize:12, color:"var(--text-light)" }}>
                        @{user.username}
                        {user.isAdmin&&<span className="admin-badge" style={{marginLeft:4}}>Admin</span>}
                        {user.oauthProvider && <span style={{ marginLeft:4, opacity:0.6 }}>via {user.oauthProvider}</span>}
                      </div>
                    </div>
                    <button className="btn btn-ghost" onClick={()=>{nav(`/profile/${user.username}`);setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>👤 My Profile</button>
                    <button className="btn btn-ghost" onClick={()=>{nav("/my-annotations");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>📖 My Annotations</button>
                    <button className="btn btn-ghost" onClick={()=>{nav("/my-bookmarks");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>🔖 My Bookmarks</button>
                    <button className="btn btn-ghost" onClick={()=>{nav("/my-library");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>📊 My Library</button>
                    <button className="btn btn-ghost" onClick={()=>{nav("/layers");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>📚 Annotation Layers</button>
                    {!user.oauthProvider && (
                      <button className="btn btn-ghost" onClick={()=>setChangePw(!changePw)} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>🔑 Change Password</button>
                    )}
                    {changePw && !user.oauthProvider && (
                      <div style={{ padding:"8px 12px" }}>
                        <input className="input" type="password" placeholder="Current" value={curPw} onChange={e=>setCurPw(e.target.value)} style={{ fontSize:13, marginBottom:6 }} />
                        <input className="input" type="password" placeholder="New (6+ chars)" value={newPw} onChange={e=>setNewPw(e.target.value)} style={{ fontSize:13, marginBottom:6 }} />
                        <button className="btn btn-primary btn-sm" onClick={submitPw}>Update</button>
                        {pwMsg && <div style={{ fontSize:12, marginTop:4, color:pwMsg.includes("changed")?"var(--success)":"var(--danger)" }}>{pwMsg}</div>}
                      </div>
                    )}
                    <button className="btn btn-ghost" onClick={()=>{logout();setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", color:"var(--danger)", fontSize:14 }}>Sign Out</button>
                  </div>
                )}
              </div>
            ) : (
              <button className="btn btn-primary" onClick={()=>setShowAuth(true)} style={{ padding:"6px 16px", fontSize:13, fontFamily:"var(--font-display)" }}>Sign In</button>
            )}
          </div>
        </div>
      </header>
      {showAuth && <AuthModal onClose={()=>setShowAuth(false)} />}
    </>
  );
}
