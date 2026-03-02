import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { bookmarks as api } from "../lib/api";

function fmt(iso) { try { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); } catch { return ""; } }

export default function MyBookmarksPage() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    api.myAll().then(setBookmarks).catch(()=>{}).finally(()=>setLoading(false));
  }, [user]);

  const remove = async (slug) => {
    if (!confirm("Remove this bookmark?")) return;
    await api.remove(slug);
    setBookmarks(prev => prev.filter(b => b.work_slug !== slug));
  };

  if (!user) return (
    <div className="animate-in" style={{ maxWidth:600, margin:"60px auto", padding:"0 24px", textAlign:"center" }}>
      <p style={{ color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>Sign in to view your bookmarks.</p>
    </div>
  );

  return (
    <div className="animate-in" style={{ maxWidth:640, margin:"0 auto", padding:"48px 24px 80px" }}>
      <h1 style={{ fontFamily:"var(--font-display)", fontSize:28, letterSpacing:2, marginBottom:4 }}>My Bookmarks</h1>
      <p style={{ fontFamily:"var(--font-fell)", fontStyle:"italic", color:"var(--text-muted)", fontSize:15, marginBottom:28 }}>
        Pick up right where you left off.
      </p>

      {loading ? (
        <div style={{ padding:40, textAlign:"center" }}><div className="spinner" /></div>
      ) : bookmarks.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic", lineHeight:1.8 }}>
          No bookmarks yet. While reading, tap the 🔖 button in the toolbar to save your place.
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {bookmarks.map(b => (
            <div key={b.work_slug} style={{
              padding:"14px 18px", background:"var(--surface)", borderRadius:8,
              border:"1px solid var(--border-light)", display:"flex", alignItems:"center", gap:14,
            }}>
              <span style={{ fontSize:22, flexShrink:0 }}>🔖</span>
              <div style={{ flex:1, minWidth:0 }}>
                <Link to={`/read/${b.work_slug}`} style={{
                  fontFamily:"var(--font-display)", fontSize:16, color:"var(--accent)", textDecoration:"none", letterSpacing:0.5,
                }}
                  onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
                  onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
                  {b.work_title}
                </Link>
                {b.line_text && (
                  <div style={{ fontSize:13, color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    "{b.line_text}"
                  </div>
                )}
                <div style={{ fontSize:11, color:"var(--text-light)", marginTop:3 }}>
                  Last updated {fmt(b.updated_at)}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={()=>remove(b.work_slug)} title="Remove bookmark"
                style={{ fontSize:14, color:"var(--text-light)", padding:"4px 8px", flexShrink:0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
