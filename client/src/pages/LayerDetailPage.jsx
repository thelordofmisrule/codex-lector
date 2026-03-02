import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { layers as api } from "../lib/api";

const ANNOT_TYPES = [
  { label:"Gloss", icon:"📖", color:"var(--gold-light)" },
  { label:"Rhetoric", icon:"🎭", color:"var(--accent)" },
  { label:"Exegesis", icon:"🔍", color:"var(--success)" },
  { label:"History", icon:"🏛", color:"#7B6FAD" },
];

export default function LayerDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get(id).then(setData).catch(()=>{}).finally(()=>setLoading(false)); }, [id]);

  if (loading) return <div style={{padding:60,textAlign:"center"}}><div className="spinner"/></div>;
  if (!data) return <div style={{padding:60,textAlign:"center",color:"var(--danger)"}}>Layer not found.</div>;

  const { layer, annotations } = data;

  // Group by work
  const byWork = {};
  annotations.forEach(a => {
    if (!byWork[a.work_slug]) byWork[a.work_slug] = { title:a.work_title, slug:a.work_slug, annots:[] };
    byWork[a.work_slug].annots.push(a);
  });

  return (
    <div className="animate-in" style={{ maxWidth:740, margin:"0 auto", padding:"48px 24px 80px" }}>
      <div style={{ marginBottom:6 }}>
        <Link to="/layers" style={{ fontSize:12, color:"var(--text-light)", fontFamily:"var(--font-display)", letterSpacing:1 }}>← LAYERS</Link>
      </div>
      <h1 style={{ fontFamily:"var(--font-display)", fontSize:28, letterSpacing:2, marginBottom:4, color:"var(--accent)" }}>{layer.name}</h1>
      {layer.description && <p style={{ fontFamily:"var(--font-fell)", fontStyle:"italic", color:"var(--text-muted)", fontSize:15, marginBottom:4 }}>{layer.description}</p>}
      <div style={{ fontSize:13, color:"var(--text-light)", marginBottom:28 }}>
        by <Link to={`/profile/${layer.username}`} style={{color:"var(--text-light)"}}>{layer.displayName}</Link> · {annotations.length} annotations
      </div>

      {annotations.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>
          No annotations in this layer yet.
        </div>
      ) : (
        Object.values(byWork).map(group => (
          <div key={group.slug} style={{ marginBottom:28 }}>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:16, letterSpacing:1.5, color:"var(--accent)", marginBottom:10, paddingBottom:6, borderBottom:"1px solid var(--border-light)" }}>
              <Link to={`/read/${group.slug}`} style={{ color:"var(--accent)", textDecoration:"none" }}>{group.title}</Link>
              <span style={{ fontSize:12, color:"var(--text-light)", marginLeft:8, fontWeight:400 }}>({group.annots.length})</span>
            </h2>
            {group.annots.map(a => {
              const type = ANNOT_TYPES[a.color] || ANNOT_TYPES[0];
              return (
                <div key={a.id} style={{
                  padding:"10px 14px", marginBottom:6, borderRadius:6,
                  borderLeft:`3px solid ${type.color}`, background:"var(--surface)", border:"1px solid var(--border-light)",
                }}>
                  <span style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, textTransform:"uppercase", color:type.color }}>
                    {type.icon} {type.label}
                  </span>
                  {a.selected_text && <div style={{ fontStyle:"italic", color:"var(--text-muted)", fontSize:13, marginTop:2 }}>"{a.selected_text.slice(0,80)}{a.selected_text.length>80?"…":""}"</div>}
                  <div style={{ fontSize:14, color:"var(--text)", fontFamily:"var(--font-fell)", lineHeight:1.6, marginTop:2 }}>{a.note}</div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
