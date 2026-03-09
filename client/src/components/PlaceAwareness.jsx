import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { places as placesApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";

function metadataBits(place) {
  return [place.placeType, place.modernCountry].filter(Boolean).join(" · ");
}

export default function PlaceAwareness({ placeSlug, workSlug, initialPlace, matchedTerm, selectionText, position, onClose, onAnnotate }) {
  const toast = useToast();
  const [data, setData] = useState(() => initialPlace ? { place: initialPlace, citations: [] } : null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!placeSlug) return;
    let cancelled = false;
    setLoading(true);

    placesApi.get(placeSlug, workSlug)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) {
          setData(initialPlace ? { place: initialPlace, citations: [] } : null);
          toast?.error("Could not load place details.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialPlace, placeSlug, toast, workSlug]);

  if (!placeSlug || !position) return null;

  const place = data?.place || initialPlace;
  const citations = data?.citations || [];
  const left = Math.max(12, Math.min(position.x - 190, window.innerWidth - 400));
  const top = position.y + 12;
  const mentionCount = citations.length;
  const label = metadataBits(place || {});

  return (
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position:"fixed", inset:0, zIndex:199 }} />
      <div style={{
        position:"fixed", top, left, zIndex:200,
        width:380, maxHeight:460, overflowY:"auto",
        background:"var(--surface)", border:"1px solid var(--border)",
        borderRadius:10, boxShadow:"0 12px 40px var(--shadow)",
        padding:16, fontSize:14,
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div>
            <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1.6, color:"var(--gold)", textTransform:"uppercase", marginBottom:4 }}>
              Place Awareness
            </div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:20, color:"var(--accent)", letterSpacing:1 }}>
              {place?.name || selectionText}
            </div>
          </div>
          <button aria-label="Close place awareness" onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--text-light)", padding:"0 4px" }}>✕</button>
        </div>

        {matchedTerm && matchedTerm !== place?.name && (
          <div style={{ fontSize:12, color:"var(--text-light)", marginBottom:8 }}>
            Matched from <span style={{ color:"var(--accent)" }}>{matchedTerm}</span>
          </div>
        )}

        {label && (
          <div style={{ fontSize:12, color:"var(--text-light)", textTransform:"capitalize", marginBottom:10 }}>
            {label}
          </div>
        )}

        {loading && !place ? (
          <div style={{ padding:20, textAlign:"center" }}><div className="spinner" /></div>
        ) : !place ? (
          <div style={{ color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic", padding:"12px 0" }}>
            No place record found for this selection.
          </div>
        ) : (
          <>
            {place.modernName && place.modernName !== place.name && (
              <div style={{ padding:"8px 12px", background:"var(--bg)", borderRadius:6, marginBottom:10 }}>
                <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--text-light)", textTransform:"uppercase", marginBottom:2 }}>Modern Name</div>
                <div style={{ color:"var(--text)" }}>{place.modernName}</div>
              </div>
            )}

            {place.description && (
              <div style={{ padding:"8px 12px", background:"var(--gold-faint)", borderRadius:6, marginBottom:10, borderLeft:"3px solid var(--gold)" }}>
                <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--gold)", textTransform:"uppercase", marginBottom:2 }}>Place Note</div>
                <div style={{ fontFamily:"var(--font-fell)", lineHeight:1.6, color:"var(--text)" }}>{place.description}</div>
              </div>
            )}

            {place.historicalNote && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--text-light)", textTransform:"uppercase", marginBottom:4 }}>Historical Context</div>
                <div style={{ fontFamily:"var(--font-fell)", lineHeight:1.6, color:"var(--text-muted)" }}>{place.historicalNote}</div>
              </div>
            )}

            <div style={{ display:"flex", gap:12, marginBottom:10 }}>
              <div style={{ flex:1, padding:"6px 10px", background:"var(--bg)", borderRadius:6, textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:"var(--font-display)", color:"var(--accent)" }}>{mentionCount}</div>
                <div style={{ fontSize:10, color:"var(--text-light)", letterSpacing:1, textTransform:"uppercase" }}>
                  {workSlug ? "Mentions Here" : "Citations"}
                </div>
              </div>
              <div style={{ flex:1, padding:"6px 10px", background:"var(--bg)", borderRadius:6, textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:"var(--font-display)", color:"var(--accent)" }}>{place.aliases?.length || 0}</div>
                <div style={{ fontSize:10, color:"var(--text-light)", letterSpacing:1, textTransform:"uppercase" }}>Aliases</div>
              </div>
            </div>

            {citations.length > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--text-light)", textTransform:"uppercase", marginBottom:4 }}>
                  {workSlug ? "In This Work" : "In Context"}
                </div>
                {citations.slice(0, 3).map((citation) => (
                  <div key={`${citation.workSlug}-${citation.lineNumber}`} style={{ fontSize:13, fontFamily:"var(--font-fell)", color:"var(--text-muted)", lineHeight:1.5, marginBottom:6, paddingLeft:8, borderLeft:"2px solid var(--border-light)" }}>
                    <div>{citation.lineText}</div>
                    <Link to={`/read/${citation.workSlug}?line=${citation.lineNumber}`} onClick={onClose} style={{ fontSize:11, color:"var(--text-light)", marginTop:2, display:"inline-block" }}>
                      {citation.workTitle} · line {citation.lineNumber}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid var(--border-light)", display:"grid", gap:8 }}>
          <Link
            to={`/places?place=${encodeURIComponent(placeSlug)}${workSlug ? `&work=${encodeURIComponent(workSlug)}` : ""}`}
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ width:"100%", textAlign:"center", color:"var(--text)", textDecoration:"none" }}
          >
            Open Place Card
          </Link>
          {onAnnotate && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onAnnotate()}
              style={{ width:"100%", color:"var(--text)" }}
            >
              Annotate this place
            </button>
          )}
        </div>
      </div>
    </>
  );
}
