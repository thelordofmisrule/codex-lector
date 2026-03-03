import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { forum as api } from "../lib/api";
import ThreadedComments from "../components/ThreadedComments";
import ReportButton from "../components/ReportButton";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";

function fmt(iso) { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}); }

export default function ForumThreadPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const nav = useNavigate();
  const [thread, setThread] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = () => {
    setLoading(true);
    setLoadError("");
    api.get(id).then(d => { setThread(d.thread); setReplies(d.replies); })
      .catch((e) => {
        if (e?.status !== 404) {
          setLoadError("Could not load thread.");
          toast?.error("Could not load thread.");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id, toast]);

  const canModify = user && thread && (user.id === thread.userId || user.isAdmin);

  const startEdit = () => { setEditTitle(thread.title); setEditBody(thread.body); setEditing(true); };
  const saveEdit = async () => {
    try {
      await api.edit(id, { title:editTitle.trim(), body:editBody.trim() });
      setThread(prev => ({...prev, title:editTitle.trim(), body:editBody.trim()}));
      setEditing(false);
      toast?.success("Thread updated.");
    } catch (e) {
      toast?.error(e.message || "Could not update thread.");
    }
  };
  const del = async () => {
    const ok = await confirm({
      title: "Delete Thread",
      message: "Delete this thread and all its replies? This cannot be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteThread(id);
      toast?.success("Thread deleted.");
      nav("/forum");
    } catch (e) {
      toast?.error(e.message || "Could not delete thread.");
    }
  };

  const postReply = async (body, parentId) => {
    const r = await api.reply(id, body, parentId);
    setReplies(prev => [...prev, r]);
  };
  const editReply = async (replyId, body) => {
    await api.editReply(replyId, body);
    setReplies(prev => prev.map(r => r.id===replyId ? {...r, body, updatedAt:new Date().toISOString()} : r));
  };
  const deleteReply = async (replyId) => {
    await api.deleteReply(replyId);
    setReplies(prev => prev.filter(r => r.id!==replyId));
  };

  if (loading) return <div style={{padding:60,textAlign:"center"}}><div className="spinner"/></div>;
  if (loadError) return (
    <div style={{padding:60,textAlign:"center"}}>
      <div style={{ color:"var(--danger)", marginBottom:10 }}>{loadError}</div>
      <button className="btn btn-secondary" onClick={load}>Retry</button>
    </div>
  );
  if (!thread) return <div style={{padding:60,textAlign:"center",color:"var(--danger)"}}>Thread not found.</div>;

  return (
    <div className="animate-in" style={{ maxWidth:720,margin:"0 auto",padding:"40px 24px 80px" }}>
      {editing ? (
        <div style={{ marginBottom:24 }}>
          <input className="input" value={editTitle} onChange={e=>setEditTitle(e.target.value)}
            style={{ fontSize:24,fontFamily:"var(--font-display)",marginBottom:12 }} />
          <textarea className="input" value={editBody} onChange={e=>setEditBody(e.target.value)}
            style={{ minHeight:120,resize:"vertical",lineHeight:1.8,marginBottom:12 }} />
          <div style={{ display:"flex",gap:8 }}>
            <button className="btn btn-primary" onClick={saveEdit}>Save</button>
            <button className="btn btn-secondary" onClick={()=>setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <h1 style={{ fontFamily:"var(--font-display)",fontSize:26,letterSpacing:1,marginBottom:8 }}>{thread.title}</h1>
          <div style={{ fontSize:14,color:"var(--text-light)",marginBottom:4 }}>
            <strong style={{ color:thread.isAdmin?"var(--gold)":"var(--accent)" }}>{thread.displayName}</strong>
            {thread.isAdmin && <span className="admin-badge">Author</span>}
            <span style={{ marginLeft:8 }}>{fmt(thread.createdAt)}</span>
            {user && user.id !== thread.userId && <span style={{ marginLeft:10, display:"inline-flex", verticalAlign:"middle" }}><ReportButton targetType="forum_thread" targetId={thread.id} /></span>}
            {canModify && (
              <>
                <button className="btn btn-ghost btn-sm" style={{marginLeft:12}} onClick={startEdit}>Edit</button>
                <button className="btn btn-ghost btn-sm" style={{color:"var(--danger)"}} onClick={del}>Delete</button>
              </>
            )}
          </div>
          {thread.tags?.length > 0 && (
            <div style={{ display:"flex",gap:4,marginBottom:16 }}>
              {thread.tags.map(t => <span key={t.id} className="tag-chip" style={{ background:t.color+"18",color:t.color }}>{t.name}</span>)}
            </div>
          )}
          <div style={{ fontSize:17,lineHeight:1.85,marginBottom:8 }}>
            {thread.body.split("\n\n").map((p,i) => <p key={i} style={{marginBottom:10,textAlign:"justify"}}>{p}</p>)}
          </div>
        </>
      )}

      <ThreadedComments comments={replies} onPost={postReply} onEdit={editReply} onDelete={deleteReply} label="Replies" draftKey={`forum:${id}:replies`} reportType="forum_reply" anchorPrefix="comment" />
    </div>
  );
}
