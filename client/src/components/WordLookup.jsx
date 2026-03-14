import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { words as wordsApi, glossary as glossaryApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";
import { useAuth } from "../lib/AuthContext";
import { useConfirm } from "../lib/ConfirmContext";

const GLOSS_SCOPE_LABELS = {
  global: "Headword",
  work: "This Work",
  line: "This Line",
};

function sanitizeTerm(value) {
  return String(value || "").toLowerCase().replace(/[^a-z']/g, "");
}

function buildEditorState(data, word, scopeOptions) {
  const normalizedWord = data?.normalizedWord || sanitizeTerm(word);
  const globalEntry = data?.editorial?.globalEntry || null;
  const workOverride = data?.editorial?.workOverride || null;
  const lineOverride = data?.editorial?.lineOverride || null;

  const preferredScope = lineOverride
    ? "line"
    : workOverride
      ? "work"
      : "global";

  return {
    activeScope: scopeOptions.some((option) => option.id === preferredScope)
      ? preferredScope
      : (scopeOptions[0]?.id || "global"),
    drafts: {
      global: {
        entryId: globalEntry?.id || null,
        headword: globalEntry?.headword || data?.gloss?.headword || normalizedWord,
        variants: (globalEntry?.variants || []).join(", "),
        definition: globalEntry?.definition || "",
        sourceLabel: globalEntry?.sourceLabel || "",
      },
      work: {
        overrideId: workOverride?.id || null,
        lookupTerm: workOverride?.lookupTerm || data?.gloss?.headword || normalizedWord,
        definition: workOverride?.definition || "",
        sourceLabel: workOverride?.sourceLabel || "",
      },
      line: {
        overrideId: lineOverride?.id || null,
        lookupTerm: lineOverride?.lookupTerm || data?.gloss?.headword || normalizedWord,
        definition: lineOverride?.definition || "",
        sourceLabel: lineOverride?.sourceLabel || "",
      },
    },
  };
}

export default function WordLookup({
  word,
  label,
  workSlug = "",
  lineId = "",
  position,
  onClose,
  onAnnotate,
  mobileSheet = false,
  searchHref = "",
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canEditGlossary = !!user?.canPublishGlobal;
  const safeLineId = lineId && lineId !== "u" ? lineId : "";
  const scopeOptions = useMemo(() => ([
    { id: "global", label: "Headword" },
    ...(workSlug ? [{ id: "work", label: "This work" }] : []),
    ...(safeLineId ? [{ id: "line", label: "This line" }] : []),
  ]), [safeLineId, workSlug]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeScope, setActiveScope] = useState(scopeOptions[0]?.id || "global");
  const [drafts, setDrafts] = useState(() => ({
    global: { entryId: null, headword: sanitizeTerm(word), variants: "", definition: "", sourceLabel: "" },
    work: { overrideId: null, lookupTerm: sanitizeTerm(word), definition: "", sourceLabel: "" },
    line: { overrideId: null, lookupTerm: sanitizeTerm(word), definition: "", sourceLabel: "" },
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!word) return undefined;
    let cancelled = false;
    setLoading(true);
    wordsApi.lookup(word, { workSlug, lineId: safeLineId })
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        toast?.error("Could not look up that word.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lineId, safeLineId, toast, word, workSlug]);

  useEffect(() => {
    const next = buildEditorState(data, word, scopeOptions);
    setDrafts(next.drafts);
    setActiveScope(next.activeScope);
    setEditorOpen(false);
  }, [data, scopeOptions, word]);

  if (!word) return null;

  const displayWord = label || word;
  const left = Math.max(12, Math.min(position.x - 180, window.innerWidth - 380));
  const top = position.y + 12;
  const panelStyle = mobileSheet
    ? {
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        zIndex: 200,
        maxHeight: "min(72vh, 560px)",
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 18,
        boxShadow: "0 -10px 36px var(--shadow)",
        padding: "12px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
        fontSize: 14,
      }
    : {
        position: "fixed",
        top,
        left,
        zIndex: 200,
        width: "min(360px, calc(100vw - 24px))",
        maxHeight: 420,
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 12px 40px var(--shadow)",
        padding: 16,
        fontSize: 14,
      };

  const hasGloss = !!data?.gloss?.definition;
  const hasCorpusResults = (data?.totalCount || 0) > 0;
  const currentDraft = drafts[activeScope] || drafts.global;

  const refreshLookup = async () => {
    const result = await wordsApi.lookup(word, { workSlug, lineId: safeLineId });
    setData(result);
    return result;
  };

  const setDraftValue = (scope, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [scope]: {
        ...prev[scope],
        [key]: value,
      },
    }));
  };

  const copyWord = async () => {
    try {
      await navigator.clipboard.writeText(displayWord);
      toast?.success("Word copied.");
    } catch {
      toast?.error("Could not copy word.");
    }
  };

  const saveGlossaryDefinition = async () => {
    try {
      setSaving(true);
      if (activeScope === "global") {
        await glossaryApi.save({
          scope: "global",
          entryId: currentDraft.entryId || null,
          headword: currentDraft.headword,
          variants: currentDraft.variants,
          definition: currentDraft.definition,
          sourceLabel: currentDraft.sourceLabel,
        });
      } else {
        await glossaryApi.save({
          scope: activeScope,
          overrideId: currentDraft.overrideId || null,
          workSlug,
          lineId: activeScope === "line" ? safeLineId : "",
          lookupTerm: currentDraft.lookupTerm,
          definition: currentDraft.definition,
          sourceLabel: currentDraft.sourceLabel,
        });
      }
      await refreshLookup();
      setEditorOpen(false);
      toast?.success("Glossary definition saved.");
    } catch (e) {
      toast?.error(e.message || "Could not save glossary definition.");
    } finally {
      setSaving(false);
    }
  };

  const clearGlossaryDefinition = async () => {
    const entryId = activeScope === "global"
      ? drafts.global.entryId
      : drafts[activeScope]?.overrideId;
    if (!entryId) return;

    const ok = await confirm({
      title: activeScope === "global" ? "Delete Headword Definition" : "Delete Contextual Definition",
      message: activeScope === "global"
        ? "Remove this glossary headword definition and its variants?"
        : "Remove this contextual glossary override?",
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;

    try {
      setSaving(true);
      await glossaryApi.remove({
        scope: activeScope,
        entryId: activeScope === "global" ? entryId : undefined,
        overrideId: activeScope !== "global" ? entryId : undefined,
      });
      await refreshLookup();
      setEditorOpen(false);
      toast?.success("Glossary definition removed.");
    } catch (e) {
      toast?.error(e.message || "Could not remove glossary definition.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position:"fixed", inset:0, zIndex:199 }} />
      <div style={panelStyle}>
        {mobileSheet && (
          <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
            <div style={{ width:42, height:4, borderRadius:999, background:"var(--border)" }} />
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <span style={{ fontFamily:"var(--font-display)", fontSize:20, color:"var(--accent)", letterSpacing:1 }}>{displayWord}</span>
          <button aria-label="Close word lookup" onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--text-light)", padding:"0 4px" }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding:20, textAlign:"center" }}><div className="spinner" /></div>
        ) : !data || (!hasGloss && !hasCorpusResults) ? (
          <div style={{ color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic", padding:"12px 0" }}>
            Word not found in the Shakespeare corpus.
          </div>
        ) : (
          <>
            <div style={{ padding:"8px 12px", background:hasGloss ? "var(--gold-faint)" : "var(--bg)", borderRadius:6, marginBottom:10, borderLeft:`3px solid ${hasGloss ? "var(--gold)" : "var(--border)"}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:2 }}>
                <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:hasGloss ? "var(--gold)" : "var(--text-light)", textTransform:"uppercase" }}>Definition</div>
                {data?.gloss?.scope && (
                  <span style={{ fontSize:10, fontFamily:"var(--font-display)", letterSpacing:1, textTransform:"uppercase", color:"var(--text-light)" }}>
                    {GLOSS_SCOPE_LABELS[data.gloss.scope] || data.gloss.scope}
                  </span>
                )}
              </div>
              {hasGloss ? (
                <>
                  <div style={{ fontFamily:"var(--font-fell)", lineHeight:1.6, color:"var(--text)" }}>{data.gloss.definition}</div>
                  {data.gloss.headword && data.gloss.headword !== sanitizeTerm(word) && (
                    <div style={{ fontSize:12, color:"var(--text-light)", marginTop:6 }}>
                      Headword: <strong style={{ color:"var(--text)" }}>{data.gloss.headword}</strong>
                    </div>
                  )}
                  {data.gloss.sourceLabel && (
                    <div style={{ fontSize:11, color:"var(--text-light)", marginTop:6 }}>{data.gloss.sourceLabel}</div>
                  )}
                </>
              ) : (
                <div style={{ color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic", lineHeight:1.6 }}>
                  No editorial glossary definition yet.
                </div>
              )}
            </div>

            {data.examples.length > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--text-light)", textTransform:"uppercase", marginBottom:4 }}>In Context</div>
                {data.examples.map((ex, i) => (
                  <div key={i} style={{ fontSize:13, fontFamily:"var(--font-fell)", color:"var(--text-muted)", lineHeight:1.5, marginBottom:4, paddingLeft:8, borderLeft:"2px solid var(--border-light)" }}>
                    <span dangerouslySetInnerHTML={{ __html: ex.snippet.replace(new RegExp(`\\b(${word})\\b`, "gi"), '<strong style="color:var(--accent)">$1</strong>') }} />
                    <Link to={`/read/${ex.slug}`} onClick={onClose} style={{ fontSize:11, color:"var(--text-light)", marginLeft:6 }}>— {ex.work}</Link>
                  </div>
                ))}
              </div>
            )}

            {hasCorpusResults && (
              <>
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

                {data.frequency.length > 0 && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--text-light)", textTransform:"uppercase", marginBottom:4 }}>Frequency by Work</div>
                    {data.frequency.slice(0, 8).map((f, i) => {
                      const maxCount = data.frequency[0].count;
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                          <Link
                            to={`/read/${f.slug}`}
                            onClick={onClose}
                            style={{ fontSize:12, color:"var(--text)", textDecoration:"none", width:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flexShrink:0 }}
                            onMouseEnter={(event) => { event.currentTarget.style.color = "var(--accent)"; }}
                            onMouseLeave={(event) => { event.currentTarget.style.color = "var(--text)"; }}
                          >
                            {f.title}
                          </Link>
                          <div style={{ flex:1, height:6, background:"var(--border-light)", borderRadius:3, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${(f.count / maxCount * 100)}%`, background:"var(--accent)", borderRadius:3 }} />
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
              </>
            )}

            {canEditGlossary && (
              <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid var(--border-light)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--gold)", textTransform:"uppercase", marginBottom:2 }}>
                      Editorial Glossary
                    </div>
                    <div style={{ fontSize:12, color:"var(--text-light)" }}>
                      Dictionary-style definitions live here. Longer passage-specific explanation still belongs in a `Gloss` annotation.
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditorOpen((open) => !open)} style={{ flexShrink:0 }}>
                    {editorOpen ? "Close Editor" : "Edit Definition"}
                  </button>
                </div>

                {editorOpen && (
                  <div style={{ display:"grid", gap:10 }}>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {scopeOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={activeScope === option.id ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                          onClick={() => setActiveScope(option.id)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {activeScope === "global" ? (
                      <>
                        <label style={{ display:"grid", gap:4 }}>
                          <span style={{ fontSize:12, color:"var(--text-light)" }}>Headword</span>
                          <input
                            value={drafts.global.headword}
                            onChange={(event) => setDraftValue("global", "headword", event.target.value)}
                            placeholder="mechanical"
                          />
                        </label>
                        <label style={{ display:"grid", gap:4 }}>
                          <span style={{ fontSize:12, color:"var(--text-light)" }}>Variants</span>
                          <input
                            value={drafts.global.variants}
                            onChange={(event) => setDraftValue("global", "variants", event.target.value)}
                            placeholder="mechanicals, mechanically"
                          />
                        </label>
                      </>
                    ) : (
                      <label style={{ display:"grid", gap:4 }}>
                        <span style={{ fontSize:12, color:"var(--text-light)" }}>
                          {activeScope === "line" ? "Word for this line" : "Word for this work"}
                        </span>
                        <input
                          value={currentDraft.lookupTerm}
                          onChange={(event) => setDraftValue(activeScope, "lookupTerm", event.target.value)}
                          placeholder={sanitizeTerm(word)}
                        />
                      </label>
                    )}

                    <label style={{ display:"grid", gap:4 }}>
                      <span style={{ fontSize:12, color:"var(--text-light)" }}>Definition</span>
                      <textarea
                        rows={4}
                        value={currentDraft.definition}
                        onChange={(event) => setDraftValue(activeScope, "definition", event.target.value)}
                        placeholder="A short dictionary-style gloss."
                      />
                    </label>

                    <label style={{ display:"grid", gap:4 }}>
                      <span style={{ fontSize:12, color:"var(--text-light)" }}>Source Label</span>
                      <input
                        value={currentDraft.sourceLabel}
                        onChange={(event) => setDraftValue(activeScope, "sourceLabel", event.target.value)}
                        placeholder="Codex editorial glossary"
                      />
                    </label>

                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <button className="btn btn-primary btn-sm" onClick={saveGlossaryDefinition} disabled={saving}>
                        {saving ? "Saving…" : `Save ${GLOSS_SCOPE_LABELS[activeScope] || "Definition"}`}
                      </button>
                      {((activeScope === "global" && drafts.global.entryId) || (activeScope !== "global" && drafts[activeScope]?.overrideId)) && (
                        <button className="btn btn-secondary btn-sm" onClick={clearGlossaryDefinition} disabled={saving}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {(onAnnotate || mobileSheet) && (
          <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid var(--border-light)", display:"grid", gap:8 }}>
            {onAnnotate && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onAnnotate()}
                style={{ width:"100%", color:"var(--text)" }}
              >
                Annotate this word
              </button>
            )}
            {mobileSheet && (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={copyWord}
                  style={{ width:"100%", color:"var(--text)" }}
                >
                  Copy word
                </button>
                {searchHref && (
                  <Link
                    to={searchHref}
                    onClick={onClose}
                    className="btn btn-secondary btn-sm"
                    style={{ width:"100%", textAlign:"center", color:"var(--text)", textDecoration:"none" }}
                  >
                    Open full search
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
