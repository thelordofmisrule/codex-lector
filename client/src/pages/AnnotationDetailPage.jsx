import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { annotationDetail as api } from "../lib/api";
import ThreadedComments from "../components/ThreadedComments";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";

const ANNOT_TYPES = [
  { label:"Gloss", icon:"📖", color:"var(--gold-light)" },
  { label:"Rhetoric", icon:"🎭", color:"var(--accent)" },
  { label:"Exegesis", icon:"🔍", color:"var(--success)" },
  { label:"History", icon:"🏛", color:"#7B6FAD" },
];

function fmt(iso) { try { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}); } catch { return ""; } }

export default function AnnotationDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const isAdmin = !!user?.isAdmin;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestDraftKey = `draft:annotation:${id}:suggestion`;
  const [sugNote, setSugNote] = useState(() => {
    try { return JSON.parse(localStorage.getItem(suggestDraftKey) || "{}").note || ""; } catch { return ""; }
  });
  const [sugColor, setSugColor] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(suggestDraftKey) || "{}").color;
      return raw === null || raw === undefined ? null : raw;
    } catch { return null; }
  });
  const [sugReason, setSugReason] = useState(() => {
    try { return JSON.parse(localStorage.getItem(suggestDraftKey) || "{}").reason || ""; } catch { return ""; }
  });
  const [sugMsg, setSugMsg] = useState("");

  useEffect(() => {
    localStorage.setItem(suggestDraftKey, JSON.stringify({ note:sugNote, color:sugColor, reason:sugReason }));
  }, [suggestDraftKey, sugNote, sugColor, sugReason]);

  useEffect(() => {
    api.get(id)
      .then(setData)
      .catch((e) => { if (e?.status !== 404) toast?.error("Could not load annotation details."); })
      .finally(()=>setLoading(false));
  }, [id, toast]);

  if (loading) return <div style={{padding:60,textAlign:"center"}}><div className="spinner"/></div>;
  if (!data) return <div style={{padding:60,textAlign:"center",color:"var(--danger)"}}>Annotation not found.</div>;

  const { annotation: ann, comments, suggestions } = data;
  const type = ANNOT_TYPES[ann.color] || ANNOT_TYPES[0];
  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast?.success("Annotation link copied.");
    } catch {
      toast?.error("Could not copy link.");
    }
  };

  /* ── Comment handlers ── */
  const postComment = async (body, parentId) => {
    const c = await api.postComment(id, body, parentId);
    setData(prev => ({ ...prev, comments: [...prev.comments, c] }));
  };
  const editComment = async (cid, body) => {
    await api.editComment(cid, body);
    setData(prev => ({ ...prev, comments: prev.comments.map(c => c.id===cid ? {...c, body, updatedAt:new Date().toISOString()} : c) }));
  };
  const deleteComment = async (cid) => {
    await api.deleteComment(cid);
    setData(prev => ({ ...prev, comments: prev.comments.filter(c => c.id!==cid) }));
  };

  /* ── Suggestion handlers ── */
  const submitSuggestion = async () => {
    setSugMsg("");
    if (!sugNote.trim()) return setSugMsg("Suggested text required.");
    try {
      const s = await api.suggest(id, { suggestedNote:sugNote.trim(), suggestedColor:sugColor, reason:sugReason.trim() });
      setData(prev => ({ ...prev, suggestions: [s, ...prev.suggestions] }));
      localStorage.removeItem(suggestDraftKey);
      setShowSuggest(false); setSugNote(""); setSugColor(null); setSugReason("");
    } catch(e) { setSugMsg(e.message); }
  };

  const acceptSuggestion = async (sid) => {
    const ok = await confirm({
      title: "Accept Suggestion",
      message: "Accept this suggestion? It will replace the current annotation text.",
      confirmText: "Accept",
    });
    if (!ok) return;
    try {
      await api.acceptSuggestion(sid);
      // Reload to get updated annotation
      const fresh = await api.get(id);
      setData(fresh);
      toast?.success("Suggestion accepted.");
    } catch (e) {
      toast?.error(e.message || "Could not accept suggestion.");
    }
  };

  const rejectSuggestion = async (sid) => {
    try {
      await api.rejectSuggestion(sid);
      setData(prev => ({ ...prev, suggestions: prev.suggestions.map(s => s.id===sid ? {...s, status:"rejected"} : s) }));
      toast?.success("Suggestion rejected.");
    } catch (e) {
      toast?.error(e.message || "Could not reject suggestion.");
    }
  };

  return (
    <div className="animate-in" style={{ maxWidth:720, margin:"0 auto", padding:"40px 24px 80px" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize:13, color:"var(--text-light)", marginBottom:20 }}>
        <Link to={`/read/${ann.work_slug}`} style={{ color:"var(--accent)" }}>{ann.work_title}</Link>
        <span style={{ margin:"0 8px" }}>›</span>
        <span>Annotation</span>
      </div>

      {/* Annotation card */}
      <div style={{
        padding:"20px 24px", borderLeft:"4px solid", borderLeftColor: type.color,
        background:"var(--surface)", borderRadius:"0 8px 8px 0", marginBottom:28,
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <span style={{ fontSize:12, fontFamily:"var(--font-display)", letterSpacing:2, textTransform:"uppercase", color:type.color }}>
            {type.icon} {type.label}
          </span>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {ann.authorName && (
              <Link to={`/profile/${ann.authorUsername}`} style={{ fontSize:13, color:"var(--text-light)" }}>
                by <strong style={{color:"var(--accent)"}}>{ann.authorName}</strong>
              </Link>
            )}
            <button className="btn btn-sm btn-ghost" onClick={copyPageLink} style={{ fontSize:11, color:"var(--text-light)" }}>
              Copy Link
            </button>
          </div>
        </div>

        {ann.selected_text && (
          <div style={{ fontStyle:"italic", color:"var(--text-muted)", fontSize:16, marginBottom:10, padding:"8px 12px", background:"var(--bg)", borderRadius:4, fontFamily:"var(--font-fell)" }}>
            "{ann.selected_text}"
          </div>
        )}

        <div style={{ fontSize:18, lineHeight:1.85, fontFamily:"var(--font-fell)" }}>
          {ann.note}
        </div>

        <div style={{ fontSize:12, color:"var(--text-light)", marginTop:10 }}>
          {fmt(ann.created_at)} · Line: {ann.line_id}
        </div>
      </div>

      {/* Suggest an edit */}
      {user && (
        <div style={{ marginBottom:28 }}>
          {!showSuggest ? (
            <button className="btn btn-secondary" onClick={()=>{setShowSuggest(true);setSugNote(ann.note);setSugColor(ann.color);}}>
              ✏️ Suggest an Edit
            </button>
          ) : (
            <div style={{ padding:20, background:"var(--surface)", borderRadius:8, border:"1px solid var(--border-light)" }}>
              <div style={{ fontSize:12, textTransform:"uppercase", letterSpacing:2, color:"var(--text-light)", fontFamily:"var(--font-display)", marginBottom:10 }}>
                Suggest an Edit
              </div>
              <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                {ANNOT_TYPES.map((t,i) => (
                  <button key={i} onClick={()=>setSugColor(i)} className="btn btn-sm" style={{
                    fontSize:12, border: i===sugColor ? "2px solid var(--accent)" : "2px solid transparent",
                    background: i===sugColor ? "var(--accent-faint)" : "var(--bg)",
                  }}>{t.icon} {t.label}</button>
                ))}
              </div>
              <textarea className="input" value={sugNote} onChange={e=>setSugNote(e.target.value)} placeholder="Your suggested annotation text…"
                style={{ minHeight:80, resize:"vertical", fontSize:16, fontFamily:"var(--font-fell)", marginBottom:8, lineHeight:1.7 }} />
              <textarea className="input" value={sugReason} onChange={e=>setSugReason(e.target.value)} placeholder="Reason for the change (optional)…"
                style={{ minHeight:40, resize:"vertical", fontSize:14, marginBottom:10, lineHeight:1.5 }} />
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn btn-primary" onClick={submitSuggestion}>Submit Suggestion</button>
                <button className="btn btn-secondary" onClick={()=>setShowSuggest(false)}>Cancel</button>
              </div>
              {sugMsg && <div style={{ fontSize:13, color:"var(--danger)", marginTop:6 }}>{sugMsg}</div>}
            </div>
          )}
        </div>
      )}

      {/* Pending suggestions (visible to all, actionable by admin) */}
      {suggestions.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <h3 style={{ fontFamily:"var(--font-display)", fontSize:14, textTransform:"uppercase", letterSpacing:3, color:"var(--text-muted)", marginBottom:12 }}>
            Edit Suggestions ({suggestions.filter(s=>s.status==="pending").length} pending)
          </h3>
          {suggestions.map(s => (
            <div key={s.id} style={{
              padding:"12px 16px", marginBottom:8, background:"var(--surface)", borderRadius:6,
              border:"1px solid var(--border-light)", opacity: s.status!=="pending" ? 0.6 : 1,
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <div style={{ fontSize:13 }}>
                  <strong style={{color:"var(--accent)"}}>{s.displayName}</strong>
                  <span style={{ color:"var(--text-light)", marginLeft:8 }}>{fmt(s.createdAt)}</span>
                </div>
                <span style={{
                  fontSize:11, padding:"2px 8px", borderRadius:10, fontFamily:"var(--font-display)", letterSpacing:1,
                  background: s.status==="accepted" ? "rgba(61,107,79,0.15)" : s.status==="rejected" ? "rgba(139,32,32,0.1)" : "rgba(155,119,36,0.12)",
                  color: s.status==="accepted" ? "var(--success)" : s.status==="rejected" ? "var(--danger)" : "var(--gold)",
                }}>
                  {s.status.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize:15, lineHeight:1.7, fontFamily:"var(--font-fell)", padding:"8px 10px", background:"var(--bg)", borderRadius:4, marginBottom:4 }}>
                {s.suggestedNote}
              </div>
              {s.reason && <div style={{ fontSize:13, color:"var(--text-light)", fontStyle:"italic" }}>Reason: {s.reason}</div>}
              {isAdmin && s.status==="pending" && (
                <div style={{ display:"flex", gap:6, marginTop:8 }}>
                  <button className="btn btn-primary btn-sm" onClick={()=>acceptSuggestion(s.id)}>✓ Accept</button>
                  <button className="btn btn-secondary btn-sm" onClick={()=>rejectSuggestion(s.id)}>✕ Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Discussion */}
      <ThreadedComments comments={comments} onPost={postComment} onEdit={editComment} onDelete={deleteComment} label="Discussion" draftKey={`annotation:${id}:discussion`} />
    </div>
  );
}
