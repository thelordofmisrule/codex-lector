import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { blog as api } from "../lib/api";
import { RichText } from "../lib/markdown";

function fmt(iso) { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}); }

export default function BlogPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => { api.list().then(setPosts).finally(()=>setLoading(false)); }, []);

  const publish = async () => {
    if (!title.trim()||!body.trim()) return;
    const { id } = await api.create(title.trim(), body.trim());
    nav(`/blog/${id}`);
  };

  return (
    <div className="animate-in" style={{ maxWidth:740, margin:"0 auto", padding:"48px 24px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:32 }}>
        <div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:28, letterSpacing:2, marginBottom:4 }}>Commonplace Book</h1>
          <p style={{ fontFamily:"var(--font-fell)", fontStyle:"italic", color:"var(--text-muted)", fontSize:15 }}>
            Essays, notes, and observations upon the works.
            <a href="/rss.xml" target="_blank" rel="noopener" style={{ marginLeft:10, fontSize:12, color:"var(--gold)", textDecoration:"none", fontStyle:"normal" }} title="RSS Feed">📡 RSS</a>
          </p>
        </div>
        {user?.isAdmin && <button className={`btn ${writing?"btn-secondary":"btn-primary"}`} onClick={()=>setWriting(!writing)}>{writing?"Cancel":"✎ Write"}</button>}
      </div>

      {writing && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:24, marginBottom:28 }}>
          <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title"
            style={{ fontSize:22, fontFamily:"var(--font-display)", border:"none", borderBottom:"1px solid var(--border-light)", borderRadius:0, padding:"8px 0", marginBottom:14 }} />
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <button className={`btn btn-sm ${!preview?"btn-primary":"btn-secondary"}`} onClick={()=>setPreview(false)}>Write</button>
            <button className={`btn btn-sm ${preview?"btn-primary":"btn-secondary"}`} onClick={()=>setPreview(true)}>Preview</button>
          </div>
          {preview ? (
            <div style={{ minHeight:200, padding:"12px 0", fontSize:17, lineHeight:1.85 }}><RichText text={body} /></div>
          ) : (
            <div>
              <textarea className="input" value={body} onChange={e=>setBody(e.target.value)}
                placeholder={"Write in Markdown…\n\n*italic* **bold** [link](url)\n![image](url)\n> blockquote\n\nYouTube/Vimeo URLs auto-embed."}
                style={{ minHeight:200, resize:"vertical", lineHeight:1.6, fontFamily:"var(--font-mono)", fontSize:14, border:"none", padding:"8px 0" }} />
              <div style={{ fontSize:12, color:"var(--text-light)", marginTop:4 }}>
                Supports: *italic*, **bold**, [links](url), ![images](url), &gt; blockquotes, `code`, ## headings, YouTube/Vimeo auto-embed
              </div>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}><button className="btn btn-primary" onClick={publish}>Publish</button></div>
        </div>
      )}

      {loading && <div style={{textAlign:"center"}}><div className="spinner"/></div>}
      {!loading && posts.length===0 && !writing && (
        <div style={{ textAlign:"center", padding:48, color:"var(--text-light)" }}>
          <div style={{ fontSize:36, opacity:0.3, marginBottom:8 }}>📜</div>
          <p style={{ fontFamily:"var(--font-fell)", fontStyle:"italic" }}>No posts yet.</p>
        </div>
      )}

      {posts.map(p => (
        <article key={p.id} onClick={()=>nav(`/blog/${p.id}`)} style={{
          background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8,
          padding:"24px 28px", marginBottom:16, cursor:"pointer", transition:"all 0.15s",
        }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--gold-light)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border-light)";}}
        >
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:500, marginBottom:6 }}>{p.title}</h2>
          <div style={{ fontSize:13, color:"var(--text-light)", marginBottom:12 }}>
            {p.author} · {fmt(p.createdAt)}
            {p.replyCount > 0 && <span style={{ marginLeft:12 }}>{p.replyCount} {p.replyCount===1?"reply":"replies"}</span>}
          </div>
          <div style={{ fontSize:16, lineHeight:1.75, color:"var(--text-muted)", overflow:"hidden", display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical" }}>
            {p.body.replace(/[*#>\[\]!`]/g, "").slice(0,300)}
          </div>
        </article>
      ))}
    </div>
  );
}
