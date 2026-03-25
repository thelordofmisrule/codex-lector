import { Link } from "react-router-dom";

export default function HowToPage() {
  const sections = [
    {
      title: "Read Actively",
      body: "Open any work and read with line numbers, bookmarks, saved progress, daily Year of Shakespeare waypoints, and a unified reader overlay for lookup, places, notes, and prosody.",
    },
    {
      title: "Look Up and Save",
      body: "Click or tap a single word for glossary lookup, select a place name for Place Awareness, then save useful words, passages, places, and notes into the Research Tray while you work through a scene.",
    },
    {
      title: "Annotate Lightly or Deeply",
      body: "Select a passage to add a note. Note is the default; Language, Rhetoric, and Context stay available when you need them. Site-wide notes, your private notes, and subscribed layers can be mixed from one control.",
    },
    {
      title: "Search and Compare",
      body: "Search within one work or across the corpus, jump to exact passages, export quote cards, open sources, and move between modern editions, maps, genealogy, people, and gallery material without losing your place.",
    },
    {
      title: "Read with Others",
      body: "Each work supports discussion, annotations have their own discussion pages, live chat rooms support quick exchange, and the forum and blog give you slower public spaces for longer conversations.",
    },
  ];

  const readerTools = [
    ["Layers & Overlays", "Toggle site-wide notes, your notes, note types, subscribed layers, waypoints, and poem prosody without changing pages."],
    ["Research Tray", "Keep a working set of pinned words, places, notes, and passages while you read."],
    ["Quote Capture", "Turn a passage into a shareable quote card, with citation and optional artwork."],
    ["Place Awareness", "Surface place notes and citations directly from the text when a selection matches a place entry."],
  ];

  const exploreTools = [
    ["People Map", "See dramatic relationships for a play."],
    ["Genealogy", "Trace the historical families behind the English history plays."],
    ["Places", "Move from the text into geography and historical setting."],
    ["Gallery", "Browse artwork tied to works and reuse it in quote cards."],
    ["Year of Shakespeare", "Follow the shared reading calendar and stop markers."],
  ];

  return (
    <div className="animate-in" style={{ maxWidth:960, margin:"0 auto", padding:"48px 24px 80px" }}>
      <div style={{ textAlign:"center", marginBottom:34 }}>
        <div style={{ fontSize:13, fontFamily:"var(--font-display)", color:"var(--gold)", letterSpacing:4, textTransform:"uppercase", marginBottom:8 }}>
          How Codex Lector Works
        </div>
        <h1 style={{ fontFamily:"var(--font-display)", fontSize:40, fontWeight:400, color:"var(--accent)", letterSpacing:2, marginBottom:12 }}>
          Read Shakespeare Actively
        </h1>
        <p style={{ fontFamily:"var(--font-fell)", fontSize:18, fontStyle:"italic", color:"var(--text-muted)", lineHeight:1.7, maxWidth:620, margin:"0 auto" }}>
          Codex Lector is a line-by-line Shakespeare reader built for annotation, lookup, comparison, quotation, and shared reading.
        </p>
      </div>

      <div style={{ display:"grid", gap:12, marginBottom:28 }}>
        {sections.map((section, index) => (
          <div key={section.title} style={{ padding:18, background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:10 }}>
            <div style={{ fontSize:12, fontFamily:"var(--font-display)", letterSpacing:2, color:"var(--text-light)", textTransform:"uppercase", marginBottom:8 }}>
              {index + 1}. {section.title}
            </div>
            <div style={{ fontSize:16, lineHeight:1.8, fontFamily:"var(--font-fell)" }}>
              {section.body}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:14, marginBottom:24 }}>
        <div style={{ padding:20, background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:10 }}>
          <div style={{ fontSize:12, fontFamily:"var(--font-display)", letterSpacing:2, color:"var(--text-light)", textTransform:"uppercase", marginBottom:10 }}>
            Reader Tools
          </div>
          <div style={{ display:"grid", gap:10 }}>
            {readerTools.map(([title, body]) => (
              <div key={title}>
                <div style={{ fontSize:15, color:"var(--text)" }}>{title}</div>
                <div style={{ fontSize:14, color:"var(--text-muted)", lineHeight:1.7, fontFamily:"var(--font-fell)" }}>{body}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:20, background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:10 }}>
          <div style={{ fontSize:12, fontFamily:"var(--font-display)", letterSpacing:2, color:"var(--text-light)", textTransform:"uppercase", marginBottom:10 }}>
            Explore
          </div>
          <div style={{ display:"grid", gap:10 }}>
            {exploreTools.map(([title, body]) => (
              <div key={title}>
                <div style={{ fontSize:15, color:"var(--text)" }}>{title}</div>
                <div style={{ fontSize:14, color:"var(--text-muted)", lineHeight:1.7, fontFamily:"var(--font-fell)" }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
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
        <Link to="/year-of-shakespeare" className="btn btn-secondary" style={{ marginRight:8 }}>Year of Shakespeare</Link>
        <Link to="/gallery" className="btn btn-secondary">Open Gallery</Link>
      </div>
    </div>
  );
}
