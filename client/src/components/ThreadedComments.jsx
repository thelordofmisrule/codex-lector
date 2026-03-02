import { useState } from "react";
import { useAuth } from "../lib/AuthContext";

function fmt(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
}

function Comment({ c, depth, onReply, onEdit, onDelete, defaultCollapsed }) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(defaultCollapsed && c.children?.length > 0);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [editBody, setEditBody] = useState(c.body);
  const canModify = user && (user.id === c.userId || user.isAdmin);
  const hasChildren = c.children?.length > 0;

  const submitReply = () => {
    if (!body.trim()) return;
    onReply(c.id, body.trim());
    setBody(""); setReplying(false);
  };
  const submitEdit = () => {
    if (!editBody.trim()) return;
    onEdit(c.id, editBody.trim());
    setEditing(false);
  };
  const handleDelete = () => {
    if (!confirm("Delete this comment? This cannot be undone.")) return;
    onDelete(c.id);
  };

  return (
    <div className={depth > 0 ? "comment comment-nested" : "comment"}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <div style={{ fontSize:14, display:"flex", alignItems:"center", gap:6 }}>
          {hasChildren && (
            <button className="btn btn-ghost" onClick={()=>setCollapsed(!collapsed)}
              style={{ fontSize:12, padding:"2px 4px", color:"var(--text-light)" }}>
              {collapsed ? `▸ ${c.children.length}` : "▾"}
            </button>
          )}
          <strong style={{ color: c.isAdmin ? "var(--gold)" : "var(--accent)" }}>{c.displayName}</strong>
          {c.isAdmin && <span className="admin-badge">Author</span>}
          <span style={{ color:"var(--text-light)", fontSize:13 }}>{fmt(c.createdAt)}</span>
          {c.updatedAt && c.updatedAt !== c.createdAt && <span style={{ color:"var(--text-light)", fontSize:11, fontStyle:"italic" }}>(edited)</span>}
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {user && <button className="btn btn-ghost btn-sm" onClick={()=>{setReplying(!replying);setEditing(false);}}>Reply</button>}
          {canModify && <button className="btn btn-ghost btn-sm" onClick={()=>{setEditing(!editing);setReplying(false);setEditBody(c.body);}}>Edit</button>}
          {canModify && onDelete && <button className="btn btn-ghost btn-sm" style={{color:"var(--danger)"}} onClick={handleDelete}>✕</button>}
        </div>
      </div>

      {editing ? (
        <div style={{ marginTop:4 }}>
          <textarea className="input" value={editBody} onChange={e=>setEditBody(e.target.value)}
            style={{ minHeight:60, resize:"vertical", fontSize:14 }} />
          <div style={{ display:"flex", gap:6, marginTop:6 }}>
            <button className="btn btn-primary btn-sm" onClick={submitEdit}>Save</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize:16, lineHeight:1.75, color:"var(--text)" }}>
          {c.body.split("\n").map((p,i) => <p key={i} style={{ marginBottom:4 }}>{p}</p>)}
        </div>
      )}

      {replying && (
        <div style={{ marginTop:8, display:"flex", gap:8 }}>
          <textarea className="input" value={body} onChange={e=>setBody(e.target.value)} placeholder="Your reply…"
            style={{ minHeight:50, resize:"vertical", fontSize:14, flex:1 }} autoFocus />
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <button className="btn btn-primary btn-sm" onClick={submitReply}>Post</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>setReplying(false)}>✕</button>
          </div>
        </div>
      )}

      {!collapsed && c.children?.map(child => (
        <Comment key={child.id} c={child} depth={depth+1} onReply={onReply} onEdit={onEdit} onDelete={onDelete} defaultCollapsed={depth >= 2} />
      ))}
    </div>
  );
}

export default function ThreadedComments({ comments, onPost, onEdit, onDelete, label="Discussion" }) {
  const { user } = useAuth();
  const [body, setBody] = useState("");

  const map = {};
  const roots = [];
  comments.forEach(c => { map[c.id] = { ...c, children: [] }; });
  comments.forEach(c => {
    const node = map[c.id];
    if (c.parentId && map[c.parentId]) map[c.parentId].children.push(node);
    else roots.push(node);
  });

  const handleReply = (parentId, text) => onPost(text, parentId);
  const handleTopLevel = () => {
    if (!body.trim()) return;
    onPost(body.trim(), null);
    setBody("");
  };

  return (
    <div>
      <div className="tudor-rule" />
      <h3 style={{ fontFamily:"var(--font-display)", fontSize:18, color:"var(--text-muted)", letterSpacing:2, marginBottom:16 }}>{label}</h3>

      {user ? (
        <div style={{ marginBottom:20 }}>
          <textarea className="input" value={body} onChange={e=>setBody(e.target.value)} placeholder="Share your thoughts…"
            style={{ minHeight:80, resize:"vertical", marginBottom:8, lineHeight:1.7 }} />
          <button className="btn btn-primary" onClick={handleTopLevel}>Post</button>
        </div>
      ) : (
        <p style={{ color:"var(--text-light)", fontStyle:"italic", marginBottom:16, fontFamily:"var(--font-fell)" }}>Sign in to join the discussion.</p>
      )}

      {roots.length === 0 && <p style={{ color:"var(--text-light)", fontStyle:"italic", fontFamily:"var(--font-fell)" }}>No comments yet. Be the first to share your thoughts.</p>}
      {roots.map(c => <Comment key={c.id} c={c} depth={0} onReply={handleReply} onEdit={onEdit} onDelete={onDelete} defaultCollapsed={false} />)}
    </div>
  );
}
