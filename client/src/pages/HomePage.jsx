import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { works as api } from "../lib/api";

const CATS = [
  { key:"tragedy", label:"Tragedies", icon:"🗡" },
  { key:"comedy", label:"Comedies", icon:"🎭" },
  { key:"history", label:"Histories", icon:"👑" },
  { key:"poetry", label:"Poetry & Sonnets", icon:"🌹" },
  { key:"first_folio", label:"First Folio Editions", icon:"📜" },
  { key:"apocrypha", label:"Apocrypha", icon:"❓" },
];

export default function HomePage() {
  const nav = useNavigate();
  const [works, setWorks] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.list().then(setWorks).finally(()=>setLoading(false)); }, []);

  const filtered = search.trim() ? works.filter(w=>w.title.toLowerCase().includes(search.toLowerCase())) : works;
  const grouped = {};
  filtered.forEach(w => { (grouped[w.category]??=[]).push(w); });
  const variantLabel = (variant) => {
    if (variant === "first-folio") return "First Folio";
    if (variant === "ps") return "Modern";
    if (variant === "ps-apocrypha") return "Apocrypha";
    if (variant === "ps-poems") return "Poems";
    return variant || "";
  };

  return (
    <div className="animate-in" style={{ maxWidth:920, margin:"0 auto", padding:"48px 24px" }}>
      {/* Hero */}
      <div style={{ textAlign:"center", marginBottom:48 }}>
        <div className="eva-readout-meta" style={{ fontSize:13, fontFamily:"var(--font-display)", color:"var(--gold)", letterSpacing:4, textTransform:"uppercase", marginBottom:8 }}>The Works of</div>
        <div className="eva-readout-frame" style={{ marginBottom:12, maxWidth:"100%" }}>
          <h1 className="eva-readout" data-readout="William Shakespeare" style={{ fontFamily:"'Cinzel Decorative',var(--font-display)", fontSize:44, fontWeight:400, color:"var(--accent)", letterSpacing:3, marginBottom:0 }}>
            William Shakespeare
            <span className="eva-readout-cursor" aria-hidden="true" />
          </h1>
        </div>
        <p style={{ fontFamily:"var(--font-fell)", fontSize:17, fontStyle:"italic", color:"var(--text-muted)", maxWidth:480, margin:"0 auto", lineHeight:1.7 }}>
          Annotated and presented for the studious reader.<br/>
          <span style={{ fontSize:14, color:"var(--text-light)" }}>Texts from PlayShakespeare.com · GFDL Licensed</span>
        </p>
        <div style={{ display:"flex", justifyContent:"center", gap:10, marginTop:18, flexWrap:"wrap" }}>
          <button className="btn btn-primary" onClick={() => nav("/how-to")}>How It Works</button>
          <button className="btn btn-secondary" onClick={() => nav("/places")}>Explore Places</button>
          <button className="btn btn-secondary" onClick={() => nav("/year-of-shakespeare")}>Year Calendar</button>
          <button className="btn btn-secondary" onClick={() => nav("/layers")}>Featured Layers</button>
        </div>
        <div style={{ margin:"24px auto 0", display:"flex", justifyContent:"center", gap:8, color:"var(--border)" }}>
          <span>☙</span><span style={{color:"var(--gold)"}}>❦</span><span>❧</span>
        </div>
      </div>

      {/* Search row */}
      <div style={{ display:"flex", gap:12, maxWidth:520, margin:"0 auto 40px", alignItems:"center" }}>
        <input className="input" placeholder="Search the titles…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ flex:1, textAlign:"center", fontFamily:"var(--font-fell)", fontStyle:"italic" }} />
        <button className="btn btn-secondary" onClick={()=>nav("/search")} title="Search within texts"
          style={{ whiteSpace:"nowrap", fontFamily:"var(--font-display)", fontSize:12, letterSpacing:1 }}>
          🔍 Text Search
        </button>
      </div>

      {loading && <div style={{textAlign:"center"}}><div className="spinner"/></div>}

      {CATS.map(({ key, label, icon }) => {
        const list = grouped[key];
        if (!list?.length) return null;
        return (
          <div key={key} style={{ marginBottom:40 }}>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:14, textTransform:"uppercase", letterSpacing:4, color:"var(--accent)", borderBottom:"1px solid var(--border-light)", paddingBottom:8, marginBottom:14 }}>
              <span style={{ marginRight:8 }}>{icon}</span>{label}
              <span style={{ float:"right", fontSize:12, color:"var(--text-light)", fontWeight:400, letterSpacing:1 }}>{list.length}</span>
            </h2>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))", gap:4 }}>
              {list.sort((a,b) => a.title.localeCompare(b.title)).map(w => (
                <button key={w.slug} onClick={()=>nav(`/read/${w.slug}`)} className="btn" style={{
                  background:"transparent", border:"1px solid transparent", padding:"9px 14px",
                  textAlign:"left", fontSize:16, fontFamily:"var(--font-body)",
                  color:w.has_content?"var(--text)":"var(--text-light)", borderRadius:6,
                }}
                  onMouseEnter={e=>{e.currentTarget.style.background="var(--surface)";e.currentTarget.style.borderColor="var(--border-light)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}
                >
                  {w.title}
                  <span style={{ display:"inline-block", marginLeft:8, fontSize:10, letterSpacing:1, textTransform:"uppercase", color:"var(--text-light)", border:"1px solid var(--border-light)", borderRadius:999, padding:"1px 6px", verticalAlign:"middle" }}>
                    {variantLabel(w.variant)}
                  </span>
                  {w.authors && !w.authors.includes("William Shakespeare") && (
                    <span style={{ display:"block", fontSize:12, color:"var(--text-light)", fontStyle:"italic" }}>{w.authors}</span>
                  )}
                  {!w.has_content && <span style={{fontSize:11,marginLeft:6,opacity:0.5}}>○</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {!loading && works.length === 0 && (
        <div style={{ textAlign:"center", padding:48, color:"var(--text-light)" }}>
          <div style={{ fontSize:48, opacity:0.3, marginBottom:12 }}>📚</div>
          <p style={{ fontFamily:"var(--font-fell)", fontStyle:"italic", fontSize:18 }}>No works imported yet.</p>
          <p style={{ fontSize:14, marginTop:8 }}>
            Place PlayShakespeare XML files in <code style={{background:"var(--code-bg)",padding:"2px 6px",borderRadius:4}}>data/playShakespeare/</code> and run{" "}
            <code style={{background:"var(--code-bg)",padding:"2px 6px",borderRadius:4}}>npm run import</code>.
          </p>
        </div>
      )}
    </div>
  );
}
