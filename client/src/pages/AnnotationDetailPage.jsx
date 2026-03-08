import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { annotationDetail as api, works as worksApi, annotations as annotsApi } from "../lib/api";
import ThreadedComments from "../components/ThreadedComments";
import ReportButton from "../components/ReportButton";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";
import { parsePlayShakespeareXML } from "../lib/textParser";

const ANNOT_TYPES = [
  { label:"Gloss", icon:"📖", color:"var(--gold-light)" },
  { label:"Rhetoric", icon:"🎭", color:"var(--accent)" },
  { label:"Exegesis", icon:"🔍", color:"var(--success)" },
  { label:"History", icon:"🏛", color:"#7B6FAD" },
];

function fmt(iso) { try { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}); } catch { return ""; } }

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenWorkLines(parsed) {
  const lines = [];
  if (!parsed) return lines;
  if (parsed.type === "play") {
    parsed.lines.forEach((item, idx) => {
      if (item.type !== "speech") return;
      (item.lines || []).forEach((line, li) => {
        if (line.type === "stagedir") return;
        lines.push({ lineId:`l-${idx}-${li}`, text:line.text || "", speaker:item.speaker || "" });
      });
    });
    return lines;
  }
  if (parsed.type === "poetry") {
    (parsed.sections || []).forEach((sec, si) => {
      (sec.lines || []).forEach((line, li) => {
        if (line.type === "stagedir") return;
        lines.push({ lineId:`p-${si}-${li}`, text:line.text || "", speaker:"" });
      });
    });
  }
  return lines;
}

function inferParallelSlug(sourceSlug, sourceTitle, allWorks) {
  if (!sourceSlug || !allWorks.length) return "";
  const has = new Set(allWorks.map(w => w.slug));
  if (sourceSlug.startsWith("f1-")) {
    const modern = sourceSlug.slice(3);
    if (has.has(modern)) return modern;
  } else {
    const folio = `f1-${sourceSlug}`;
    if (has.has(folio)) return folio;
  }
  const src = allWorks.find(w => w.slug === sourceSlug);
  if (!src) return "";
  const targetVariant = src.variant === "first-folio" ? "ps" : "first-folio";
  const byTitle = allWorks.find(w => w.variant === targetVariant && normalizeText(w.title) === normalizeText(sourceTitle || src.title));
  return byTitle?.slug || "";
}

function buildCandidates(queryText, flattenedLines, limit = 8) {
  const qNorm = normalizeText(queryText);
  if (!qNorm || qNorm.length < 2) return [];
  const qTokens = qNorm.split(" ").filter(Boolean);
  const candidates = [];

  flattenedLines.forEach((line, idx) => {
    const n = normalizeText(line.text);
    if (!n) return;
    let score = 0;
    if (n.includes(qNorm)) score += 8;
    const tokens = new Set(n.split(" ").filter(Boolean));
    const overlap = qTokens.filter(t => tokens.has(t)).length;
    if (overlap) score += (overlap / qTokens.length) * 5;
    if (!score) return;
    candidates.push({
      ...line,
      index: idx,
      lineNumber: idx + 1,
      score,
      contextBefore: flattenedLines[idx - 1]?.text || "",
      contextAfter: flattenedLines[idx + 1]?.text || "",
    });
  });

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

export default function AnnotationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const isAdmin = !!user?.isAdmin;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSuggest, setShowSuggest] = useState(false);
  const [showParallel, setShowParallel] = useState(false);
  const [allWorks, setAllWorks] = useState([]);
  const [parallelTargetSlug, setParallelTargetSlug] = useState("");
  const [parallelCandidates, setParallelCandidates] = useState([]);
  const [parallelChosen, setParallelChosen] = useState(0);
  const [parallelHighlight, setParallelHighlight] = useState("");
  const [parallelBusy, setParallelBusy] = useState(false);
  const [parallelMsg, setParallelMsg] = useState("");
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

  useEffect(() => {
    worksApi.list().then(setAllWorks).catch(()=>{});
  }, []);

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

  const runParallelMatch = async (targetSlug, sourceHighlight) => {
    if (!targetSlug) return;
    setParallelBusy(true);
    setParallelMsg("");
    try {
      const targetWork = await worksApi.get(targetSlug);
      const parsed = parsePlayShakespeareXML(targetWork.content || "", targetWork.title, targetWork.category);
      const flat = flattenWorkLines(parsed);
      const cands = buildCandidates(sourceHighlight, flat, 8);
      setParallelCandidates(cands);
      setParallelChosen(0);
      if (cands[0]) setParallelHighlight(cands[0].text);
      if (!cands.length) setParallelMsg("No close textual match found. Try a shorter or less punctuated phrase.");
    } catch (e) {
      setParallelMsg(e.message || "Could not search target edition.");
    } finally {
      setParallelBusy(false);
    }
  };

  const openParallelModal = async () => {
    const inferred = inferParallelSlug(ann.work_slug, ann.work_title, allWorks);
    const fallback = allWorks.find(w => w.slug !== ann.work_slug)?.slug || "";
    const nextTarget = inferred || fallback;
    setParallelTargetSlug(nextTarget);
    setParallelHighlight(ann.selected_text || "");
    setParallelCandidates([]);
    setParallelChosen(0);
    setParallelMsg("");
    setShowParallel(true);
    if (nextTarget) await runParallelMatch(nextTarget, ann.selected_text || ann.note || "");
  };

  const copyToParallel = async () => {
    const targetWork = allWorks.find(w => w.slug === parallelTargetSlug);
    const chosen = parallelCandidates[parallelChosen];
    if (!targetWork || !chosen) return;
    setParallelBusy(true);
    try {
      const created = await annotsApi.create({
        workId: targetWork.id,
        lineId: chosen.lineId,
        note: ann.note,
        color: ann.color,
        selectedText: (parallelHighlight || chosen.text || "").trim(),
        isGlobal: !!ann.is_global,
      });
      setShowParallel(false);
      toast?.success(`Copied to ${targetWork.title}.`);
      if (created?.id) window.open(`/annotation/${created.id}`, "_blank");
    } catch (e) {
      setParallelMsg(e.message || "Could not copy annotation.");
    } finally {
      setParallelBusy(false);
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
            {user && user.id !== ann.user_id && <ReportButton targetType="annotation" targetId={ann.id} />}
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
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
            <button className="btn btn-secondary" onClick={openParallelModal}>
              ⇄ Copy to Another Edition
            </button>
          </div>
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

      {showParallel && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ width:"min(920px, 96vw)", maxHeight:"90vh", overflowY:"auto", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <h3 style={{ margin:0, fontFamily:"var(--font-display)", color:"var(--accent)" }}>Copy Annotation to Another Edition</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowParallel(false)}>Close</button>
            </div>
            <div style={{ display:"grid", gap:10, marginBottom:12 }}>
              <div style={{ fontSize:13, color:"var(--text-light)" }}>
                Source: <strong>{ann.work_title}</strong> · "{ann.selected_text || ann.note.slice(0,80)}"
              </div>
              <select className="input" value={parallelTargetSlug} onChange={async e => {
                const v = e.target.value;
                setParallelTargetSlug(v);
                await runParallelMatch(v, ann.selected_text || ann.note || "");
              }}>
                <option value="">Select target edition…</option>
                {allWorks.filter(w => w.slug !== ann.work_slug).sort((a,b)=>a.title.localeCompare(b.title)).map(w => (
                  <option key={w.slug} value={w.slug}>{w.title} ({w.variant})</option>
                ))}
              </select>
              {parallelBusy && <div style={{ color:"var(--text-light)", fontSize:13 }}>Searching target edition…</div>}
              {parallelMsg && <div style={{ color:"var(--danger)", fontSize:13 }}>{parallelMsg}</div>}
            </div>

            {parallelCandidates.length > 0 && (
              <>
                <div style={{ display:"grid", gap:8, marginBottom:12 }}>
                  {parallelCandidates.map((c, i) => (
                    <button
                      key={`${c.lineId}-${i}`}
                      className="btn"
                      onClick={()=>{ setParallelChosen(i); setParallelHighlight(c.text); }}
                      style={{
                        textAlign:"left",
                        border:"1px solid var(--border-light)",
                        borderRadius:8,
                        padding:10,
                        background: i===parallelChosen ? "var(--accent-faint)" : "var(--bg)",
                      }}
                    >
                      <div style={{ fontSize:12, color:"var(--text-light)", marginBottom:4 }}>
                        Line {c.lineNumber} · score {c.score.toFixed(2)} {c.speaker ? `· ${c.speaker}` : ""}
                      </div>
                      {c.contextBefore && <div style={{ fontSize:13, color:"var(--text-light)" }}>… {c.contextBefore}</div>}
                      <div style={{ fontSize:15, fontFamily:"var(--font-fell)", lineHeight:1.6 }}>{c.text}</div>
                      {c.contextAfter && <div style={{ fontSize:13, color:"var(--text-light)" }}>{c.contextAfter} …</div>}
                    </button>
                  ))}
                </div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:12, color:"var(--text-light)", marginBottom:4 }}>Adjust highlighted text before copying:</div>
                  <textarea className="input" value={parallelHighlight} onChange={e=>setParallelHighlight(e.target.value)} style={{ minHeight:56, resize:"vertical", fontFamily:"var(--font-fell)" }} />
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn btn-primary" onClick={copyToParallel} disabled={parallelBusy || !parallelTargetSlug || !parallelCandidates[parallelChosen]}>
                    Copy Annotation
                  </button>
                  <button className="btn btn-secondary" onClick={async ()=>runParallelMatch(parallelTargetSlug, parallelHighlight || ann.selected_text || ann.note || "")} disabled={parallelBusy || !parallelTargetSlug}>
                    Re-run Match
                  </button>
                </div>
              </>
            )}
          </div>
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
