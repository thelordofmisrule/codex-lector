import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { blog as api } from "../lib/api";
import { RichText } from "../lib/markdown";
import ThreadedComments from "../components/ThreadedComments";

function fmt(iso) { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}); }

export default function BlogPostPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    api.get(id).then(d => { setPost(d.post); setReplies(d.replies); }).catch(()=>{}).finally(()=>setLoading(false));
  }, [id]);

  const startEdit = () => { setEditTitle(post.title); setEditBody(post.body); setEditing(true); setPreview(false); };
  const saveEdit = async () => {
    await api.edit(id, { title:editTitle.trim(), body:editBody.trim() });
    setPost(prev => ({...prev, title:editTitle.trim(), body:editBody.trim()}));
    setEditing(false);
  };
  const del = async () => {
    if (!confirm("Delete this post and all its replies? This cannot be undone.")) return;
    await api.delete(id); nav("/blog");
  };

  const postReply = async (body, parentId) => { const r = await api.reply(id, body, parentId); setReplies(prev => [...prev, r]); };
  const editReply = async (rid, body) => { await api.editReply(rid, body); setReplies(prev => prev.map(r => r.id===rid ? {...r, body, updatedAt:new Date().toISOString()} : r)); };
  const deleteReply = async (rid) => {
    await api.deleteReply(rid); setReplies(prev => prev.filter(r => r.id!==rid));
  };

  if (loading) return <div style={{padding:60,textAlign:"center"}}><div className="spinner"/></div>;
  if (!post) return <div style={{padding:60,textAlign:"center",color:"var(--danger)"}}>Post not found.</div>;

  return (
    <div className="animate-in" style={{ maxWidth:720, margin:"0 auto", padding:"40px 24px 80px" }}>
      {editing ? (
        <div style={{ marginBottom:24 }}>
          <input className="input" value={editTitle} onChange={e=>setEditTitle(e.target.value)}
            style={{ fontSize:24, fontFamily:"var(--font-display)", marginBottom:12 }} />
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <button className={`btn btn-sm ${!preview?"btn-primary":"btn-secondary"}`} onClick={()=>setPreview(false)}>Write</button>
            <button className={`btn btn-sm ${preview?"btn-primary":"btn-secondary"}`} onClick={()=>setPreview(true)}>Preview</button>
          </div>
          {preview ? <div style={{ minHeight:150, fontSize:17, lineHeight:1.85 }}><RichText text={editBody} /></div>
            : <textarea className="input" value={editBody} onChange={e=>setEditBody(e.target.value)}
                style={{ minHeight:200, resize:"vertical", lineHeight:1.6, fontFamily:"var(--font-mono)", fontSize:14 }} />}
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button className="btn btn-primary" onClick={saveEdit}>Save</button>
            <button className="btn btn-secondary" onClick={()=>setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:30, letterSpacing:1, marginBottom:8 }}>{post.title}</h1>
          <div style={{ fontSize:14, color:"var(--text-light)", marginBottom:4 }}>
            {post.author} · {fmt(post.createdAt)}
            {user?.isAdmin && (
              <>
                <button className="btn btn-ghost btn-sm" style={{marginLeft:12}} onClick={startEdit}>Edit</button>
                <button className="btn btn-ghost btn-sm" style={{color:"var(--danger)"}} onClick={del}>Delete</button>
              </>
            )}
          </div>
          <div style={{ textAlign:"center", color:"var(--border)", fontSize:14, letterSpacing:8, margin:"20px 0 28px" }}>❧ ❦ ❧</div>
          <div style={{ fontSize:18, lineHeight:1.9 }}>
            <RichText text={post.body} />
          </div>
        </>
      )}

      <ThreadedComments comments={replies} onPost={postReply} onEdit={editReply} onDelete={deleteReply} label="Responses" />
    </div>
  );
}
