import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { forum as api } from "../lib/api";
import { useToast } from "../lib/ToastContext";

function fmt(iso) { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}); }

export default function ForumPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [threads, setThreads] = useState([]);
  const [tags, setTags] = useState([]);
  const [activeTag, setActiveTag] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selTags, setSelTags] = useState([]);

  useEffect(() => {
    api.tags().then(setTags).catch(() => toast?.error("Could not load forum channels."));
  }, [toast]);
  useEffect(() => {
    setLoading(true);
    api.list(activeTag, search)
      .then(setThreads)
      .catch(() => toast?.error("Could not load forum threads."))
      .finally(()=>setLoading(false));
  }, [activeTag, search, toast]);

  const create = async () => {
    if (!title.trim()||!body.trim()) return;
    try {
      const { id } = await api.create(title.trim(), body.trim(), selTags);
      nav(`/forum/${id}`);
    } catch (e) {
      toast?.error(e.message || "Could not create thread.");
    }
  };

  const toggleTag = id => setSelTags(prev => prev.includes(id) ? prev.filter(t=>t!==id) : [...prev,id]);

  return (
    <div className="animate-in" style={{ maxWidth:900,margin:"0 auto",padding:"48px 24px",display:"flex",gap:32 }}>
      {/* Sidebar: tags */}
      <aside style={{ width:200,flexShrink:0 }}>
        <h3 style={{ fontFamily:"var(--font-display)",fontSize:13,letterSpacing:2,textTransform:"uppercase",color:"var(--text-light)",marginBottom:12 }}>Channels</h3>
        <button className={`btn btn-ghost`} onClick={()=>setActiveTag("")}
          style={{ display:"block",width:"100%",textAlign:"left",padding:"6px 10px",fontSize:14,marginBottom:2,
            color:!activeTag?"var(--accent)":"var(--text-muted)",fontWeight:!activeTag?600:400,background:!activeTag?"var(--accent-faint)":"transparent",borderRadius:5 }}>
          All Threads
        </button>
        {tags.map(t => (
          <button key={t.id} className="btn btn-ghost" onClick={()=>setActiveTag(t.name)}
            style={{ display:"block",width:"100%",textAlign:"left",padding:"6px 10px",fontSize:14,marginBottom:2,
              color:activeTag===t.name?"var(--accent)":"var(--text-muted)",fontWeight:activeTag===t.name?600:400,
              background:activeTag===t.name?"var(--accent-faint)":"transparent",borderRadius:5 }}>
            <span style={{ display:"inline-block",width:8,height:8,borderRadius:"50%",background:t.color,marginRight:8 }} />
            {t.name}
            {t.threadCount>0 && <span style={{float:"right",fontSize:12,color:"var(--text-light)"}}>{t.threadCount}</span>}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div style={{ flex:1 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24 }}>
          <div>
            <h1 style={{ fontFamily:"var(--font-display)",fontSize:28,letterSpacing:2,marginBottom:4 }}>Forum</h1>
            <p style={{ fontFamily:"var(--font-fell)",fontStyle:"italic",color:"var(--text-muted)",fontSize:15 }}>
              A place for discourse upon all matters Shakespearean.
            </p>
          </div>
          {user && <button className={`btn ${writing?"btn-secondary":"btn-primary"}`} onClick={()=>setWriting(!writing)}>
            {writing?"Cancel":"New Thread"}
          </button>}
        </div>

        {/* Search */}
        <div style={{ marginBottom:20 }}>
          <input className="input" placeholder="Search threads…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ fontFamily:"var(--font-fell)",fontStyle:"italic" }} />
        </div>

        {/* New thread form */}
        {writing && (
          <div style={{ background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,padding:24,marginBottom:24 }}>
            <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Thread title"
              style={{ fontSize:20,fontFamily:"var(--font-display)",border:"none",borderBottom:"1px solid var(--border-light)",borderRadius:0,padding:"8px 0",marginBottom:12 }} />
            <textarea className="input" value={body} onChange={e=>setBody(e.target.value)} placeholder="Begin your discourse…"
              style={{ minHeight:120,resize:"vertical",lineHeight:1.8,fontFamily:"var(--font-fell)",border:"none",padding:"8px 0",marginBottom:12 }} />
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12,color:"var(--text-light)",marginBottom:6,textTransform:"uppercase",letterSpacing:1 }}>Tags</div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
                {tags.map(t => (
                  <span key={t.id} className={`tag-chip ${selTags.includes(t.id)?"active":""}`}
                    onClick={()=>toggleTag(t.id)}
                    style={{ background:selTags.includes(t.id)?t.color+"22":"var(--bg-dark)", color:selTags.includes(t.id)?t.color:"var(--text-muted)" }}>
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display:"flex",justifyContent:"flex-end" }}>
              <button className="btn btn-primary" onClick={create}>Post Thread</button>
            </div>
          </div>
        )}

        {loading && <div style={{textAlign:"center",padding:20}}><div className="spinner"/></div>}

        {!loading && threads.length===0 && !writing && (
          <div style={{ textAlign:"center",padding:48,color:"var(--text-light)" }}>
            <div style={{ fontSize:36,opacity:0.3,marginBottom:8 }}>🏛</div>
            <p style={{ fontFamily:"var(--font-fell)",fontStyle:"italic" }}>
              {activeTag ? `No threads in "${activeTag}" yet.` : search ? "No threads match your search." : user?"Start the first thread.":"Sign in to begin a discussion."}
            </p>
          </div>
        )}

        {threads.map(t => (
          <button key={t.id} onClick={()=>nav(`/forum/${t.id}`)} style={{
            display:"block",width:"100%",textAlign:"left",background:"var(--surface)",
            border:"1px solid var(--border-light)",borderRadius:8,padding:"16px 20px",
            marginBottom:10,cursor:"pointer",transition:"all 0.15s",
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--gold-light)";e.currentTarget.style.background="var(--surface-hover)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border-light)";e.currentTarget.style.background="var(--surface)";}}
          >
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <h3 style={{ fontFamily:"var(--font-display)",fontSize:17,fontWeight:500,marginBottom:4 }}>{t.title}</h3>
              <span style={{ fontSize:12,color:"var(--text-light)",whiteSpace:"nowrap",marginLeft:16 }}>
                {t.replyCount} {t.replyCount===1?"reply":"replies"}
              </span>
            </div>
            <div style={{ fontSize:13,color:"var(--text-light)",marginBottom:4 }}>
              <strong style={{ color:t.isAdmin?"var(--gold)":"var(--accent)" }}>{t.displayName}</strong>
              {t.isAdmin && <span className="admin-badge">Author</span>}
              <span style={{ marginLeft:8 }}>{fmt(t.createdAt)}</span>
            </div>
            {t.tags?.length > 0 && (
              <div style={{ display:"flex",gap:4,marginTop:4 }}>
                {t.tags.map(tag => (
                  <span key={tag.id} className="tag-chip" style={{ background:tag.color+"18",color:tag.color,fontSize:11,cursor:"default" }}>{tag.name}</span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
