import { Link } from "react-router-dom";

export default function HowToPage() {
  const items = [
    ["Read", "Open any work and read with line numbers, bookmarks, and saved progress."],
    ["Annotate", "Select a phrase to add a note. Click a single word for lookup, then switch into annotation if needed."],
    ["Layer", "Follow public layers or build your own private or public annotation set."],
    ["Discuss", "Every work and annotation supports threaded discussion. Forum and blog extend that outward."],
    ["Return", "Your library keeps your place so you can resume where you stopped."],
  ];

  return (
    <div className="animate-in" style={{ maxWidth:860, margin:"0 auto", padding:"48px 24px 80px" }}>
      <div style={{ textAlign:"center", marginBottom:30 }}>
        <div style={{ fontSize:13, fontFamily:"var(--font-display)", color:"var(--gold)", letterSpacing:4, textTransform:"uppercase", marginBottom:8 }}>
          How Codex Lector Works
        </div>
        <h1 style={{ fontFamily:"'Cinzel Decorative',var(--font-display)", fontSize:40, fontWeight:400, color:"var(--accent)", letterSpacing:2, marginBottom:12 }}>
          Read Shakespeare Actively
        </h1>
        <p style={{ fontFamily:"var(--font-fell)", fontSize:18, fontStyle:"italic", color:"var(--text-muted)", lineHeight:1.7, maxWidth:620, margin:"0 auto" }}>
          Codex Lector is a line-by-line Shakespeare reader built for annotation, comparison, and discussion.
        </p>
      </div>

      <div style={{ display:"grid", gap:12, marginBottom:26 }}>
        {items.map(([title, body], index) => (
          <div key={title} style={{ padding:18, background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:10 }}>
            <div style={{ fontSize:12, fontFamily:"var(--font-display)", letterSpacing:2, color:"var(--text-light)", textTransform:"uppercase", marginBottom:8 }}>
              {index + 1}. {title}
            </div>
            <div style={{ fontSize:16, lineHeight:1.8, fontFamily:"var(--font-fell)" }}>
              {body}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding:20, background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:10, marginBottom:22 }}>
        <div style={{ fontSize:12, fontFamily:"var(--font-display)", letterSpacing:2, color:"var(--text-light)", textTransform:"uppercase", marginBottom:10 }}>
          Reader Shortcuts
        </div>
        <div style={{ display:"grid", gap:6, fontSize:15, lineHeight:1.7 }}>
          <div><strong>/</strong> opens search</div>
          <div><strong>b</strong> bookmarks your current place</div>
          <div><strong>Esc</strong> closes lookup and annotation popups</div>
        </div>
      </div>

      <div style={{ textAlign:"center" }}>
        <Link to="/" className="btn btn-primary" style={{ marginRight:8 }}>Browse Works</Link>
        <Link to="/layers" className="btn btn-secondary">Explore Layers</Link>
      </div>
    </div>
  );
}
