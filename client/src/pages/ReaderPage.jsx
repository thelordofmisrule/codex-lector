import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { works as worksApi, annotations as annotsApi, discussions as discApi, bookmarks as bmApi, progress as progApi, layers as layersApi, analytics as analyticsApi, prosody as prosodyApi } from "../lib/api";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";
import { parsePlayShakespeareXML } from "../lib/textParser";
import { preservedAnnotationTextStyle, quotedExcerpt, smartenAnnotationText } from "../lib/annotationFormat";
import { findPlaceAwarenessMatch, warmPlaceAwarenessIndex } from "../lib/placeAwareness";
import { analyzeProsodyLine, parseProsodyScan } from "../lib/prosody";
import PlaceAwareness from "../components/PlaceAwareness";
import ThreadedComments from "../components/ThreadedComments";
import WordLookup from "../components/WordLookup";

const ANNOT_TYPES = [
  { label:"Gloss", desc:"Define a word or phrase", cls:"hl-0", icon:"📖" },
  { label:"Rhetoric", desc:"Rhetorical or poetic device", cls:"hl-1", icon:"🎭" },
  { label:"Exegesis", desc:"Interpretation or analysis", cls:"hl-2", icon:"🔍" },
  { label:"History", desc:"Historical context", cls:"hl-3", icon:"🏛" },
];

const PROSODY_MODES = [
  { id: "off", label: "Off" },
  { id: "marks", label: "Marks" },
  { id: "highlight", label: "Highlight" },
];

const DEFAULT_READER_VISIBILITY = {
  showGlobal: true,
  showPersonal: true,
  noteTypes: Object.fromEntries(ANNOT_TYPES.map((_, index) => [String(index), true])),
  layers: {},
};

function loadReaderVisibility() {
  try {
    const raw = JSON.parse(localStorage.getItem("codex-reader-visibility") || "{}");
    return {
      showGlobal: raw?.showGlobal !== false,
      showPersonal: raw?.showPersonal !== false,
      noteTypes: {
        ...DEFAULT_READER_VISIBILITY.noteTypes,
        ...(raw?.noteTypes && typeof raw.noteTypes === "object" ? raw.noteTypes : {}),
      },
      layers: raw?.layers && typeof raw.layers === "object" ? raw.layers : {},
    };
  } catch {
    return DEFAULT_READER_VISIBILITY;
  }
}

function isNoteTypeVisible(visibility, color) {
  return visibility.noteTypes[String(color ?? 0)] !== false;
}

function isLayerVisible(visibility, layerId) {
  if (!layerId) return false;
  return visibility.layers[String(layerId)] !== false;
}

function ReaderVisibilityPanel({
  user,
  parsedType,
  visibility,
  onToggleGlobal,
  onTogglePersonal,
  typeCounts,
  onToggleType,
  globalCount,
  personalCount,
  layerOptions,
  onToggleLayer,
  prosodyMode,
  onSetProsodyMode,
  onClose,
}) {
  return (
    <div
      className="reader-visibility-panel"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 62,
        transform: "translateX(-50%)",
        width: "min(680px, calc(100vw - 24px))",
        maxHeight: "min(72vh, 620px)",
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "0 18px 40px var(--shadow)",
        padding: 16,
        zIndex: 120,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 2 }}>
            Reader Controls
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)" }}>
            Layers & Overlays
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ color: "var(--text-light)" }}>Close</button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        <section>
          <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
            Annotation Sources
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 10px", border: "1px solid var(--border-light)", borderRadius: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={visibility.showGlobal} onChange={(event) => onToggleGlobal(event.target.checked)} />
                <span>
                  <span style={{ display: "block", color: "var(--text)" }}>Site-wide notes</span>
                  <span style={{ fontSize: 12, color: "var(--text-light)" }}>Canonical annotations visible to everyone</span>
                </span>
              </span>
              <span style={{ fontSize: 12, color: "var(--text-light)" }}>{globalCount}</span>
            </label>

            {user && (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 10px", border: "1px solid var(--border-light)", borderRadius: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={visibility.showPersonal} onChange={(event) => onTogglePersonal(event.target.checked)} />
                  <span>
                    <span style={{ display: "block", color: "var(--text)" }}>Personal notes</span>
                    <span style={{ fontSize: 12, color: "var(--text-light)" }}>Your unlayered private annotations</span>
                  </span>
                </span>
                <span style={{ fontSize: 12, color: "var(--text-light)" }}>{personalCount}</span>
              </label>
            )}
          </div>
        </section>

        <section>
          <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
            Note Types
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {ANNOT_TYPES.map((type, index) => (
              <label key={type.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", border: "1px solid var(--border-light)", borderRadius: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={isNoteTypeVisible(visibility, index)}
                    onChange={(event) => onToggleType(index, event.target.checked)}
                  />
                  <span>
                    <span style={{ display: "block", color: "var(--text)" }}>{type.icon} {type.label}</span>
                    <span style={{ fontSize: 12, color: "var(--text-light)" }}>{type.desc}</span>
                  </span>
                </span>
                <span style={{ fontSize: 12, color: "var(--text-light)" }}>{typeCounts[index] || 0}</span>
              </label>
            ))}
          </div>
        </section>

        {layerOptions.length > 0 && (
          <section>
            <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
              Layers In This Work
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {layerOptions.map((layer) => (
                <label key={layer.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 10px", border: "1px solid var(--border-light)", borderRadius: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={isLayerVisible(visibility, layer.id)}
                      onChange={(event) => onToggleLayer(layer.id, event.target.checked)}
                    />
                    <span>
                      <span style={{ display: "block", color: "var(--text)" }}>{layer.name}</span>
                      <span style={{ fontSize: 12, color: "var(--text-light)" }}>
                        {layer.isOwner ? "Your layer" : layer.isSubscribed ? "Subscribed layer" : "Layer notes"}{layer.displayName ? ` · ${layer.displayName}` : ""}
                      </span>
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-light)" }}>{layer.count}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        {parsedType === "poetry" && (
          <section>
            <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
              Prosody Overlay
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PROSODY_MODES.map((mode) => (
                <button
                  key={mode.id}
                  className="btn btn-sm"
                  onClick={() => onSetProsodyMode(mode.id)}
                  style={{
                    background: prosodyMode === mode.id ? "var(--gold)" : "var(--surface)",
                    color: prosodyMode === mode.id ? "var(--gold-contrast)" : "var(--text-muted)",
                    border: "1px solid var(--border-light)",
                    fontFamily: "var(--font-display)",
                    letterSpacing: 1,
                  }}
                >
                  ≈ {mode.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-light)", marginTop: 8 }}>
              Heuristic by default, with per-line overrides and prosody-only notes where you have corrected the meter.
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function defaultStressPattern(length) {
  let pattern = "";
  for (let index = 0; index < length; index += 1) {
    const trailingWeak = length % 2 === 1 && length > 1 && index === length - 1;
    pattern += trailingWeak ? "w" : (index % 2 === 0 ? "w" : "s");
  }
  return pattern;
}

function normalizeStressPattern(pattern, segmentCount) {
  const base = String(pattern || "").replace(/[^ws]/gi, "").toLowerCase();
  if (segmentCount <= 0) return "";
  let next = base.slice(0, segmentCount);
  const fallback = defaultStressPattern(segmentCount);
  while (next.length < segmentCount) {
    next += fallback[next.length] || "w";
  }
  return next;
}

function getProsodyDisplay(lineText, override) {
  if (override?.scanText) {
    const segments = parseProsodyScan(override.scanText, override.stressPattern);
    return {
      text: lineText,
      scanText: override.scanText,
      stressPattern: normalizeStressPattern(override.stressPattern, segments.length),
      segments,
      syllableCount: segments.length,
      meterLabel: segments.length ? `Stored scan · ${segments.length} syllable${segments.length === 1 ? "" : "s"}` : "Stored scan",
    };
  }
  return analyzeProsodyLine(lineText);
}

/* ─── Margin annotation ─── */
function MarginAnnot({ annot, userId, isAdmin, canPublishGlobal, onEdit, onDelete, compact }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(annot.note);
  const [color, setColor] = useState(annot.color);
  const [isGlobalDraft, setIsGlobalDraft] = useState(!!annot.is_global);
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
      {canPublishGlobal && (
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"var(--text-light)", marginBottom:6 }}>
          <input type="checkbox" checked={isGlobalDraft} onChange={e=>setIsGlobalDraft(e.target.checked)} />
          Publish as site-wide note
        </label>
      )}
      <textarea className="input" value={note} onChange={e=>setNote(e.target.value)} style={{ minHeight:60, resize:"vertical", fontSize:14 }} />
      <div style={{ display:"flex", gap:4, marginTop:6 }}>
        <button className="btn btn-primary btn-sm" onClick={()=>{onEdit(annot.id,note,color,isGlobalDraft);setEditing(false);}}>Save</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>{setEditing(false);setNote(annot.note);setColor(annot.color);setIsGlobalDraft(!!annot.is_global);}}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="reader-margin-annot" style={{
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
      {annot.selected_text && <div style={{ fontStyle:"italic", color:"var(--text-muted)", fontSize: compact ? 12 : 13, marginBottom:2, ...preservedAnnotationTextStyle }}>{quotedExcerpt(annot.selected_text, 50)}</div>}
      <div style={{ color:"var(--text)", ...preservedAnnotationTextStyle }}>
        {isLong && !expanded
          ? <>{smartenAnnotationText(annot.note.slice(0,60))}… <span style={{ color:"var(--accent)", fontSize:12, fontFamily:"var(--font-display)" }}>[more]</span></>
          : smartenAnnotationText(annot.note)
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
function AnnotTooltip({ pos, onSave, onCancel, myLayers, draftKey, canPublishGlobal }) {
  const [note, setNote] = useState(() => draftKey ? (localStorage.getItem(`${draftKey}:note`) || "") : "");
  const [color, setColor] = useState(() => draftKey ? (parseInt(localStorage.getItem(`${draftKey}:color`) || "0", 10) || 0) : 0);
  const [layerId, setLayerId] = useState(() => draftKey ? (localStorage.getItem(`${draftKey}:layer`) || "") : "");
  const [isGlobal, setIsGlobal] = useState(() => draftKey ? (localStorage.getItem(`${draftKey}:global`) === "1") : !!canPublishGlobal);
  const setNoteDraft = (value) => {
    setNote(value);
    if (draftKey) localStorage.setItem(`${draftKey}:note`, value);
  };
  const setColorDraft = (value) => {
    setColor(value);
    if (draftKey) localStorage.setItem(`${draftKey}:color`, String(value));
  };
  const setLayerDraft = (value) => {
    setLayerId(value);
    if (draftKey) localStorage.setItem(`${draftKey}:layer`, value);
    if (value) {
      setIsGlobal(false);
      if (draftKey) localStorage.setItem(`${draftKey}:global`, "0");
    }
  };
  const setGlobalDraft = (value) => {
    setIsGlobal(value);
    if (draftKey) localStorage.setItem(`${draftKey}:global`, value ? "1" : "0");
    if (value) {
      setLayerId("");
      if (draftKey) localStorage.removeItem(`${draftKey}:layer`);
    }
  };
  return (
      <div className="reader-annot-tooltip" style={{
        position:"fixed", top:pos.y+8, left:Math.max(12,Math.min(pos.x,window.innerWidth-340)),
        background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:12,
        boxShadow:"0 8px 24px var(--shadow)", width:320, zIndex:200,
    }}>
      <div style={{ fontSize:12, color:"var(--text-light)", marginBottom:6, fontStyle:"italic" }}>"{pos.text.slice(0,60)}{pos.text.length>60?"…":""}"</div>
      <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap" }}>
        {ANNOT_TYPES.map((t,i) => (
          <button key={i} onClick={()=>setColorDraft(i)} className="btn btn-sm" style={{
            fontSize:11, border: i===color ? "2px solid var(--accent)" : "2px solid transparent",
            background: i===color ? "var(--accent-faint)" : "var(--bg)",
            color: i===color ? "var(--text)" : "var(--text-muted)",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>
      <textarea className="input" value={note} onChange={e=>setNoteDraft(e.target.value)} placeholder="Your annotation…"
        autoFocus style={{ minHeight:60, resize:"vertical", fontSize:14, lineHeight:1.6 }} />
      {myLayers && myLayers.length > 0 && (
        <div style={{ marginTop:6 }}>
          <select className="input" value={layerId} onChange={e=>setLayerDraft(e.target.value)} style={{ fontSize:13, padding:"4px 8px" }}>
            <option value="">No layer (private)</option>
            {myLayers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
      {canPublishGlobal && (
        <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, fontSize:12, color:"var(--text-light)" }}>
          <input type="checkbox" checked={isGlobal} onChange={e=>setGlobalDraft(e.target.checked)} />
          Publish as site-wide note
        </label>
      )}
      <div style={{ display:"flex", gap:6, marginTop:8 }}>
        <button className="btn btn-primary btn-sm" onClick={()=>note.trim()&&onSave(note.trim(),color,layerId||null,isGlobal)}>Save</button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Annotated line with margin notes ─── */
function ProsodyLineText({ text, mode, override }) {
  const display = getProsodyDisplay(text, override);
  return (
    <span className={`reader-prosody reader-prosody--${mode}`}>
      {display.segments.map((segment, index) => (
        <span
          key={`${index}-${segment.text}`}
          className={`reader-prosody-syllable reader-prosody-syllable--${segment.stress === "s" ? "stress" : "weak"}`}
          data-meter={segment.mark}
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
}

function ProsodyNoteTooltip({ note, onClose, onEdit }) {
  if (!note) return null;
  const override = note.override || {};
  return (
    <div
      style={{
        position: "fixed",
        top: note.position.y + 8,
        left: Math.max(12, Math.min(note.position.x - 150, window.innerWidth - 320)),
        width: 300,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 10px 28px var(--shadow)",
        padding: 14,
        zIndex: 220,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 4 }}>
            Prosody Note
          </div>
          <div style={{ fontFamily: "var(--font-display)", color: "var(--accent)", fontSize: 16 }}>
            {override.noteTitle || "Meter note"}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ color: "var(--text-light)" }}>✕</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-light)", marginBottom: 8 }}>
        Line {note.lineNumber}
      </div>
      <div style={{ color: "var(--text-muted)", fontStyle: "italic", marginBottom: 10, lineHeight: 1.5 }}>
        {note.lineText}
      </div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "var(--text)" }}>
        {override.noteBody}
      </div>
      {onEdit && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit Prosody</button>
        </div>
      )}
    </div>
  );
}

function ProsodyEditor({ draft, onClose, onSave, onDelete }) {
  const display = getProsodyDisplay(draft.lineText, draft.override);
  const [scanText, setScanText] = useState(display.scanText);
  const [stressPattern, setStressPattern] = useState(display.stressPattern);
  const [noteTitle, setNoteTitle] = useState(draft.override?.noteTitle || "");
  const [noteBody, setNoteBody] = useState(draft.override?.noteBody || "");
  const [error, setError] = useState("");
  const segments = parseProsodyScan(scanText, stressPattern);
  const normalizedPattern = normalizeStressPattern(stressPattern, segments.length);

  const toggleStress = (index) => {
    const next = normalizeStressPattern(stressPattern, segments.length).split("");
    next[index] = next[index] === "s" ? "w" : "s";
    setStressPattern(next.join(""));
  };

  const resetToHeuristic = () => {
    const heuristic = analyzeProsodyLine(draft.lineText);
    setScanText(heuristic.scanText);
    setStressPattern(heuristic.stressPattern);
    setError("");
  };

  const submit = () => {
    if (!segments.length) {
      setError("Insert at least one syllable boundary with | markers.");
      return;
    }
    setError("");
    onSave({
      lineKey: draft.lineKey,
      lineText: draft.lineText,
      scanText,
      stressPattern: normalizedPattern,
      noteTitle,
      noteBody,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: Math.max(24, Math.min(draft.position.y + 12, window.innerHeight - 520)),
        left: Math.max(12, Math.min(draft.position.x - 190, window.innerWidth - 400)),
        width: 380,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 16px 36px var(--shadow)",
        padding: 16,
        zIndex: 230,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 4 }}>
            Prosody Editor
          </div>
          <div style={{ fontFamily: "var(--font-display)", color: "var(--accent)", fontSize: 16 }}>
            Line {draft.lineNumber}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ color: "var(--text-light)" }}>✕</button>
      </div>

      <div style={{ color: "var(--text-muted)", fontStyle: "italic", marginBottom: 10, lineHeight: 1.5 }}>
        {draft.lineText}
      </div>

      <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
        Segmented Scan
      </div>
      <textarea
        className="input"
        value={scanText}
        onChange={(event) => {
          const nextScan = event.target.value;
          const nextCount = parseProsodyScan(nextScan, normalizedPattern).length;
          setScanText(nextScan);
          setStressPattern(normalizeStressPattern(stressPattern, nextCount));
        }}
        rows={3}
        style={{ resize: "vertical", marginBottom: 6, lineHeight: 1.55 }}
      />
      <div style={{ fontSize: 12, color: "var(--text-light)", marginBottom: 10 }}>
        Insert <code style={{ background: "var(--code-bg)", padding: "1px 4px", borderRadius: 4 }}>|</code> between every syllable.
      </div>

      <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
        Stress Pattern
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {segments.map((segment, index) => {
          const stress = normalizedPattern[index] || "w";
          return (
            <button
              key={`${index}-${segment.text}`}
              className={`btn btn-sm ${stress === "s" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => toggleStress(index)}
              style={{ textTransform: "none", letterSpacing: 0, padding: "4px 8px" }}
            >
              {stress === "s" ? "¯" : "˘"} {segment.text.trim() || segment.text}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <input
          className="input"
          value={noteTitle}
          onChange={(event) => setNoteTitle(event.target.value)}
          placeholder="Prosody note title (optional)"
          maxLength={120}
        />
        <textarea
          className="input"
          value={noteBody}
          onChange={(event) => setNoteBody(event.target.value)}
          placeholder="Prosody-only note or explanation…"
          rows={3}
          maxLength={600}
          style={{ resize: "vertical", lineHeight: 1.55 }}
        />
      </div>

      {error && (
        <div style={{ marginBottom: 8, color: "var(--danger)", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" onClick={submit}>Save Scan</button>
          <button className="btn btn-secondary btn-sm" onClick={resetToHeuristic}>Reset to Heuristic</button>
          {draft.override && (
            <button className="btn btn-ghost btn-sm" onClick={() => onDelete(draft.lineKey)} style={{ color: "var(--danger)" }}>
              Clear Override
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-light)" }}>
          {segments.length} syllable{segments.length === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

function AnnotatedLine({ lineId, text, annots, annotsByLine, showAnnots, userId, isAdmin, canPublishGlobal, editAnnot, deleteAnnot, lineNum, showNum, isBookmarked, prosodyMode, prosodyOverride, onOpenProsodyNote, onOpenProsodyEditor }) {
  const lineAnnots = showAnnots ? (annotsByLine[lineId] || []) : [];
  const hasProsodyNote = !!(prosodyOverride?.noteBody || prosodyOverride?.noteTitle);
  const showProsodyTools = prosodyMode && prosodyMode !== "off";
  return (
    <div data-lineid={lineId} id={lineId} style={{ display:"flex", gap:12, alignItems:"flex-start", position:"relative" }}>
      <div style={{ width:40, textAlign:"right", flexShrink:0, fontSize:"0.75em", color:"var(--text-light)", fontFamily:"var(--font-mono)", userSelect:"none", paddingTop:2, position:"relative", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
        <div style={{ position:"relative", width:"100%" }}>
          {showNum && lineNum}
          {isBookmarked && <span style={{ position:"absolute", right:-4, top:0, fontSize:14 }} title="Bookmark">🔖</span>}
        </div>
        {showProsodyTools && hasProsodyNote && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={(event) => onOpenProsodyNote?.(event, lineId, text, lineNum)}
            style={{ padding:0, fontSize:11, color:"var(--gold)", lineHeight:1 }}
            title={prosodyOverride.noteTitle || "Prosody note"}
          >
            ◈
          </button>
        )}
        {showProsodyTools && isAdmin && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={(event) => onOpenProsodyEditor?.(event, lineId, text, lineNum)}
            style={{ padding:0, fontSize:11, color:"var(--accent)", lineHeight:1 }}
            title="Edit prosody for this line"
          >
            ≈
          </button>
        )}
      </div>
      <div style={{ flex:1 }}>
        <div className="reader-line-text" style={{ fontFamily:"var(--font-fell)", whiteSpace:"normal" }}>
          {showProsodyTools
            ? <ProsodyLineText text={text} mode={prosodyMode} override={prosodyOverride} />
            : text}
        </div>
      </div>
      {lineAnnots.length > 0 && (
        <div className="annot-margin" style={{ width:260, flexShrink:0, display:"flex", flexDirection:"column", gap:4 }}>
          {lineAnnots.map(a => <MarginAnnot key={a.id} annot={a} userId={userId} isAdmin={isAdmin} canPublishGlobal={canPublishGlobal} onEdit={editAnnot} onDelete={deleteAnnot} compact={lineAnnots.length>1} />)}
        </div>
      )}
    </div>
  );
}

/* ─── Play view ─── */
function PlayView({ data, annots, showAnnots, annotsByLine, userId, isAdmin, canPublishGlobal, editAnnot, deleteAnnot, bookmark }) {
  let lineNum = 0;
  return (
    <>
      {data.dramatis && (
        <details style={{ marginBottom:24, background:"var(--surface)", borderRadius:8, padding:"12px 16px", border:"1px solid var(--border-light)" }}>
          <summary className="reader-summary" style={{ fontFamily:"var(--font-display)", fontSize:13, letterSpacing:2, cursor:"pointer", color:"var(--text-muted)" }}>DRAMATIS PERSONAE</summary>
          <div className="reader-dramatis-body" style={{ marginTop:10, fontSize:14, lineHeight:1.8, fontFamily:"var(--font-fell)" }} dangerouslySetInnerHTML={{ __html:data.dramatis }} />
        </details>
      )}
      <div style={{ marginBottom:32 }}>
        {data.lines.map((item, idx) => {
          if (item.type==="act") return <h2 key={idx} className="reader-act-heading" style={{ textAlign:"center", fontFamily:"var(--font-display)", fontSize:16, fontWeight:400, letterSpacing:4, margin:"44px 0 14px", color:"var(--accent)", borderTop:"1px solid var(--border-light)", borderBottom:"1px solid var(--border-light)", padding:"12px 0", textTransform:"uppercase" }}>{item.text}</h2>;
          if (item.type==="scene") return <h3 key={idx} className="reader-scene-heading" style={{ textAlign:"center", fontSize:15, fontWeight:400, fontStyle:"italic", color:"var(--text-muted)", margin:"24px 0 12px", letterSpacing:1, fontFamily:"var(--font-fell)" }}>{item.text}</h3>;
          if (item.type==="stagedir") return <div key={idx} className="reader-stage-direction" style={{ textAlign:"center", fontStyle:"italic", color:"var(--text-muted)", margin:"8px 0", fontSize:"0.9em", fontFamily:"var(--font-fell)" }}>[{item.text}]</div>;
          if (item.type==="speech") return (
            <div key={idx} style={{ marginBottom:12 }}>
              {item.speaker && (
                <div className="reader-speaker" style={{ fontFamily:"var(--font-display)", fontWeight:600, fontSize:13, letterSpacing:2, color:"var(--accent)", marginBottom:2, paddingLeft:48, textTransform:"uppercase" }}>{item.speaker}</div>
              )}
              {item.lines.map((line, li) => {
                if (line.type==="stagedir") return <div key={li} className="reader-stage-direction" style={{ fontStyle:"italic", color:"var(--text-muted)", paddingLeft:48, fontSize:"0.85em", fontFamily:"var(--font-fell)", margin:"4px 0" }}>[{line.text}]</div>;
                const hasXmlN = Number.isFinite(line.n);
                lineNum = hasXmlN ? line.n : (lineNum + 1);
                const lineId = `l-${idx}-${li}`;
                return <AnnotatedLine key={li} lineId={lineId} text={line.text} annots={annots} annotsByLine={annotsByLine}
                  showAnnots={showAnnots} userId={userId} isAdmin={isAdmin} canPublishGlobal={canPublishGlobal} editAnnot={editAnnot} deleteAnnot={deleteAnnot}
                  lineNum={lineNum} showNum={hasXmlN || lineNum%5===0} isBookmarked={bookmark===lineId} prosodyMode="off" />;
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
function PoetryView({
  data,
  annots,
  showAnnots,
  annotsByLine,
  userId,
  isAdmin,
  canPublishGlobal,
  editAnnot,
  deleteAnnot,
  bookmark,
  prosodyMode,
  prosodyOverrides,
  onOpenProsodyNote,
  onOpenProsodyEditor,
}) {
  let lineNum = 0;
  return (
    <div style={{ marginBottom:32 }}>
      {data.sections.map((sec, si) => (
        <div key={si} style={{ marginBottom:28 }}>
          {(sec.title || sec.heading) && <h3 style={{ fontFamily:"var(--font-display)", fontSize:16, letterSpacing:2, color:"var(--accent)", margin:"20px 0 10px", textAlign:"center" }}>{sec.title || sec.heading}</h3>}
          {sec.lines.map((line, li) => {
            if (line.type==="stagedir") return <div key={li} className="reader-stage-direction" style={{ textAlign:"center", fontStyle:"italic", color:"var(--text-muted)", margin:"4px 0", fontSize:"0.85em" }}>[{line.text}]</div>;
            const hasXmlN = Number.isFinite(line.n);
            lineNum = hasXmlN ? line.n : (lineNum + 1);
            const lineId = line.lineKey || `p-${si}-${li}`;
            return <AnnotatedLine key={li} lineId={lineId} text={line.text} annots={annots} annotsByLine={annotsByLine}
              showAnnots={showAnnots} userId={userId} isAdmin={isAdmin} canPublishGlobal={canPublishGlobal} editAnnot={editAnnot} deleteAnnot={deleteAnnot}
              lineNum={lineNum}
              showNum={hasXmlN || lineNum%5===0||lineNum===1}
              isBookmarked={bookmark===lineId}
              prosodyMode={prosodyMode}
              prosodyOverride={prosodyOverrides[lineId]}
              onOpenProsodyNote={onOpenProsodyNote}
              onOpenProsodyEditor={onOpenProsodyEditor}
            />;
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const isAdmin = user?.isAdmin;
  const canPublishGlobal = !!user?.canPublishGlobal;
  const userId = user?.id;
  const [work, setWork] = useState(null);
  const [annots, setAnnots] = useState([]);
  const [disc, setDisc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const [fontSize, setFontSize] = useState(() => {
    const raw = parseInt(localStorage.getItem("codex-font-size") || "20", 10);
    return Number.isFinite(raw) ? Math.min(28, Math.max(14, raw)) : 20;
  });
  const [bookmark, setBookmark] = useState(null);
  const [wordLookup, setWordLookup] = useState(null); // { word, position:{x,y} }
  const [placeAwareness, setPlaceAwareness] = useState(null); // { placeSlug, initialPlace, matchedTerm, selectionText, lineId, position }
  const [layerCatalog, setLayerCatalog] = useState([]);
  const [myLayers, setMyLayers] = useState([]);
  const [showReaderHint, setShowReaderHint] = useState(() => localStorage.getItem("codex-reader-hint-dismissed") !== "true");
  const [readerVisibility, setReaderVisibility] = useState(loadReaderVisibility);
  const [showVisibilityPanel, setShowVisibilityPanel] = useState(false);
  const [prosodyMode, setProsodyMode] = useState(() => {
    const raw = localStorage.getItem("codex-prosody-mode");
    return raw === "marks" || raw === "highlight" ? raw : "off";
  });
  const [prosodyOverrides, setProsodyOverrides] = useState({});
  const [prosodyNote, setProsodyNote] = useState(null);
  const [prosodyEditor, setProsodyEditor] = useState(null);
  const progressRef = useRef({ maxLine:0, total:0, slug:null });
  const trackedSlugRef = useRef("");
  const selectionLookupRef = useRef(0);
  const resumeLine = Math.max(0, parseInt(new URLSearchParams(location.search).get("line") || "0", 10) || 0);
  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast?.success("Link copied.");
    } catch {
      toast?.error("Could not copy link.");
    }
  };

  useEffect(() => {
    localStorage.setItem("codex-font-size", String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem("codex-prosody-mode", prosodyMode);
  }, [prosodyMode]);

  useEffect(() => {
    localStorage.setItem("codex-reader-visibility", JSON.stringify(readerVisibility));
  }, [readerVisibility]);

  const getCurrentViewportLineNumber = useCallback(() => {
    const lines = document.querySelectorAll("[data-lineid]");
    if (!lines.length) return 1;
    const center = window.innerHeight / 2;
    let closestIndex = 0;
    let closestDist = Infinity;
    lines.forEach((el, i) => {
      const dist = Math.abs(el.getBoundingClientRect().top - center);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    });
    return closestIndex + 1;
  }, []);

  useEffect(() => {
    if (!work?.id || trackedSlugRef.current === slug) return;
    trackedSlugRef.current = slug;
    let visitorId = localStorage.getItem("codex-visitor-id");
    if (!visitorId) {
      visitorId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `visitor-${Date.now()}`;
      localStorage.setItem("codex-visitor-id", visitorId);
    }
    analyticsApi.event("work_view", {
      visitorId,
      path: window.location.pathname,
      meta: { workSlug: slug },
    }).catch(() => {});
  }, [work?.id, slug]);

  useEffect(() => {
    if (!work?.id) return undefined;
    const timer = setTimeout(() => {
      warmPlaceAwarenessIndex().catch(() => {});
    }, 2200);
    return () => clearTimeout(timer);
  }, [work?.id]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      const editingField = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      if (editingField) return;

      if (e.key === "/") {
        e.preventDefault();
        navigate(`/search?work=${encodeURIComponent(slug)}&returnLine=${getCurrentViewportLineNumber()}`);
      } else if (e.key.toLowerCase() === "b" && user) {
        e.preventDefault();
        setBookmarkHere();
      } else if (e.key === "Escape") {
        if (wordLookup || tooltip || placeAwareness || prosodyNote || prosodyEditor || showVisibilityPanel) {
          e.preventDefault();
          setWordLookup(null);
          setTooltip(null);
          setPlaceAwareness(null);
          setProsodyNote(null);
          setProsodyEditor(null);
          setShowVisibilityPanel(false);
          window.getSelection()?.removeAllRanges();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, user, wordLookup, tooltip, placeAwareness, prosodyNote, prosodyEditor, showVisibilityPanel, slug, getCurrentViewportLineNumber]);

  useEffect(() => {
    setShowVisibilityPanel(false);
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      worksApi.get(slug),
      annotsApi.forWork(slug, "all").catch(()=>[]),
      discApi.forWork(slug).catch(()=>[]),
      user ? bmApi.forWork(slug).catch(()=>null) : Promise.resolve(null),
      user ? layersApi.list().catch(()=>[]) : Promise.resolve([]),
      prosodyApi.forWork(slug).catch(()=>({ overrides: [] })),
    ])
      .then(([w,a,d,bm,layers,prosodyData]) => {
        setWork(w); setAnnots(a); setDisc(d);
        if(bm) setBookmark(bm.line_id);
        setLayerCatalog(layers || []);
        setMyLayers((layers||[]).filter(l => l.isOwner));
        setProsodyOverrides(Object.fromEntries((prosodyData?.overrides || []).map((item) => [item.lineKey, item])));
      })
      .catch(e => {
        console.error(e);
        if (e?.status !== 404) toast?.error("Could not load this work. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [slug, user, toast]);

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

  const handleSelect = useCallback(async () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    const text = sel.toString().trim();
    if (text.length < 2) return;
    const lookupToken = ++selectionLookupRef.current;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    let node = sel.getRangeAt(0).startContainer;
    while (node && !node.dataset?.lineid) node = node.parentElement;
    const lineId = node?.dataset?.lineid || "u";
    const position = { x:rect.left+rect.width/2, y:rect.bottom };
    const tokenCount = text.split(/\s+/).filter(Boolean).length;

    if (/[A-Za-z]/.test(text) && text.length <= 80 && tokenCount <= 5) {
      try {
        const match = await findPlaceAwarenessMatch(text);
        if (selectionLookupRef.current !== lookupToken) return;
        if (match) {
          setTooltip(null);
          setWordLookup(null);
          setPlaceAwareness({
            placeSlug: match.slug,
            initialPlace: match.place,
            matchedTerm: match.matchedTerm,
            selectionText: text,
            lineId,
            position,
          });
          return;
        }
      } catch {
        // Ignore place lookup failures and fall back to the standard reader tools.
      }
    }

    setPlaceAwareness(null);

    // Single word with no spaces → word lookup (works for everyone)
    if (!text.includes(" ") && text.length < 30) {
      setWordLookup({
        word:text.toLowerCase().replace(/[^a-z']/g,""),
        selectedText:text,
        lineId,
        position,
      });
      return;
    }

    // Multi-word selection → annotation (requires sign-in)
    if (!user) return;
    setWordLookup(null);
    setTooltip({ x:rect.left+rect.width/2-160, y:rect.bottom, text, lineId });
  }, [user]);

  const saveAnnot = async (note, color, layerId, isGlobal) => {
    try {
      const a = await annotsApi.create({ workId:work.id, lineId:tooltip.lineId, note, color, selectedText:tooltip.text, isGlobal });
      let nextAnnot = a;
      if (layerId) {
        await layersApi.addAnnotation(layerId, a.id).catch(()=>{});
        const layerMeta = myLayers.find((layer) => String(layer.id) === String(layerId));
        nextAnnot = {
          ...a,
          layer_id: Number(layerId),
          layer_name: layerMeta?.name || a.layer_name || "",
        };
      }
      setAnnots(prev => [...prev, nextAnnot]);
      localStorage.removeItem(`draft:annot:${slug}:note`);
      localStorage.removeItem(`draft:annot:${slug}:color`);
      localStorage.removeItem(`draft:annot:${slug}:layer`);
      localStorage.removeItem(`draft:annot:${slug}:global`);
      toast?.success("Annotation saved.");
    } catch (e) {
      console.error("Save annotation failed:", e);
      toast?.error(e.message || "Could not save annotation.");
    }
    setTooltip(null);
    window.getSelection()?.removeAllRanges();
  };
  const editAnnot = async (id, note, color, isGlobal) => {
    try {
      const u = await annotsApi.update(id,{note,color,isGlobal});
      setAnnots(prev => prev.map(a => a.id===id ? { ...a, ...u } : a));
      toast?.success("Annotation updated.");
    } catch (e) {
      console.error(e);
      toast?.error(e.message || "Could not update annotation.");
    }
  };
  const deleteAnnot = async (id) => {
    const ok = await confirm({
      title: "Delete Annotation",
      message: "Delete this annotation?",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await annotsApi.delete(id);
      setAnnots(prev => prev.filter(a => a.id!==id));
      toast?.success("Annotation deleted.");
    } catch(e) {
      console.error(e);
      toast?.error(e.message || "Could not delete annotation.");
    }
  };

  const openProsodyNote = (event, lineKey, lineText, lineNumber) => {
    event.stopPropagation();
    const override = prosodyOverrides[lineKey];
    if (!override || (!override.noteBody && !override.noteTitle)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setProsodyEditor(null);
    setProsodyNote({
      override,
      lineKey,
      lineText,
      lineNumber,
      position: { x: rect.left + (rect.width / 2), y: rect.bottom },
    });
  };

  const openProsodyEditor = (event, lineKey, lineText, lineNumber) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setProsodyNote(null);
    setProsodyEditor({
      override: prosodyOverrides[lineKey] || null,
      lineKey,
      lineText,
      lineNumber,
      position: { x: rect.left + (rect.width / 2), y: rect.bottom },
    });
  };

  const saveProsodyOverride = async (payload) => {
    try {
      const data = await prosodyApi.upsert(slug, payload.lineKey, payload);
      setProsodyOverrides((prev) => ({ ...prev, [data.override.lineKey]: data.override }));
      setProsodyEditor(null);
      toast?.success("Prosody override saved.");
    } catch (e) {
      toast?.error(e.message || "Could not save prosody override.");
    }
  };

  const deleteProsodyOverride = async (lineKey) => {
    const ok = await confirm({
      title: "Clear Prosody Override",
      message: "Remove the stored prosody override for this line?",
      confirmText: "Clear",
      danger: true,
    });
    if (!ok) return;
    try {
      await prosodyApi.delete(slug, lineKey);
      setProsodyOverrides((prev) => {
        const next = { ...prev };
        delete next[lineKey];
        return next;
      });
      setProsodyEditor(null);
      setProsodyNote(null);
      toast?.success("Prosody override cleared.");
    } catch (e) {
      toast?.error(e.message || "Could not clear prosody override.");
    }
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
      const prevBookmark = bookmark;
      setBookmark(lineId);
      try {
        await bmApi.set(slug, lineId, text);
        toast?.success("Bookmark saved.");
      } catch (e) {
        setBookmark(prevBookmark);
        toast?.error(e.message || "Could not save bookmark.");
      }
    }
  };
  const clearBookmark = async () => {
    const prevBookmark = bookmark;
    setBookmark(null);
    try {
      await bmApi.remove(slug);
      toast?.success("Bookmark cleared.");
    } catch (e) {
      setBookmark(prevBookmark);
      toast?.error(e.message || "Could not clear bookmark.");
    }
  };

  const postComment = async (body,parentId) => { const c=await discApi.post(slug,body,parentId); setDisc(prev=>[...prev,c]); };
  const editComment = async (id,body) => { await discApi.edit(id,body); setDisc(prev=>prev.map(c=>c.id===id?{...c,body,updatedAt:new Date().toISOString()}:c)); };
  const deleteComment = async (id) => { await discApi.delete(id); setDisc(prev=>prev.filter(c=>c.id!==id)); };

  if (loading) return <div style={{padding:60,textAlign:"center"}}><div className="spinner"/></div>;
  if (!work) return <div style={{padding:60,textAlign:"center",color:"var(--danger)"}}>Work not found.</div>;
  if (!work.content) return (
    <div className="animate-in reader-page" style={{maxWidth:560,margin:"60px auto",padding:"0 24px",textAlign:"center"}}>
      <h1 style={{fontFamily:"var(--font-display)",fontSize:28,color:"var(--accent)",marginBottom:12}}>{work.title}</h1>
      <p style={{color:"var(--text-muted)",fontFamily:"var(--font-fell)",fontStyle:"italic",lineHeight:1.7}}>
        Text not yet available.
      </p>
    </div>
  );

  const parsed = parsePlayShakespeareXML(work.content, work.title, work.category);
  const editionLabel = work.variant === "first-folio"
    ? "First Folio"
    : work.variant === "ps"
      ? "Modern Edition"
      : work.variant === "ps-apocrypha"
        ? "Apocrypha"
        : work.variant || "Edition";
  const layerCatalogById = Object.fromEntries((layerCatalog || []).map((layer) => [String(layer.id), layer]));
  const typeCounts = {};
  const layerCounts = {};
  let globalCount = 0;
  let personalCount = 0;

  annots.forEach((annot) => {
    typeCounts[annot.color] = (typeCounts[annot.color] || 0) + 1;

    if (annot.is_global) {
      globalCount += 1;
      return;
    }

    if (annot.layer_id) {
      const key = String(annot.layer_id);
      if (!layerCounts[key]) {
        const layerMeta = layerCatalogById[key];
        layerCounts[key] = {
          id: annot.layer_id,
          name: annot.layer_name || layerMeta?.name || `Layer ${annot.layer_id}`,
          displayName: layerMeta?.displayName || layerMeta?.display_name || "",
          isOwner: !!layerMeta?.isOwner,
          isSubscribed: !!layerMeta?.isSubscribed,
          count: 0,
        };
      }
      layerCounts[key].count += 1;
      return;
    }

    if (userId && annot.user_id === userId) {
      personalCount += 1;
    }
  });

  const layerOptions = Object.values(layerCounts).sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if (a.isSubscribed !== b.isSubscribed) return a.isSubscribed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const filteredAnnots = annots.filter((annot) => {
    if (!isNoteTypeVisible(readerVisibility, annot.color)) return false;
    if (annot.is_global) return readerVisibility.showGlobal;
    if (annot.layer_id) return isLayerVisible(readerVisibility, annot.layer_id);
    if (userId && annot.user_id === userId) return readerVisibility.showPersonal;
    return false;
  });

  const annotsByLine = {};
  filteredAnnots.forEach((annot) => {
    (annotsByLine[annot.line_id] ??= []).push(annot);
  });

  const showAnnots = filteredAnnots.length > 0;
  const dismissReaderHint = () => {
    localStorage.setItem("codex-reader-hint-dismissed", "true");
    setShowReaderHint(false);
  };

  return (
    <div className="animate-in reader-page" onMouseUp={handleSelect}
      style={{ maxWidth: showAnnots ? 1020 : 740, margin:"0 auto", padding:"40px 24px 100px", fontSize, lineHeight:1.85, transition:"max-width 0.3s" }}>

      {showReaderHint && (
        <div style={{ marginBottom:18, padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:8 }}>
            <div style={{ fontSize:12, fontFamily:"var(--font-display)", letterSpacing:2, color:"var(--accent)", textTransform:"uppercase" }}>
              First Time Here?
            </div>
            <button className="btn btn-ghost btn-sm" onClick={dismissReaderHint} style={{ color:"var(--text-light)" }}>Dismiss</button>
          </div>
          <div style={{ display:"grid", gap:4, fontSize:14, color:"var(--text-muted)", lineHeight:1.6 }}>
            <div>Select a phrase to annotate it.</div>
            <div>Click a single word for lookup, then choose to annotate if you want.</div>
            <div>Select a place name to open Place Awareness.</div>
            <div>Press <strong>b</strong> to bookmark your place.</div>
            <div>Use Layers & Overlays to mix site-wide notes, note types, prosody, and layer subscriptions.</div>
          </div>
        </div>
      )}

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

          <button
            className={`btn btn-sm ${showVisibilityPanel ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setShowVisibilityPanel((value) => !value)}
            style={{ fontFamily:"var(--font-display)", letterSpacing:1 }}
          >
            Layers & Overlays
          </button>

          {/* Bookmark controls */}
          {user && (
            <>
              <span style={{ width:1, height:20, background:"var(--border)" }} />
              <button className="btn btn-sm btn-secondary" aria-label="Bookmark current position" onClick={setBookmarkHere} title="Bookmark current position" style={{ fontSize:14, padding:"4px 8px" }}>
                🔖
              </button>
              {bookmark && (
                <button className="btn btn-sm btn-ghost" aria-label="Clear bookmark" onClick={clearBookmark} title="Clear bookmark" style={{ fontSize:11, color:"var(--text-light)", padding:"4px 6px" }}>
                  ✕
                </button>
              )}
            </>
          )}

          <span style={{ width:1, height:20, background:"var(--border)" }} />
          <button className="btn btn-sm btn-ghost" aria-label="Copy link to this page" onClick={copyPageLink} title="Copy link" style={{ fontSize:11, color:"var(--text-light)", padding:"4px 6px" }}>
            Copy Link
          </button>

          <span style={{ width:1, height:20, background:"var(--border)" }} />
          <span className="reader-note" style={{ fontSize:11, color:"var(--text-light)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>Click a word to look it up</span>
        </div>
      </div>

      {showVisibilityPanel && (
        <ReaderVisibilityPanel
          user={user}
          parsedType={parsed.type}
          visibility={readerVisibility}
          onToggleGlobal={(checked) => setReaderVisibility((prev) => ({ ...prev, showGlobal: checked }))}
          onTogglePersonal={(checked) => setReaderVisibility((prev) => ({ ...prev, showPersonal: checked }))}
          typeCounts={typeCounts}
          onToggleType={(color, checked) => setReaderVisibility((prev) => ({
            ...prev,
            noteTypes: { ...prev.noteTypes, [String(color)]: checked },
          }))}
          globalCount={globalCount}
          personalCount={personalCount}
          layerOptions={layerOptions}
          onToggleLayer={(layerId, checked) => setReaderVisibility((prev) => ({
            ...prev,
            layers: { ...prev.layers, [String(layerId)]: checked },
          }))}
          prosodyMode={prosodyMode}
          onSetProsodyMode={setProsodyMode}
          onClose={() => setShowVisibilityPanel(false)}
        />
      )}

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
      <div style={{ textAlign:"center", marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/search?work=${encodeURIComponent(slug)}&returnLine=${getCurrentViewportLineNumber()}`)}
            style={{ color:"var(--text-light)", fontSize:12, fontFamily:"var(--font-display)", letterSpacing:1 }}
          >
            Search This Work
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/chat?work=${encodeURIComponent(slug)}`)}
            style={{ color:"var(--text-light)", fontSize:12, fontFamily:"var(--font-display)", letterSpacing:1 }}
          >
            Live Chat
          </button>
          {parsed.type === "play" && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/people?work=${encodeURIComponent(slug)}`)}
              style={{ color:"var(--text-light)", fontSize:12, fontFamily:"var(--font-display)", letterSpacing:1 }}
            >
              People Map
            </button>
          )}
        </div>
      </div>
      <h1 style={{ textAlign:"center", fontFamily:"var(--font-display)", fontSize:"1.8em", fontWeight:400, letterSpacing:3, color:"var(--accent)", marginBottom:4 }}>{parsed.title || work.title}</h1>
      <div className="reader-byline" style={{ textAlign:"center", fontFamily:"var(--font-fell)", fontStyle:"italic", color:"var(--text-light)", fontSize:15, marginBottom:4 }}>William Shakespeare</div>
      <div style={{ textAlign:"center", fontSize:11, color:"var(--text-light)", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>
        {editionLabel} · {slug}
      </div>
      {parsed.type === "poetry" && prosodyMode !== "off" && (
        <div style={{ textAlign:"center", fontSize:12, color:"var(--text-light)", marginBottom:8 }}>
          Prosody overlay is heuristic unless a line has a stored override.
        </div>
      )}
      <div style={{ textAlign:"center", color:"var(--border)", fontSize:14, letterSpacing:8, marginBottom:28 }}>☙ ❦ ❧</div>

      {/* Content */}
      {parsed.type === "poetry"
        ? <PoetryView
            data={parsed}
            annots={annots}
            showAnnots={showAnnots}
            annotsByLine={annotsByLine}
            userId={userId}
            isAdmin={isAdmin}
            canPublishGlobal={canPublishGlobal}
            editAnnot={editAnnot}
            deleteAnnot={deleteAnnot}
            bookmark={bookmark}
            prosodyMode={prosodyMode}
            prosodyOverrides={prosodyOverrides}
            onOpenProsodyNote={openProsodyNote}
            onOpenProsodyEditor={openProsodyEditor}
          />
        : <PlayView data={parsed} annots={annots} showAnnots={showAnnots} annotsByLine={annotsByLine} userId={userId} isAdmin={isAdmin} canPublishGlobal={canPublishGlobal} editAnnot={editAnnot} deleteAnnot={deleteAnnot} bookmark={bookmark} />
      }

      {tooltip && <AnnotTooltip pos={tooltip} onSave={saveAnnot} onCancel={()=>{setTooltip(null);window.getSelection()?.removeAllRanges();}} myLayers={myLayers} draftKey={`draft:annot:${slug}`} canPublishGlobal={canPublishGlobal} />}
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
      {placeAwareness && (
        <PlaceAwareness
          placeSlug={placeAwareness.placeSlug}
          initialPlace={placeAwareness.initialPlace}
          matchedTerm={placeAwareness.matchedTerm}
          selectionText={placeAwareness.selectionText}
          workSlug={slug}
          position={placeAwareness.position}
          onClose={()=>{setPlaceAwareness(null);window.getSelection()?.removeAllRanges();}}
          onAnnotate={user ? () => {
            setTooltip({
              x:placeAwareness.position.x - 160,
              y:placeAwareness.position.y,
              text:placeAwareness.selectionText,
              lineId:placeAwareness.lineId || "u",
            });
            setPlaceAwareness(null);
          } : undefined}
        />
      )}
      {prosodyNote && (
        <ProsodyNoteTooltip
          note={prosodyNote}
          onClose={() => setProsodyNote(null)}
          onEdit={isAdmin ? () => {
            setProsodyEditor({
              override: prosodyNote.override,
              lineKey: prosodyNote.lineKey,
              lineText: prosodyNote.lineText,
              lineNumber: prosodyNote.lineNumber,
              position: prosodyNote.position,
            });
            setProsodyNote(null);
          } : undefined}
        />
      )}
      {prosodyEditor && (
        <ProsodyEditor
          draft={prosodyEditor}
          onClose={() => setProsodyEditor(null)}
          onSave={saveProsodyOverride}
          onDelete={deleteProsodyOverride}
        />
      )}
      <ThreadedComments comments={disc} onPost={postComment} onEdit={editComment} onDelete={deleteComment} label="Discussion" draftKey={`work:${slug}:discussion`} />
    </div>
  );
}
