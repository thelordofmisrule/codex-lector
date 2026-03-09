import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { annotations as api } from "../lib/api";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";
import { preservedAnnotationTextStyle, quotedExcerpt, smartenAnnotationText } from "../lib/annotationFormat";

const ANNOT_TYPES = [
  { label:"Gloss", icon:"📖", color:"var(--gold-light)" },
  { label:"Rhetoric", icon:"🎭", color:"var(--accent)" },
  { label:"Exegesis", icon:"🔍", color:"var(--success)" },
  { label:"History", icon:"🏛", color:"#7B6FAD" },
];

function fmt(iso) { try { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); } catch { return ""; } }

export default function MyAnnotationsPage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const nav = useNavigate();
  const [annots, setAnnots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState(null);

  const load = (q) => {
    setLoading(true);
    api.myAll(q)
      .then(setAnnots)
      .catch(() => toast?.error("Could not load annotations."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [toast]);

  const doSearch = () => load(search.trim());

  const deleteAnnot = async (id) => {
    const ok = await confirm({
      title: "Delete Annotation",
      message: "Delete this annotation?",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(id);
      setAnnots(prev => prev.filter(a => a.id !== id));
      toast?.success("Annotation deleted.");
    } catch (e) {
      toast?.error(e.message || "Could not delete annotation.");
    }
  };

  if (!user) return (
    <div className="animate-in" style={{ maxWidth:600, margin:"60px auto", padding:"0 24px", textAlign:"center" }}>
      <p style={{ color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>Sign in to view your annotations.</p>
    </div>
  );

  const filtered = filterType !== null ? annots.filter(a => a.color === filterType) : annots;

  // Group by work
  const byWork = {};
  filtered.forEach(a => {
    const key = a.work_slug;
    if (!byWork[key]) byWork[key] = { title: a.work_title, slug: a.work_slug, annots: [] };
    byWork[key].annots.push(a);
  });

  return (
    <div className="animate-in" style={{ maxWidth:740, margin:"0 auto", padding:"48px 24px 80px" }}>
      <h1 style={{ fontFamily:"var(--font-display)", fontSize:28, letterSpacing:2, marginBottom:4 }}>My Annotations</h1>
      <p style={{ fontFamily:"var(--font-fell)", fontStyle:"italic", color:"var(--text-muted)", fontSize:15, marginBottom:24 }}>
        {annots.length} annotation{annots.length !== 1 ? "s" : ""} across your reading.
      </p>

      {/* Search + filter */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", flex:1, minWidth:200 }}>
          <input className="input" value={search} onChange={e=>setSearch(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&doSearch()}
            placeholder="Search annotations…" style={{ borderRadius:"6px 0 0 6px", fontSize:14 }} />
          <button className="btn btn-primary" onClick={doSearch} style={{ borderRadius:"0 6px 6px 0", fontSize:13 }}>Search</button>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          <button className={`btn btn-sm ${filterType===null?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterType(null)} style={{ fontSize:12 }}>All</button>
          {ANNOT_TYPES.map((t,i) => (
            <button key={i} className={`btn btn-sm ${filterType===i?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterType(filterType===i?null:i)} style={{ fontSize:12 }}>
              {t.icon}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:"center" }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>
          {annots.length === 0 ? "No annotations yet. Select text while reading to add one." : "No annotations match your filter."}
        </div>
      ) : (
        Object.values(byWork).map(group => (
          <div key={group.slug} style={{ marginBottom:28 }}>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:16, letterSpacing:1.5, color:"var(--accent)", marginBottom:10, paddingBottom:6, borderBottom:"1px solid var(--border-light)" }}>
              <Link to={`/read/${group.slug}`} style={{ color:"var(--accent)", textDecoration:"none" }}
                onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
                {group.title}
              </Link>
              <span style={{ fontSize:12, color:"var(--text-light)", marginLeft:8, fontWeight:400 }}>({group.annots.length})</span>
            </h2>
            {group.annots.map(a => {
              const type = ANNOT_TYPES[a.color] || ANNOT_TYPES[0];
              return (
                <div key={a.id} style={{
                  padding:"10px 14px", marginBottom:6, borderRadius:6,
                  borderLeft:`3px solid ${type.color}`,
                  background:"var(--surface)", border:"1px solid var(--border-light)",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, textTransform:"uppercase", color:type.color }}>
                      {type.icon} {type.label}
                      {a.is_global ? <span style={{ marginLeft:4, opacity:0.5, fontSize:10 }}>· global</span> : <span style={{ marginLeft:4, opacity:0.5, fontSize:10 }}>· private</span>}
                    </span>
                    <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                      <span style={{ fontSize:11, color:"var(--text-light)" }}>{fmt(a.created_at)}</span>
                      <Link to={`/annotation/${a.id}`} className="btn btn-ghost" style={{ fontSize:11, padding:"2px 6px" }}>View</Link>
                      <button className="btn btn-ghost" style={{ fontSize:11, padding:"2px 6px", color:"var(--danger)" }} onClick={()=>deleteAnnot(a.id)}>Delete</button>
                    </div>
                  </div>
                  {a.selected_text && <div style={{ fontStyle:"italic", color:"var(--text-muted)", fontSize:13, marginBottom:3, ...preservedAnnotationTextStyle }}>{quotedExcerpt(a.selected_text, 80)}</div>}
                  <div style={{ fontSize:14, color:"var(--text)", fontFamily:"var(--font-fell)", lineHeight:1.6, ...preservedAnnotationTextStyle }}>{smartenAnnotationText(a.note)}</div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
