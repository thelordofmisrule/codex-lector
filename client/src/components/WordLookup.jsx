import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { words as api } from "../lib/api";

export default function WordLookup({ word, position, onClose, onAnnotate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!word) return;
    setLoading(true);
    api.lookup(word).then(setData).catch(()=>{}).finally(()=>setLoading(false));
  }, [word]);

  if (!word) return null;

  const left = Math.max(12, Math.min(position.x - 180, window.innerWidth - 380));
  const top = position.y + 12;

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:199 }} />
      <div style={{
        position:"fixed", top, left, zIndex:200,
        width:360, maxHeight:420, overflowY:"auto",
        background:"var(--surface)", border:"1px solid var(--border)",
        borderRadius:10, boxShadow:"0 12px 40px var(--shadow)",
        padding:16, fontSize:14,
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <span style={{ fontFamily:"var(--font-display)", fontSize:20, color:"var(--accent)", letterSpacing:1 }}>{word}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--text-light)", padding:"0 4px" }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding:20, textAlign:"center" }}><div className="spinner" /></div>
        ) : !data || data.totalCount === 0 ? (
          <div style={{ color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic", padding:"12px 0" }}>
            Word not found in the Shakespeare corpus.
          </div>
        ) : (
          <>
            {/* Glossary definition */}
            {data.gloss && (
              <div style={{ padding:"8px 12px", background:"var(--gold-faint)", borderRadius:6, marginBottom:10, borderLeft:"3px solid var(--gold)" }}>
                <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--gold)", textTransform:"uppercase", marginBottom:2 }}>Definition</div>
                <div style={{ fontFamily:"var(--font-fell)", lineHeight:1.6, color:"var(--text)" }}>{data.gloss}</div>
              </div>
            )}

            {/* Stats */}
            <div style={{ display:"flex", gap:12, marginBottom:10 }}>
              <div style={{ flex:1, padding:"6px 10px", background:"var(--bg)", borderRadius:6, textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:"var(--font-display)", color:"var(--accent)" }}>{data.totalCount.toLocaleString()}</div>
                <div style={{ fontSize:10, color:"var(--text-light)", letterSpacing:1, textTransform:"uppercase" }}>Uses</div>
              </div>
              <div style={{ flex:1, padding:"6px 10px", background:"var(--bg)", borderRadius:6, textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:"var(--font-display)", color:"var(--accent)" }}>{data.worksAppearingIn}</div>
                <div style={{ fontSize:10, color:"var(--text-light)", letterSpacing:1, textTransform:"uppercase" }}>Works</div>
              </div>
            </div>

            {/* Frequency by work */}
            {data.frequency.length > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--text-light)", textTransform:"uppercase", marginBottom:4 }}>Frequency by Work</div>
                {data.frequency.slice(0, 8).map((f, i) => {
                  const maxCount = data.frequency[0].count;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                      <Link to={`/read/${f.slug}`} onClick={onClose} style={{ fontSize:12, color:"var(--text)", textDecoration:"none", width:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flexShrink:0 }}
                        onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text)"}>
                        {f.title}
                      </Link>
                      <div style={{ flex:1, height:6, background:"var(--border-light)", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${(f.count/maxCount*100)}%`, background:"var(--accent)", borderRadius:3 }} />
                      </div>
                      <span style={{ fontSize:11, color:"var(--text-light)", width:28, textAlign:"right", flexShrink:0 }}>{f.count}</span>
                    </div>
                  );
                })}
                {data.frequency.length > 8 && (
                  <div style={{ fontSize:11, color:"var(--text-light)", fontStyle:"italic", marginTop:2 }}>…and {data.frequency.length - 8} more works</div>
                )}
              </div>
            )}

            {/* Example contexts */}
            {data.examples.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--text-light)", textTransform:"uppercase", marginBottom:4 }}>In Context</div>
                {data.examples.map((ex, i) => (
                  <div key={i} style={{ fontSize:13, fontFamily:"var(--font-fell)", color:"var(--text-muted)", lineHeight:1.5, marginBottom:4, paddingLeft:8, borderLeft:"2px solid var(--border-light)" }}>
                    <span dangerouslySetInnerHTML={{ __html: ex.snippet.replace(new RegExp(`\\b(${word})\\b`, "gi"), '<strong style="color:var(--accent)">$1</strong>') }} />
                    <Link to={`/read/${ex.slug}`} onClick={onClose} style={{ fontSize:11, color:"var(--text-light)", marginLeft:6 }}>— {ex.work}</Link>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {onAnnotate && (
          <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid var(--border-light)" }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onAnnotate()}
              style={{ width:"100%", color:"var(--text)" }}
            >
              Annotate this word
            </button>
          </div>
        )}
      </div>
    </>
  );
}
