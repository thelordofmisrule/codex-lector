import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { works as worksApi, annotations as annotsApi, discussions as discApi, bookmarks as bmApi, progress as progApi, layers as layersApi } from "../lib/api";
import { parsePlayShakespeareXML } from "../lib/textParser";
import ThreadedComments from "../components/ThreadedComments";
import WordLookup from "../components/WordLookup";

const ANNOT_TYPES = [
  { label:"Gloss", desc:"Define a word or phrase", cls:"hl-0", icon:"📖" },
  { label:"Rhetoric", desc:"Rhetorical or poetic device", cls:"hl-1", icon:"🎭" },
  { label:"Exegesis", desc:"Interpretation or analysis", cls:"hl-2", icon:"🔍" },
  { label:"History", desc:"Historical context", cls:"hl-3", icon:"🏛" },
];

/* ─── Margin annotation ─── */
function MarginAnnot({ annot, userId, isAdmin, onEdit, onDelete, compact }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(annot.note);
  const [color, setColor] = useState(annot.color);
  const type = ANNOT_TYPES[annot.color] || ANNOT_TYPES[0];
  const isLong = (annot.note || "").length > 60;
  const borderColors = ["var(--gold-light)","var(--accent)","var(--success)","#7B6FAD"];
  const canModify = isAdmin || annot.user_id === userId;
  const isGlobal = !!annot.is_global;

  if (editing) return (
    <div style={{ padding:10, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:6, marginBottom:4 }}>
      <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap" }}>
        {ANNOT_TYPES.map((t,i) => (
          <button key={i} onClick={()=>setColor(i)} style={{
            fontSize:11, padding:"3px 8px", borderRadius:4, border: i===color ? "1px solid var(--accent)" : "1px solid transparent",
            background: i===color ? "var(--accent-faint)" : "transparent", cursor:"pointer", fontFamily:"var(--font-body)", color:"var(--text-muted)",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>
      <textarea className="input" value={note} onChange={e=>setNote(e.target.value)} style={{ minHeight:60, resize:"vertical", fontSize:14 }} />
      <div style={{ display:"flex", gap:4, marginTop:6 }}>
        <button className="btn btn-primary btn-sm" onClick={()=>{onEdit(annot.id,note,color);setEditing(false);}}>Save</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>{setEditing(false);setNote(annot.note);setColor(annot.color);}}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div style={{
      fontSize: compact ? 13 : 14, lineHeight:1.6, padding: compact ? "4px 8px" : "6px 10px",
      borderLeft:`3px solid ${borderColors[annot.color]||"var(--gold)"}`,
      color:"var(--text)", fontFamily:"var(--font-fell)",
      background:"var(--surface)", borderRadius:"0 6px 6px 0",
      cursor: isLong && !expanded ? "pointer" : "default",
    }} onClick={() => { if (isLong && !expanded) setExpanded(true); }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
        <span style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, textTransform:"uppercase", color: borderColors[annot.color] || "var(--gold)" }}>
          {type.icon} {type.label}
          {!isGlobal && <span style={{ marginLeft:4, opacity:0.6, fontSize:10 }}>· private</span>}
          {annot.author_name && isGlobal && <span style={{ marginLeft:4, opacity:0.5, fontSize:10, textTransform:"none", letterSpacing:0 }}>· {annot.author_name}</span>}
        </span>
        {canModify && (
          <span style={{ display:"flex", gap:2 }}>
            <button className="btn btn-ghost" style={{fontSize:11,padding:"0 4px"}} onClick={(e)=>{e.stopPropagation();setEditing(true);}}>✎</button>
            <button className="btn btn-ghost" style={{fontSize:11,padding:"0 4px",color:"var(--danger)"}} onClick={(e)=>{e.stopPropagation();onDelete(annot.id);}}>✕</button>
          </span>
        )}
      </div>
      {annot.selected_text && <div style={{ fontStyle:"italic", color:"var(--text-muted)", fontSize: compact ? 12 : 13, marginBottom:2 }}>"{annot.selected_text.slice(0,50)}{annot.selected_text.length>50?"…":""}"</div>}
      <div style={{ color:"var(--text)" }}>
        {isLong && !expanded
          ? <>{annot.note.slice(0,60)}… <span style={{ color:"var(--accent)", fontSize:12, fontFamily:"var(--font-display)" }}>[more]</span></>
          : annot.note
        }
      </div>
      {expanded && isLong && (
        <button className="btn btn-ghost" onClick={()=>setExpanded(false)} style={{ fontSize:11, color:"var(--accent)", padding:"2px 0", marginTop:2 }}>
          [collapse]
        </button>
      )}
      <div style={{ marginTop:4, borderTop:"1px solid var(--border-light)", paddingTop:4 }}>
        <Link to={`/annotation/${annot.id}`} style={{ fontSize:11, color:"var(--text-light)", fontFamily:"var(--font-display)", letterSpacing:1, textDecoration:"none" }}
          onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-light)"}>
          DISCUSS →
        </Link>
      </div>
    </div>
  );
}

/* ─── Annotation tooltip ─── */
function AnnotTooltip({ pos, onSave, onCancel, myLayers }) {
  const [note, setNote] = useState("");
  const [color, setColor] = useState(0);
  const [layerId, setLayerId] = useState("");
  return (
      <div style={{
        position:"fixed", top:pos.y+8, left:Math.max(12,Math.min(pos.x,window.innerWidth-340)),
        background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:12,
        boxShadow:"0 8px 24px var(--shadow)", width:320, zIndex:200,
    }}>
      <div style={{ fontSize:12, color:"var(--text-light)", marginBottom:6, fontStyle:"italic" }}>"{pos.text.slice(0,60)}{pos.text.length>60?"…":""}"</div>
      <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap" }}>
        {ANNOT_TYPES.map((t,i) => (
          <button key={i} onClick={()=>setColor(i)} className="btn btn-sm" style={{
            fontSize:11, border: i===color ? "2px solid var(--accent)" : "2px solid transparent",
            background: i===color ? "var(--accent-faint)" : "var(--bg)",
            color: i===color ? "var(--text)" : "var(--text-muted)",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>
      <textarea className="input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Your annotation…"
        autoFocus style={{ minHeight:60, resize:"vertical", fontSize:14, lineHeight:1.6 }} />
      {myLayers && myLayers.length > 0 && (
        <div style={{ marginTop:6 }}>
          <select className="input" value={layerId} onChange={e=>setLayerId(e.target.value)} style={{ fontSize:13, padding:"4px 8px" }}>
            <option value="">No layer (private)</option>
            {myLayers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
      <div style={{ display:"flex", gap:6, marginTop:8 }}>
        <button className="btn btn-primary btn-sm" onClick={()=>note.trim()&&onSave(note.trim(),color,layerId||null)}>Save</button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Annotated line with margin notes ─── */
function AnnotatedLine({ lineId, text, annots, annotsByLine, showAnnots, userId, isAdmin, editAnnot, deleteAnnot, lineNum, showNum, isBookmarked, onBookmark }) {
  const lineAnnots = showAnnots ? (annotsByLine[lineId] || []) : [];
  return (
    <div data-lineid={lineId} id={lineId} style={{ display:"flex", gap:12, alignItems:"flex-start", position:"relative" }}>
      <div style={{ width:40, textAlign:"right", flexShrink:0, fontSize:"0.75em", color:"var(--text-light)", fontFamily:"var(--font-mono)", userSelect:"none", paddingTop:2, position:"relative" }}>
        {showNum && lineNum}
        {isBookmarked && <span style={{ position:"absolute", right:-4, top:0, fontSize:14 }} title="Bookmark">🔖</span>}
      </div>
      <div style={{ flex:1 }}>
        <div dangerouslySetInnerHTML={{ __html:text }} style={{ fontFamily:"var(--font-fell)" }} />
      </div>
      {lineAnnots.length > 0 && (
        <div className="annot-margin" style={{ width:260, flexShrink:0, display:"flex", flexDirection:"column", gap:4 }}>
          {lineAnnots.map(a => <MarginAnnot key={a.id} annot={a} userId={userId} isAdmin={isAdmin} onEdit={editAnnot} onDelete={deleteAnnot} compact={lineAnnots.length>1} />)}
        </div>
      )}
    </div>
  );
}

/* ─── Play view ─── */
function PlayView({ data, annots, showAnnots, annotsByLine, userId, isAdmin, editAnnot, deleteAnnot, bookmark }) {
  let lineNum = 0;
  return (
    <>
      {data.dramatis && (
        <details style={{ marginBottom:24, background:"var(--surface)", borderRadius:8, padding:"12px 16px", border:"1px solid var(--border-light)" }}>
          <summary style={{ fontFamily:"var(--font-display)", fontSize:13, letterSpacing:2, cursor:"pointer", color:"var(--text-muted)" }}>DRAMATIS PERSONAE</summary>
          <div style={{ marginTop:10, fontSize:14, lineHeight:1.8, fontFamily:"var(--font-fell)" }} dangerouslySetInnerHTML={{ __html:data.dramatis }} />
        </details>
      )}
      <div style={{ marginBottom:32 }}>
        {data.lines.map((item, idx) => {
          if (item.type==="act") return <h2 key={idx} style={{ textAlign:"center", fontFamily:"var(--font-display)", fontSize:16, fontWeight:400, letterSpacing:4, margin:"44px 0 14px", color:"var(--accent)", borderTop:"1px solid var(--border-light)", borderBottom:"1px solid var(--border-light)", padding:"12px 0", textTransform:"uppercase" }}>{item.text}</h2>;
          if (item.type==="scene") return <h3 key={idx} style={{ textAlign:"center", fontSize:15, fontWeight:400, fontStyle:"italic", color:"var(--text-muted)", margin:"24px 0 12px", letterSpacing:1, fontFamily:"var(--font-fell)" }}>{item.text}</h3>;
          if (item.type==="stagedir") return <div key={idx} style={{ textAlign:"center", fontStyle:"italic", color:"var(--text-muted)", margin:"8px 0", fontSize:"0.9em", fontFamily:"var(--font-fell)" }}>[{item.text}]</div>;
          if (item.type==="speech") return (
            <div key={idx} style={{ marginBottom:12 }}>
              {item.speaker && (
                <div style={{ fontFamily:"var(--font-display)", fontWeight:600, fontSize:13, letterSpacing:2, color:"var(--accent)", marginBottom:2, paddingLeft:48, textTransform:"uppercase" }}>{item.speaker}</div>
              )}
              {item.lines.map((line, li) => {
                if (line.type==="stagedir") return <div key={li} style={{ fontStyle:"italic", color:"var(--text-muted)", paddingLeft:48, fontSize:"0.85em", fontFamily:"var(--font-fell)", margin:"4px 0" }}>[{line.text}]</div>;
                lineNum++;
                const lineId = `l-${idx}-${li}`;
                return <AnnotatedLine key={li} lineId={lineId} text={line.text} annots={annots} annotsByLine={annotsByLine}
                  showAnnots={showAnnots} userId={userId} isAdmin={isAdmin} editAnnot={editAnnot} deleteAnnot={deleteAnnot}
                  lineNum={lineNum} showNum={lineNum%5===0} isBookmarked={bookmark===lineId} />;
              })}
            </div>
          );
          return null;
        })}
      </div>
    </>
  );
}

/* ─── Poetry view ─── */
function PoetryView({ data, annots, showAnnots, annotsByLine, userId, isAdmin, editAnnot, deleteAnnot, bookmark }) {
  let lineNum = 0;
  return (
    <div style={{ marginBottom:32 }}>
      {data.sections.map((sec, si) => (
        <div key={si} style={{ marginBottom:28 }}>
          {sec.title && <h3 style={{ fontFamily:"var(--font-display)", fontSize:16, letterSpacing:2, color:"var(--accent)", margin:"20px 0 10px", textAlign:"center" }}>{sec.title}</h3>}
          {sec.lines.map((line, li) => {
            if (line.type==="stagedir") return <div key={li} style={{ textAlign:"center", fontStyle:"italic", color:"var(--text-muted)", margin:"4px 0", fontSize:"0.85em" }}>[{line.text}]</div>;
            lineNum = line.n || ++lineNum;
            const lineId = `p-${si}-${li}`;
            return <AnnotatedLine key={li} lineId={lineId} text={line.text} annots={annots} annotsByLine={annotsByLine}
              showAnnots={showAnnots} userId={userId} isAdmin={isAdmin} editAnnot={editAnnot} deleteAnnot={deleteAnnot}
              lineNum={lineNum} showNum={lineNum%5===0||lineNum===1} isBookmarked={bookmark===lineId} />;
          })}
        </div>
      ))}
    </div>
  );
}

/* ─── Main ReaderPage ─── */
export default function ReaderPage() {
  const { slug } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin;
  const userId = user?.id;
  const [work, setWork] = useState(null);
  const [annots, setAnnots] = useState([]);
  const [disc, setDisc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const [fontSize, setFontSize] = useState(20);
  const [annotMode, setAnnotMode] = useState("all");
  const [bookmark, setBookmark] = useState(null);
  const [wordLookup, setWordLookup] = useState(null); // { word, position:{x,y} }
  const [myLayers, setMyLayers] = useState([]);
  const progressRef = useRef({ maxLine:0, total:0, slug:null });
  const resumeLine = Math.max(0, parseInt(new URLSearchParams(location.search).get("line") || "0", 10) || 0);

  const showAnnots = annotMode !== "off";

  useEffect(() => {
    setLoading(true);
    const filter = annotMode === "off" ? null : annotMode;
    Promise.all([
      worksApi.get(slug),
      filter ? annotsApi.forWork(slug, filter).catch(()=>[]) : Promise.resolve([]),
      discApi.forWork(slug).catch(()=>[]),
      user ? bmApi.forWork(slug).catch(()=>null) : Promise.resolve(null),
      user ? layersApi.list().catch(()=>[]) : Promise.resolve([]),
    ])
      .then(([w,a,d,bm,layers]) => {
        setWork(w); setAnnots(a); setDisc(d);
        if(bm) setBookmark(bm.line_id);
        setMyLayers((layers||[]).filter(l => l.isOwner));
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [slug, annotMode]);

  // Track reading progress on scroll
  useEffect(() => {
    if (!user || !work) return;
    progressRef.current.slug = slug;

    const trackProgress = () => {
      const lines = document.querySelectorAll("[data-lineid]");
      if (!lines.length) return;
      const viewportBottom = window.innerHeight;
      let maxVisible = 0;
      lines.forEach((el, i) => {
        if (el.getBoundingClientRect().top < viewportBottom) maxVisible = i + 1;
      });
      const total = lines.length;
      if (maxVisible > progressRef.current.maxLine) {
        progressRef.current.maxLine = maxVisible;
        progressRef.current.total = total;
      }
    };

    const saveProgress = () => {
      const { maxLine, total, slug: s } = progressRef.current;
      if (maxLine > 0 && s) {
        progApi.update(s, { linesRead: maxLine, totalLines: total, maxLineReached: maxLine }).catch(()=>{});
      }
    };

    window.addEventListener("scroll", trackProgress, { passive:true });
    // Save progress every 30s and on unmount
    const interval = setInterval(saveProgress, 30000);
    return () => {
      window.removeEventListener("scroll", trackProgress);
      clearInterval(interval);
      saveProgress();
    };
  }, [user, work, slug]);

  // Scroll to bookmark on load
  useEffect(() => {
    if (bookmark && !loading && !resumeLine) {
      setTimeout(() => {
        const el = document.getElementById(bookmark);
        if (el) el.scrollIntoView({ behavior:"smooth", block:"center" });
      }, 300);
    }
  }, [bookmark, loading, resumeLine]);

  // Resume from explicit line number in URL query (?line=123)
  useEffect(() => {
    if (loading || !resumeLine) return;
    setTimeout(() => {
      const lines = document.querySelectorAll("[data-lineid]");
      if (!lines.length) return;
      const target = lines[Math.min(lines.length - 1, Math.max(0, resumeLine - 1))];
      if (target) target.scrollIntoView({ behavior:"smooth", block:"center" });
    }, 250);
  }, [loading, slug, resumeLine, work?.id]);

  const handleSelect = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    const text = sel.toString().trim();
    if (text.length < 2) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    let node = sel.getRangeAt(0).startContainer;
    while (node && !node.dataset?.lineid) node = node.parentElement;
    const lineId = node?.dataset?.lineid || "u";

    // Single word with no spaces → word lookup (works for everyone)
    if (!text.includes(" ") && text.length < 30) {
      setWordLookup({
        word:text.toLowerCase().replace(/[^a-z']/g,""),
        selectedText:text,
        lineId,
        position:{ x:rect.left+rect.width/2, y:rect.bottom },
      });
      return;
    }

    // Multi-word selection → annotation (requires sign-in)
    if (!user) return;
    setTooltip({ x:rect.left+rect.width/2-160, y:rect.bottom, text, lineId });
  }, [user]);

  const saveAnnot = async (note, color, layerId) => {
    try {
      const a = await annotsApi.create({ workId:work.id, lineId:tooltip.lineId, note, color, selectedText:tooltip.text });
      if (layerId) {
        await layersApi.addAnnotation(layerId, a.id).catch(()=>{});
      }
      setAnnots(prev => [...prev, a]);
    } catch (e) { console.error("Save annotation failed:", e); }
    setTooltip(null);
    window.getSelection()?.removeAllRanges();
  };
  const editAnnot = async (id, note, color) => {
    try { const u = await annotsApi.update(id,{note,color}); setAnnots(prev => prev.map(a => a.id===id?{...a,note,color,...u}:a)); }
    catch (e) { console.error(e); }
  };
  const deleteAnnot = async (id) => {
    if (!confirm("Delete this annotation?")) return;
    try { await annotsApi.delete(id); setAnnots(prev => prev.filter(a => a.id!==id)); } catch(e){console.error(e);}
  };

  const setBookmarkHere = async () => {
    // Find the line element closest to center of viewport
    const lines = document.querySelectorAll("[data-lineid]");
    const center = window.innerHeight / 2;
    let closest = null, closestDist = Infinity;
    lines.forEach(el => {
      const d = Math.abs(el.getBoundingClientRect().top - center);
      if (d < closestDist) { closestDist = d; closest = el; }
    });
    if (closest) {
      const lineId = closest.dataset.lineid;
      const text = closest.textContent?.slice(0, 80) || "";
      await bmApi.set(slug, lineId, text);
      setBookmark(lineId);
    }
  };
  const clearBookmark = async () => {
    await bmApi.remove(slug);
    setBookmark(null);
  };

  const postComment = async (body,parentId) => { const c=await discApi.post(slug,body,parentId); setDisc(prev=>[...prev,c]); };
  const editComment = async (id,body) => { await discApi.edit(id,body); setDisc(prev=>prev.map(c=>c.id===id?{...c,body,updatedAt:new Date().toISOString()}:c)); };
  const deleteComment = async (id) => { await discApi.delete(id); setDisc(prev=>prev.filter(c=>c.id!==id)); };

  if (loading) return <div style={{padding:60,textAlign:"center"}}><div className="spinner"/></div>;
  if (!work) return <div style={{padding:60,textAlign:"center",color:"var(--danger)"}}>Work not found.</div>;
  if (!work.content) return (
    <div className="animate-in" style={{maxWidth:560,margin:"60px auto",padding:"0 24px",textAlign:"center"}}>
      <h1 style={{fontFamily:"var(--font-display)",fontSize:28,color:"var(--accent)",marginBottom:12}}>{work.title}</h1>
      <p style={{color:"var(--text-muted)",fontFamily:"var(--font-fell)",fontStyle:"italic",lineHeight:1.7}}>
        Text not yet available.
      </p>
    </div>
  );

  const parsed = parsePlayShakespeareXML(work.content, work.title, work.category);
  const annotsByLine = {};
  annots.forEach(a => { (annotsByLine[a.line_id] ??= []).push(a); });

  const modeLabels = { all:"All", mine:"Mine", off:"Off" };
  const modeOrder = user ? ["all","mine","off"] : ["all","off"];

  return (
    <div className="animate-in" onMouseUp={handleSelect}
      style={{ maxWidth: showAnnots && annots.length > 0 ? 1020 : 740, margin:"0 auto", padding:"40px 24px 100px", fontSize, lineHeight:1.85, transition:"max-width 0.3s" }}>

      {/* Sticky bottom toolbar */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0, zIndex:90,
        background: "var(--bg)", borderTop:"1px solid var(--border)",
        padding:"8px 16px", backdropFilter:"blur(12px)",
      }}>
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:10, flexWrap:"wrap", maxWidth:800, margin:"0 auto" }}>
          <button className="btn btn-sm btn-secondary" onClick={()=>setFontSize(s=>Math.max(14,s-1))} style={{minWidth:32}}>A−</button>
          <span style={{ fontSize:12, color:"var(--text-light)", fontFamily:"var(--font-mono)", minWidth:20, textAlign:"center" }}>{fontSize}</span>
          <button className="btn btn-sm btn-secondary" onClick={()=>setFontSize(s=>Math.min(28,s+1))} style={{minWidth:32}}>A+</button>

          <span style={{ width:1, height:20, background:"var(--border)" }} />

          {/* Annotation mode toggle */}
          <div style={{ display:"flex", borderRadius:6, overflow:"hidden", border:"1px solid var(--border-light)" }}>
            {modeOrder.map(m => (
              <button key={m} className="btn btn-sm" onClick={()=>setAnnotMode(m)} style={{
                borderRadius:0, fontSize:12, padding:"4px 10px",
                background: annotMode===m ? "var(--accent)" : "var(--surface)",
                color: annotMode===m ? "#FFF8F0" : "var(--text-muted)",
                border:"none", fontFamily:"var(--font-display)", letterSpacing:1,
              }}>✎ {modeLabels[m]}</button>
            ))}
          </div>

          {showAnnots && annots.length > 0 && (
            <>
              <span style={{ width:1, height:20, background:"var(--border)" }} />
              {ANNOT_TYPES.map((t,i) => <span key={i} style={{ fontSize:10, color:"var(--text-light)" }}><span className={t.cls} style={{padding:"1px 4px",borderRadius:3}}>{t.icon}</span></span>)}
            </>
          )}

          {/* Bookmark controls */}
          {user && (
            <>
              <span style={{ width:1, height:20, background:"var(--border)" }} />
              <button className="btn btn-sm btn-secondary" onClick={setBookmarkHere} title="Bookmark current position" style={{ fontSize:14, padding:"4px 8px" }}>
                🔖
              </button>
              {bookmark && (
                <button className="btn btn-sm btn-ghost" onClick={clearBookmark} title="Clear bookmark" style={{ fontSize:11, color:"var(--text-light)", padding:"4px 6px" }}>
                  ✕
                </button>
              )}
            </>
          )}

          <span style={{ width:1, height:20, background:"var(--border)" }} />
          <span style={{ fontSize:11, color:"var(--text-light)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>Click a word to look it up</span>
        </div>
      </div>

      {/* Bookmark resume banner */}
      {bookmark && (
        <div style={{ textAlign:"center", marginBottom:12 }}>
          <button className="btn btn-ghost" onClick={()=>{const el=document.getElementById(bookmark);if(el)el.scrollIntoView({behavior:"smooth",block:"center"});}}
            style={{ fontSize:13, color:"var(--gold)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>
            🔖 Resume reading from bookmark
          </button>
        </div>
      )}

      {/* Title */}
      <h1 style={{ textAlign:"center", fontFamily:"var(--font-display)", fontSize:"1.8em", fontWeight:400, letterSpacing:3, color:"var(--accent)", marginBottom:4 }}>{parsed.title || work.title}</h1>
      <div style={{ textAlign:"center", fontFamily:"var(--font-fell)", fontStyle:"italic", color:"var(--text-light)", fontSize:15, marginBottom:8 }}>William Shakespeare</div>
      <div style={{ textAlign:"center", color:"var(--border)", fontSize:14, letterSpacing:8, marginBottom:28 }}>❧ ❦ ❧</div>

      {/* Content */}
      {parsed.type === "poetry"
        ? <PoetryView data={parsed} annots={annots} showAnnots={showAnnots} annotsByLine={annotsByLine} userId={userId} isAdmin={isAdmin} editAnnot={editAnnot} deleteAnnot={deleteAnnot} bookmark={bookmark} />
        : <PlayView data={parsed} annots={annots} showAnnots={showAnnots} annotsByLine={annotsByLine} userId={userId} isAdmin={isAdmin} editAnnot={editAnnot} deleteAnnot={deleteAnnot} bookmark={bookmark} />
      }

      {tooltip && <AnnotTooltip pos={tooltip} onSave={saveAnnot} onCancel={()=>{setTooltip(null);window.getSelection()?.removeAllRanges();}} myLayers={myLayers} />}
      {wordLookup && (
        <WordLookup
          word={wordLookup.word}
          position={wordLookup.position}
          onClose={()=>{setWordLookup(null);window.getSelection()?.removeAllRanges();}}
          onAnnotate={user ? () => {
            setTooltip({
              x:wordLookup.position.x - 160,
              y:wordLookup.position.y,
              text:wordLookup.selectedText || wordLookup.word,
              lineId:wordLookup.lineId || "u",
            });
            setWordLookup(null);
          } : undefined}
        />
      )}
      <ThreadedComments comments={disc} onPost={postComment} onEdit={editComment} onDelete={deleteComment} label="Discussion" />
    </div>
  );
}
