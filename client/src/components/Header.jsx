import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { auth as authApi, chat as chatApi, notifications as notifApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";
import AuthModal from "./AuthModal";

const THEME_OPTIONS = [
  { id:"light", label:"Light", icon:"☀️", note:"Parchment and candlelight" },
  { id:"dark", label:"Dark", icon:"🌙", note:"Night reading" },
  { id:"eva", label:"Evangelion GUI", icon:"GUI", note:"NERV command deck" },
];

export default function Header() {
  const { user, authReady, logout, themeMode, setThemeMode } = useAuth();
  const toast = useToast();
  const [showAuth, setShowAuth] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [menu, setMenu] = useState(false);
  const [changePw, setChangePw] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [showNotifs, setShowNotifs] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 860);
  const chatRefreshTimerRef = useRef(null);
  const nav = useNavigate();
  const loc = useLocation();
  const currentTheme = THEME_OPTIONS.find(option => option.id === themeMode) || THEME_OPTIONS[0];
  const darkChrome = themeMode === "dark" || themeMode === "eva";
  const headerBackground = themeMode === "dark"
    ? "rgba(26,22,18,0.95)"
    : themeMode === "eva"
      ? "rgba(10,13,11,0.96)"
      : "rgba(242,235,217,0.94)";

  const links = [
    { to:"/", label:"Works" },
    { to:"/people", label:"People" },
    { to:"/places", label:"Places" },
    { to:"/chat", label:"Chat" },
    { to:"/year-of-shakespeare", label:"Year" },
    { to:"/how-to", label:"How To" },
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
      setNotifs((d.notifications || []).filter(n => !n.read));
      setUnread(d.unreadCount || 0);
    } catch {}
  }, [user]);
  const loadChatSummary = useCallback(async () => {
    if (!user) return;
    try {
      const d = await chatApi.summary();
      setChatUnread(!!d?.hasUnread);
    } catch {}
  }, [user]);
  useEffect(() => {
    if (!user) {
      setNotifs([]);
      setUnread(0);
      setChatUnread(false);
      return undefined;
    }
    const initialLoad = setTimeout(() => {
      loadNotifs();
      loadChatSummary();
    }, 1500);
    const interval = setInterval(() => {
      loadNotifs();
      loadChatSummary();
    }, 30000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadChatSummary, loadNotifs, user]);
  useEffect(() => {
    if (!user) return undefined;
    const source = new EventSource("/api/chat/stream");
    const refresh = () => {
      if (chatRefreshTimerRef.current) clearTimeout(chatRefreshTimerRef.current);
      chatRefreshTimerRef.current = setTimeout(() => {
        loadChatSummary();
        loadNotifs();
      }, 250);
    };
    source.addEventListener("message", refresh);
    source.addEventListener("delete", refresh);
    source.onerror = () => {};
    return () => {
      if (chatRefreshTimerRef.current) clearTimeout(chatRefreshTimerRef.current);
      source.close();
    };
  }, [loadChatSummary, loadNotifs, user]);
  useEffect(() => {
    if (!user) return undefined;
    const refresh = () => {
      loadChatSummary();
      loadNotifs();
    };
    window.addEventListener("codex:chat-summary-refresh", refresh);
    return () => window.removeEventListener("codex:chat-summary-refresh", refresh);
  }, [loadChatSummary, loadNotifs, user]);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const renderNavLabel = (label) => {
    const textLabel = label;
    if (label !== "Chat") return textLabel;
    return (
      <span style={{ display:"inline-flex", alignItems:"center", gap:7 }}>
        <span>{textLabel}</span>
        <span
          aria-hidden="true"
          style={{
            width:8,
            height:8,
            borderRadius:"50%",
            background: chatUnread ? "var(--success)" : "rgba(0,0,0,0.14)",
            boxShadow: chatUnread ? "0 0 0 3px rgba(67,122,61,0.12)" : "none",
            transition:"background 0.15s ease, box-shadow 0.15s ease",
          }}
        />
      </span>
    );
  };

  const markNotifRead = async (n) => {
    if (!n.read) {
      const prevNotifs = notifs;
      const prevUnread = unread;
      setUnread(u=>Math.max(0,u-1));
      setNotifs(prev=>prev.filter(x=>x.id!==n.id));
      try {
        await notifApi.markRead(n.id);
      } catch (e) {
        setNotifs(prevNotifs);
        setUnread(prevUnread);
        toast?.error(e.message || "Could not update notification.");
        return false;
      }
    }
    return true;
  };
  const openNotif = async (n) => {
    const ok = await markNotifRead(n);
    if (!ok) return;
    setShowNotifs(false);
    if (n.link) nav(n.link);
  };
  const markAllRead = async () => {
    const prevNotifs = notifs;
    const prevUnread = unread;
    setUnread(0);
    setNotifs([]);
    try {
      await notifApi.markAllRead();
    } catch (e) {
      setNotifs(prevNotifs);
      setUnread(prevUnread);
      toast?.error(e.message || "Could not mark notifications as read.");
    }
  };

  return (
    <>
      <header style={{
        position:"sticky", top:0, zIndex:100,
        background: headerBackground,
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
              <span className="eva-brand-word" style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:700, color:"var(--accent)", letterSpacing:1 }}>Codex</span>
              <span className="eva-brand-subword" style={{ fontFamily:"var(--font-display)", fontSize:12, color:"var(--gold)", letterSpacing:3, textTransform:"uppercase" }}>Lector</span>
            </div>
          </div>

          {!isMobile && <nav style={{ display:"flex", gap:2 }}>
            {links.map(l => (
              <button key={l.to} className="btn btn-ghost" onClick={()=>nav(l.to)} style={{
                padding:"8px 14px", fontFamily:"var(--font-display)", fontSize:13,
                color:active(l.to)?"var(--accent)":"var(--text-muted)", fontWeight:active(l.to)?600:400,
              }}>{renderNavLabel(l.label)}</button>
            ))}
          </nav>}

          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {isMobile && (
              <div style={{ position:"relative" }}>
                <button className="btn btn-ghost" aria-label="Toggle navigation menu" onClick={()=>{setShowMobileNav(!showMobileNav);setMenu(false);setShowNotifs(false);setShowThemes(false);}} style={{ fontSize:16, padding:"6px 10px" }}>
                  ☰
                </button>
                {showMobileNav && <div onClick={()=>setShowMobileNav(false)} style={{ position:"fixed", inset:0, zIndex:199 }} />}
                {showMobileNav && (
                  <div style={{ position:"absolute", top:42, right:0, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, boxShadow:"0 8px 24px var(--shadow)", minWidth:180, padding:8, zIndex:200 }}>
                    {links.map(l => (
                      <button key={l.to} className="btn btn-ghost" onClick={()=>{nav(l.to);setShowMobileNav(false);}} style={{
                        width:"100%", textAlign:"left", padding:"8px 10px", fontSize:14,
                        color:active(l.to)?"var(--accent)":"var(--text-muted)", fontWeight:active(l.to)?600:400,
                      }}>{l.label === "🔍" ? "Search" : renderNavLabel(l.label)}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notification bell */}
            {user && (
              <div style={{ position:"relative" }}>
                <button className="btn btn-ghost" aria-label="Toggle notifications" onClick={()=>{setShowNotifs(!showNotifs);setMenu(false);setShowMobileNav(false);setShowThemes(false);}} title="Notifications" style={{
                  fontSize:18, padding:"6px 10px", position:"relative",
                }}>
                  {themeMode === "eva" ? (
                    <span className="eva-alert-chip">ALRT</span>
                  ) : (
                    "🔔"
                  )}
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
                      <div key={n.id} style={{
                        padding:"10px 14px", borderBottom:"1px solid var(--border-light)",
                        background:"var(--accent-faint)",
                        transition:"background 0.1s",
                      }} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-faint)"} onMouseLeave={e=>e.currentTarget.style.background="var(--accent-faint)"}>
                        <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                          <button className="btn btn-ghost btn-sm" onClick={()=>openNotif(n)} style={{ flex:1, textAlign:"left", padding:0, fontSize:14, lineHeight:1.5, color:"var(--text)" }}>
                            {n.message}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e)=>{ e.stopPropagation(); markNotifRead(n); }}
                            style={{ fontSize:11, color:"var(--text-light)", whiteSpace:"nowrap", padding:"2px 4px" }}
                            title="Mark as read"
                          >
                            Mark read
                          </button>
                        </div>
                        <div style={{ fontSize:11, color:"var(--text-light)", marginTop:2 }}>{new Date(n.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Theme picker */}
            <div style={{ position:"relative" }}>
              <button className="btn btn-ghost" aria-label="Choose theme" onClick={()=>{setShowThemes(!showThemes);setMenu(false);setShowMobileNav(false);setShowNotifs(false);}} title={`Theme: ${currentTheme.label}`} style={{
                fontSize: currentTheme.id === "eva" ? 11 : 19,
                padding:"6px 10px", borderRadius:6,
                background: darkChrome ? "rgba(255,248,240,0.08)" : "rgba(0,0,0,0.05)",
                border:"1px solid var(--border-light)",
                minWidth:44, fontFamily: currentTheme.id === "eva" ? "var(--font-display)" : undefined,
                letterSpacing: currentTheme.id === "eva" ? 1.2 : 0,
              }}>
                {currentTheme.icon}
              </button>
              {showThemes && <div onClick={()=>setShowThemes(false)} style={{ position:"fixed", inset:0, zIndex:199 }} />}
              {showThemes && (
                <div style={{ position:"absolute", top:42, right:0, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, boxShadow:"0 8px 24px var(--shadow)", minWidth:220, padding:8, zIndex:200 }}>
                  {THEME_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      className="btn"
                      onClick={()=>{setThemeMode(option.id);setShowThemes(false);}}
                      style={{
                        width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:6, background: themeMode===option.id ? "var(--accent-faint)" : "transparent",
                        color: themeMode===option.id ? "var(--accent)" : "var(--text)", border:"1px solid transparent", marginBottom:4,
                      }}
                    >
                      <span style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                        <span style={{ fontFamily:"var(--font-display)", fontSize:13, letterSpacing: option.id === "eva" ? 0.8 : 0 }}>{option.label}</span>
                        <span style={{ fontSize: option.id === "eva" ? 11 : 16, fontFamily: option.id === "eva" ? "var(--font-display)" : undefined }}>{option.icon}</span>
                      </span>
                      <span style={{ display:"block", fontSize:11, color:"var(--text-light)", marginTop:2 }}>{option.note}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {user ? (
              <div style={{ position:"relative" }}>
                {user.oauthAvatar ? (
                  <button className="btn" onClick={()=>{setMenu(!menu);setChangePw(false);setShowMobileNav(false);setShowThemes(false);}} style={{
                    width:36, height:36, borderRadius:"50%", padding:0, border:"2px solid var(--accent)", overflow:"hidden",
                    display:"flex", alignItems:"center", justifyContent:"center", background:"var(--surface)",
                  }}><img src={user.oauthAvatar} alt="Profile avatar" style={{ width:"100%", height:"100%", objectFit:"cover" }} /></button>
                ) : (
                  <button className="btn" onClick={()=>{setMenu(!menu);setChangePw(false);setShowMobileNav(false);setShowThemes(false);}} style={{
                    background:"var(--accent)", color:"var(--accent-contrast)", width:36, height:36, borderRadius:"50%",
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
                        {user.canPublishGlobal&&<span className="admin-badge" style={{marginLeft:4}}>Editorial</span>}
                        {user.oauthProvider && <span style={{ marginLeft:4, opacity:0.6 }}>via {user.oauthProvider}</span>}
                      </div>
                    </div>
                    <button className="btn btn-ghost" onClick={()=>{nav(`/profile/${user.username}`);setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>👤 My Profile</button>
                    <button className="btn btn-ghost" onClick={()=>{nav("/my-annotations");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>📖 My Annotations</button>
                    <button className="btn btn-ghost" onClick={()=>{nav("/my-bookmarks");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>🔖 My Bookmarks</button>
                    <button className="btn btn-ghost" onClick={()=>{nav("/my-library");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>📊 My Library</button>
                    <button className="btn btn-ghost" onClick={()=>{nav("/layers");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>📚 Annotation Layers</button>
                    {user.isAdmin && (
                      <>
                        <button className="btn btn-ghost" onClick={()=>{nav("/admin-analytics");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>📈 Admin Analytics</button>
                        <button className="btn btn-ghost" onClick={()=>{nav("/admin-reports");setMenu(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", fontSize:14 }}>🚩 Moderation Reports</button>
                      </>
                    )}
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
            ) : authReady ? (
              <button className="btn btn-primary" onClick={()=>setShowAuth(true)} style={{ padding:"6px 16px", fontSize:13, fontFamily:"var(--font-display)" }}>Sign In</button>
            ) : (
              <div style={{ width:78, height:34 }} aria-hidden="true" />
            )}
          </div>
        </div>
      </header>
      {showAuth && <AuthModal onClose={()=>setShowAuth(false)} />}
    </>
  );
}
