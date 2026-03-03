import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { blog as api } from "../lib/api";
import { RichText } from "../lib/markdown";
import ThreadedComments from "../components/ThreadedComments";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";

function fmt(iso) { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}); }

export default function BlogPostPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const nav = useNavigate();
  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editHeaderImage, setEditHeaderImage] = useState("");
  const [preview, setPreview] = useState(false);
  const draftKey = `draft:blog:edit:${id}`;

  useEffect(() => {
    api.get(id).then(d => { setPost(d.post); setReplies(d.replies); })
      .catch(() => toast?.error("Could not load post."))
      .finally(()=>setLoading(false));
  }, [id, toast]);

  const startEdit = () => {
    let draft = {};
    try { draft = JSON.parse(localStorage.getItem(draftKey) || "{}"); } catch {}
    setEditTitle(draft.title ?? post.title);
    setEditBody(draft.body ?? post.body);
    setEditHeaderImage(draft.headerImage ?? (post.headerImage || ""));
    setEditing(true);
    setPreview(false);
  };

  useEffect(() => {
    if (!editing) return;
    localStorage.setItem(draftKey, JSON.stringify({ title:editTitle, body:editBody, headerImage:editHeaderImage }));
  }, [editing, editTitle, editBody, editHeaderImage, draftKey]);

  const uploadHeaderImage = async (file) => {
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const uploaded = await api.uploadImage(file.name, file.type, dataUrl);
    setEditHeaderImage(uploaded.url);
    toast?.success("Header image uploaded.");
  };

  const saveEdit = async () => {
    try {
      await api.edit(id, { title:editTitle.trim(), body:editBody.trim(), headerImage:editHeaderImage });
      setPost(prev => ({...prev, title:editTitle.trim(), body:editBody.trim(), headerImage:editHeaderImage}));
      setEditing(false);
      localStorage.removeItem(draftKey);
      toast?.success("Post updated.");
    } catch (e) {
      toast?.error(e.message || "Could not update post.");
    }
  };
  const del = async () => {
    const ok = await confirm({
      title: "Delete Post",
      message: "Delete this post and all its replies? This cannot be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(id);
      toast?.success("Post deleted.");
      nav("/blog");
    } catch (e) {
      toast?.error(e.message || "Could not delete post.");
    }
  };

  const postReply = async (body, parentId) => { const r = await api.reply(id, body, parentId); setReplies(prev => [...prev, r]); };
  const editReply = async (rid, body) => { await api.editReply(rid, body); setReplies(prev => prev.map(r => r.id===rid ? {...r, body, updatedAt:new Date().toISOString()} : r)); };
  const deleteReply = async (rid) => {
    await api.deleteReply(rid); setReplies(prev => prev.filter(r => r.id!==rid));
  };
  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast?.success("Blog link copied.");
    } catch {
      toast?.error("Could not copy link.");
    }
  };

  if (loading) return <div style={{padding:60,textAlign:"center"}}><div className="spinner"/></div>;
  if (!post) return <div style={{padding:60,textAlign:"center",color:"var(--danger)"}}>Post not found.</div>;

  return (
    <div className="animate-in" style={{ maxWidth:720, margin:"0 auto", padding:"40px 24px 80px" }}>
      {editing ? (
        <div style={{ marginBottom:24 }}>
          <input className="input" value={editTitle} onChange={e=>setEditTitle(e.target.value)}
            style={{ fontSize:24, fontFamily:"var(--font-display)", marginBottom:12 }} />
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
            <label className="btn btn-secondary btn-sm" style={{ cursor:"pointer" }}>
              Upload Header Image
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display:"none" }} onChange={e=>uploadHeaderImage(e.target.files?.[0]).catch(err=>toast?.error(err.message || "Could not upload image."))} />
            </label>
            {editHeaderImage && <button className="btn btn-ghost btn-sm" onClick={()=>setEditHeaderImage("")} style={{ color:"var(--danger)" }}>Remove Image</button>}
          </div>
          {editHeaderImage && <img src={editHeaderImage} alt="" style={{ width:"100%", maxHeight:240, objectFit:"cover", borderRadius:8, border:"1px solid var(--border-light)", marginBottom:12 }} />}
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <button className={`btn btn-sm ${!preview?"btn-primary":"btn-secondary"}`} onClick={()=>setPreview(false)}>Write</button>
            <button className={`btn btn-sm ${preview?"btn-primary":"btn-secondary"}`} onClick={()=>setPreview(true)}>Preview</button>
          </div>
          {preview ? <div style={{ minHeight:150, fontSize:17, lineHeight:1.85 }}>{editHeaderImage && <img src={editHeaderImage} alt="" style={{ width:"100%", maxHeight:280, objectFit:"cover", borderRadius:8, marginBottom:14, border:"1px solid var(--border-light)" }} />}<RichText text={editBody} /></div>
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
            <button className="btn btn-ghost btn-sm" style={{ marginLeft:12 }} onClick={copyPageLink}>Copy Link</button>
            {user?.isAdmin && (
              <>
                <button className="btn btn-ghost btn-sm" style={{marginLeft:12}} onClick={startEdit}>Edit</button>
                <button className="btn btn-ghost btn-sm" style={{color:"var(--danger)"}} onClick={del}>Delete</button>
              </>
            )}
          </div>
          <div style={{ textAlign:"center", color:"var(--border)", fontSize:14, letterSpacing:8, margin:"20px 0 28px" }}>☙ ❦ ❧</div>
          {post.headerImage && <img src={post.headerImage} alt="" style={{ width:"100%", maxHeight:340, objectFit:"cover", borderRadius:10, border:"1px solid var(--border-light)", marginBottom:24 }} />}
          <div style={{ fontSize:18, lineHeight:1.9 }}>
            <RichText text={post.body} />
          </div>
        </>
      )}

      <ThreadedComments comments={replies} onPost={postReply} onEdit={editReply} onDelete={deleteReply} label="Responses" draftKey={`blog:${id}:responses`} reportType="blog_reply" reportLabel="Report" />
    </div>
  );
}
