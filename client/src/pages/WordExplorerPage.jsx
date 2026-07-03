import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { concordance as concordanceApi, words as wordsApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";

const EXAMPLE_WORDS = ["honest", "blood", "crown", "love", "death", "fool", "heart", "witch", "dream", "ghost"];
const CATEGORY_COLORS = {
  tragedy: "var(--accent)",
  comedy: "var(--gold)",
  history: "var(--text-light)",
  poetry: "var(--accent-light)",
  apocrypha: "var(--border)",
};

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z]/g, "");
}

function sectionLabel(text) {
  return (
    <div style={{
      fontSize: 11,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      color: "var(--text-light)",
      fontFamily: "var(--font-display)",
    }}>
      {text}
    </div>
  );
}

function statCard(label, value, note = "") {
  return (
    <div style={{
      padding: "14px 16px",
      background: "var(--surface)",
      border: "1px solid var(--border-light)",
      borderRadius: 10,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: "var(--text-light)",
        fontFamily: "var(--font-display)",
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 28, color: "var(--accent)", fontFamily: "var(--font-display)", lineHeight: 1, marginBottom: note ? 6 : 0 }}>
        {value}
      </div>
      {note && <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.45 }}>{note}</div>}
    </div>
  );
}

function WordSearchBox({ initial = "", autoFocus = false }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initial);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => setQuery(initial), [initial]);

  useEffect(() => {
    function onDocClick(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function goTo(word) {
    const cleaned = normalizeToken(word);
    if (cleaned.length < 2) return;
    setOpen(false);
    navigate(`/words/${encodeURIComponent(cleaned)}`);
  }

  function onChange(value) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    const cleaned = normalizeToken(value);
    if (cleaned.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      wordsApi.autocomplete(cleaned)
        .then((rows) => {
          setSuggestions((rows || []).slice(0, 8));
          setOpen(true);
        })
        .catch(() => {});
    }, 180);
  }

  return (
    <div ref={boxRef} style={{ position: "relative", maxWidth: 460, width: "100%" }}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          goTo(query);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          className="input"
          value={query}
          autoFocus={autoFocus}
          placeholder="Search a word — e.g. honest, crown, lov'd…"
          onChange={(event) => onChange(event.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit">Look Up</button>
      </form>
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 30,
          marginTop: 4,
          background: "var(--surface)",
          border: "1px solid var(--border-light)",
          borderRadius: 10,
          boxShadow: "0 8px 24px var(--shadow)",
          overflow: "hidden",
        }}>
          {suggestions.map((item) => (
            <button
              key={item.word}
              onClick={() => goTo(item.word)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                width: "100%",
                padding: "9px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text)",
                fontFamily: "var(--font-body)",
                fontSize: 15,
              }}
            >
              <span>{item.word}</span>
              <span style={{ color: "var(--text-light)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{item.total}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineChart({ perWork, selectedWork, onSelectWork }) {
  const dated = useMemo(
    () => perWork.filter((work) => work.year).sort((a, b) => a.year - b.year || a.title.localeCompare(b.title)),
    [perWork],
  );
  if (dated.length < 2) return null;

  const width = 860;
  const height = 190;
  const padX = 14;
  const padBottom = 34;
  const maxRate = Math.max(...dated.map((work) => work.per10k), 0.01);
  const barWidth = Math.min(34, Math.max(9, (width - padX * 2) / dated.length - 4));
  const step = (width - padX * 2) / dated.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", display: "block" }}>
      {dated.map((work, index) => {
        const barHeight = Math.max(2, (work.per10k / maxRate) * (height - padBottom - 16));
        const x = padX + index * step + (step - barWidth) / 2;
        const y = height - padBottom - barHeight;
        const active = selectedWork === work.slug;
        const dimmed = selectedWork && !active;
        return (
          <g key={work.slug} style={{ cursor: "pointer" }} onClick={() => onSelectWork(active ? "" : work.slug)}>
            <title>{`${work.title} (${work.year}) — ${work.occurrences} occurrences, ${work.per10k} per 10k words`}</title>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={2.5}
              fill={CATEGORY_COLORS[work.category] || "var(--gold)"}
              opacity={dimmed ? 0.25 : active ? 1 : 0.82}
              stroke={active ? "var(--accent)" : "none"}
              strokeWidth={active ? 2 : 0}
            />
            {(index === 0 || index === dated.length - 1 || index % Math.ceil(dated.length / 8) === 0) && (
              <text
                x={x + barWidth / 2}
                y={height - padBottom + 16}
                textAnchor="middle"
                style={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: "var(--text-light)" }}
              >
                {work.year}
              </text>
            )}
          </g>
        );
      })}
      <line
        x1={padX}
        y1={height - padBottom}
        x2={width - padX}
        y2={height - padBottom}
        stroke="var(--border-light)"
        strokeWidth={1}
      />
    </svg>
  );
}

function KwicLine({ line, formSet, workSlug }) {
  const segments = useMemo(() => {
    const parts = String(line.lineText || "").split(/([A-Za-z’']+)/);
    const segs = parts
      .map((text) => ({ text, hit: formSet.has(normalizeToken(text)) }))
      .filter((seg) => seg.text !== "");
    const totalLength = line.lineText.length;
    if (totalLength <= 200) return segs;

    // Long prose paragraphs: trim to a window around the first match.
    const firstHit = segs.findIndex((seg) => seg.hit);
    if (firstHit === -1) return segs;
    let start = firstHit;
    let end = firstHit;
    let before = 0;
    let after = 0;
    while (start > 0 && before < 90) {
      start -= 1;
      before += segs[start].text.length;
    }
    while (end < segs.length - 1 && after < 90) {
      end += 1;
      after += segs[end].text.length;
    }
    const window = segs.slice(start, end + 1);
    if (start > 0) window.unshift({ text: "… ", hit: false });
    if (end < segs.length - 1) window.push({ text: " …", hit: false });
    return window;
  }, [line.lineText, formSet]);

  return (
    <div style={{
      display: "grid",
      gap: 4,
      padding: "10px 14px",
      borderRadius: 10,
      border: "1px solid var(--border-light)",
      background: "var(--surface)",
    }}>
      <div style={{ fontSize: 16, fontFamily: "var(--font-body)", color: "var(--text)", lineHeight: 1.55 }}>
        {segments.map((seg, index) => seg.hit ? (
          <mark
            key={index}
            style={{
              background: "var(--gold-faint)",
              color: "var(--accent)",
              fontWeight: 600,
              padding: "0 2px",
              borderRadius: 3,
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={index}>{seg.text}</span>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12.5, color: "var(--text-light)" }}>
          {!workSlug && <span style={{ color: "var(--text-muted)" }}>{line.title}</span>}
          {!workSlug && (line.actLabel || line.speaker) && " • "}
          {line.actLabel && `${line.actLabel}${line.sceneLabel ? `, ${line.sceneLabel}` : ""}`}
          {line.actLabel && line.speaker && " • "}
          {line.speaker && <span style={{ fontFamily: "var(--font-display)" }}>{line.speaker}</span>}
        </div>
        <Link
          className="btn btn-ghost btn-sm"
          to={`/read/${line.slug}?line=${Math.max(1, line.lineNumber || 1)}`}
          style={{ color: "var(--accent)", whiteSpace: "nowrap" }}
        >
          Open Text →
        </Link>
      </div>
    </div>
  );
}

export default function WordExplorerPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { word: rawWord } = useParams();
  const word = normalizeToken(rawWord || "");
  const [searchParams, setSearchParams] = useSearchParams();

  const scope = searchParams.get("scope") === "all" ? "all" : "canon";
  const workFilter = searchParams.get("work") || "";
  const speakerFilter = searchParams.get("speaker") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const extraForms = useMemo(
    () => (searchParams.get("forms") || "").split(",").map(normalizeToken).filter((form) => form.length >= 2),
    [searchParams],
  );
  const activeForms = useMemo(() => [...new Set([word, ...extraForms])].filter(Boolean), [word, extraForms]);
  const formSet = useMemo(() => new Set(activeForms), [activeForms]);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [linesData, setLinesData] = useState(null);
  const [linesLoading, setLinesLoading] = useState(false);
  const [error, setError] = useState("");

  function updateParams(changes) {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (!("page" in changes)) next.delete("page");
    setSearchParams(next, { replace: false });
  }

  useEffect(() => {
    if (!word) {
      setSummary(null);
      setError("");
      return;
    }
    let cancelled = false;
    setSummaryLoading(true);
    setError("");
    concordanceApi.summary(word, { forms: extraForms, scope })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setSummary(null);
        setError(err.message || "Could not load this word.");
        toast?.error(err.message || "Could not load this word.");
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => { cancelled = true; };
  }, [word, extraForms, scope, toast]);

  useEffect(() => {
    if (!word) {
      setLinesData(null);
      return;
    }
    let cancelled = false;
    setLinesLoading(true);
    concordanceApi.lines(word, { forms: extraForms, scope, work: workFilter, speaker: speakerFilter, page })
      .then((data) => {
        if (!cancelled) setLinesData(data);
      })
      .catch(() => {
        if (!cancelled) setLinesData(null);
      })
      .finally(() => {
        if (!cancelled) setLinesLoading(false);
      });
    return () => { cancelled = true; };
  }, [word, extraForms, scope, workFilter, speakerFilter, page]);

  const totalPages = linesData ? Math.max(1, Math.ceil(linesData.total / linesData.pageSize)) : 1;
  const selectedWorkTitle = summary?.perWork?.find((work) => work.slug === workFilter)?.title || workFilter;

  return (
    <div className="animate-in" style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ fontFamily: "var(--font-display)", letterSpacing: 2, color: "var(--gold)", fontSize: 12, textTransform: "uppercase", marginBottom: 8 }}>
          Concordance
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--accent)", fontWeight: 400, letterSpacing: 2, marginBottom: 8 }}>
          {word ? `“${word}”` : "Word Explorer"}
        </h1>
        <p style={{ maxWidth: 720, margin: "0 auto 18px", color: "var(--text-muted)", lineHeight: 1.7, fontSize: 16 }}>
          {word
            ? "Every occurrence across the canon — who says it, where, and what keeps company with it."
            : "Trace any word through the complete works: frequency by play and by speaker, every line in context, and the words it travels with."}
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <WordSearchBox initial={word} autoFocus={!word} />
        </div>
      </div>

      {!word && (
        <div style={{ textAlign: "center", display: "grid", gap: 14 }}>
          {sectionLabel("Try a word")}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {EXAMPLE_WORDS.map((example) => (
              <button
                key={example}
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/words/${example}`)}
              >
                {example}
              </button>
            ))}
          </div>
          <p style={{ maxWidth: 640, margin: "10px auto 0", color: "var(--text-light)", fontSize: 14, lineHeight: 1.7 }}>
            Counts are drawn from the modern-spelling canonical texts (plays and poems).
            Elided forms are matched too — searching “loved” can include “lov’d.”
          </p>
        </div>
      )}

      {word && summaryLoading && (
        <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" /></div>
      )}

      {word && !summaryLoading && error && (
        <div style={{
          padding: "18px 20px",
          background: "var(--surface)",
          border: "1px solid var(--border-light)",
          borderRadius: 12,
          color: "var(--danger)",
        }}>
          {error}
        </div>
      )}

      {word && !summaryLoading && !error && summary && (
        <div style={{ display: "grid", gap: 22 }}>
          {summary.gloss?.definition && (
            <div style={{
              padding: "14px 18px",
              background: "var(--surface)",
              border: "1px solid var(--border-light)",
              borderRadius: 12,
              maxWidth: 780,
              margin: "0 auto",
              textAlign: "center",
            }}>
              <span style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 15, lineHeight: 1.6 }}>
                {summary.gloss.definition}
              </span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {statCard("Occurrences", summary.stats.occurrences.toLocaleString(), summary.stats.approximate ? "Counted by line for very common words." : "")}
            {statCard("Lines", summary.stats.lines.toLocaleString())}
            {statCard("Works", summary.stats.works, scope === "all" ? "Canon + apocrypha." : "Canonical plays & poems.")}
            {statCard("Per 10k Words", summary.stats.per10k)}
          </div>

          {summary.suggestedForms.length > 1 && (
            <div style={{ display: "grid", gap: 8 }}>
              {sectionLabel("Word Forms")}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {summary.suggestedForms.map(({ form, lines }) => {
                  const isBase = form === word;
                  const active = formSet.has(form);
                  return (
                    <button
                      key={form}
                      className="btn btn-sm"
                      disabled={isBase}
                      onClick={() => {
                        const nextForms = active
                          ? extraForms.filter((item) => item !== form)
                          : [...extraForms, form];
                        updateParams({ forms: nextForms.join(",") });
                      }}
                      style={{
                        borderRadius: 999,
                        border: active ? "1px solid var(--accent)" : "1px solid var(--border-light)",
                        background: active ? "var(--accent-faint)" : "var(--surface)",
                        color: active ? "var(--accent)" : "var(--text-muted)",
                        fontFamily: "var(--font-body)",
                        opacity: isBase ? 0.9 : 1,
                      }}
                    >
                      {form} <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 4 }}>{lines}</span>
                    </button>
                  );
                })}
                <span style={{ fontSize: 12.5, color: "var(--text-light)" }}>
                  Toggle forms to include them in the counts below.
                </span>
              </div>
            </div>
          )}

          <div style={{
            background: "radial-gradient(circle at top, var(--surface) 0%, var(--bg) 80%)",
            border: "1px solid var(--border-light)",
            borderRadius: 16,
            padding: 18,
            display: "grid",
            gap: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)", letterSpacing: 1 }}>
                  Across the Canon
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Rate per 10,000 words, in order of composition. Click a bar to focus a work.
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-light)" }}>
                {[["tragedy", "Tragedy"], ["comedy", "Comedy"], ["history", "History"], ["poetry", "Poetry"]].map(([key, label]) => (
                  <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: CATEGORY_COLORS[key], display: "inline-block" }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <TimelineChart
              perWork={summary.perWork}
              selectedWork={workFilter}
              onSelectWork={(slug) => updateParams({ work: slug, speaker: "" })}
            />
          </div>

          <div className="words-facets-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 8 }}>
              {sectionLabel("By Work")}
              <div style={{ display: "grid", gap: 6 }}>
                {summary.perWork.slice(0, 12).map((work) => {
                  const active = workFilter === work.slug;
                  const maxOcc = summary.perWork[0]?.occurrences || 1;
                  return (
                    <button
                      key={work.slug}
                      onClick={() => updateParams({ work: active ? "" : work.slug, speaker: "" })}
                      style={{
                        position: "relative",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: active ? "1px solid var(--accent)" : "1px solid var(--border-light)",
                        background: active ? "var(--accent-faint)" : "var(--surface)",
                        cursor: "pointer",
                        overflow: "hidden",
                      }}
                    >
                      <span style={{
                        position: "absolute",
                        inset: 0,
                        width: `${(work.occurrences / maxOcc) * 100}%`,
                        background: "var(--gold-faint)",
                        pointerEvents: "none",
                      }} />
                      <span style={{ position: "relative", color: "var(--text)", fontFamily: "var(--font-body)", fontSize: 14.5, textAlign: "left" }}>
                        {work.title}
                        {work.year ? <span style={{ color: "var(--text-light)", fontSize: 12 }}> ({work.year})</span> : null}
                      </span>
                      <span style={{ position: "relative", fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {work.occurrences} · {work.per10k}/10k
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {sectionLabel("By Speaker")}
              <div style={{ display: "grid", gap: 6 }}>
                {summary.perSpeaker.filter((entry) => entry.speaker).slice(0, 12).map((entry) => {
                  const active = speakerFilter === entry.speaker;
                  const maxOcc = summary.perSpeaker.find((item) => item.speaker)?.occurrences || 1;
                  return (
                    <button
                      key={entry.speaker}
                      onClick={() => updateParams({ speaker: active ? "" : entry.speaker })}
                      style={{
                        position: "relative",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: active ? "1px solid var(--accent)" : "1px solid var(--border-light)",
                        background: active ? "var(--accent-faint)" : "var(--surface)",
                        cursor: "pointer",
                        overflow: "hidden",
                      }}
                    >
                      <span style={{
                        position: "absolute",
                        inset: 0,
                        width: `${(entry.occurrences / maxOcc) * 100}%`,
                        background: "var(--accent-faint)",
                        pointerEvents: "none",
                      }} />
                      <span style={{ position: "relative", color: "var(--text)", fontFamily: "var(--font-display)", fontSize: 14, textAlign: "left" }}>
                        {entry.speaker}
                      </span>
                      <span style={{ position: "relative", fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {entry.occurrences}{entry.workCount > 1 ? ` · ${entry.workCount} works` : ""}
                      </span>
                    </button>
                  );
                })}
                {!summary.perSpeaker.some((entry) => entry.speaker) && (
                  <div style={{ color: "var(--text-light)", fontStyle: "italic", fontSize: 14 }}>
                    No attributed speakers in this scope.
                  </div>
                )}
              </div>
            </div>
          </div>

          {summary.collocates.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {sectionLabel("Keeps Company With")}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {summary.collocates.map((entry) => (
                  <Link
                    key={entry.word}
                    to={`/words/${entry.word}`}
                    className="tag-chip"
                    style={{
                      background: "var(--gold-faint)",
                      color: "var(--gold)",
                      textDecoration: "none",
                      fontSize: 14,
                    }}
                  >
                    {entry.word} <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{entry.count}</span>
                  </Link>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-light)" }}>
                Words that appear in the same lines more often than chance would predict.
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--accent)" }}>
                  Every Line
                </div>
                <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
                  {linesData ? `${linesData.total.toLocaleString()} lines` : "…"}
                  {selectedWorkTitle && workFilter ? ` in ${selectedWorkTitle}` : ""}
                  {speakerFilter ? ` spoken by ${speakerFilter}` : ""}
                </div>
              </div>
              {(workFilter || speakerFilter) && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => updateParams({ work: "", speaker: "" })}
                  style={{ color: "var(--text-light)" }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            {linesLoading && <div style={{ padding: 30, textAlign: "center" }}><div className="spinner" /></div>}

            {!linesLoading && linesData && (
              <>
                <div style={{ display: "grid", gap: 8 }}>
                  {linesData.lines.map((line, index) => (
                    <KwicLine key={`${line.slug}-${line.lineNumber}-${index}`} line={line} formSet={formSet} workSlug={workFilter} />
                  ))}
                  {linesData.lines.length === 0 && (
                    <div style={{ color: "var(--text-light)", fontStyle: "italic", padding: 20, textAlign: "center" }}>
                      No lines match the current filters.
                    </div>
                  )}
                </div>

                {totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 6 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={page <= 1}
                      onClick={() => updateParams({ page: String(page - 1) })}
                    >
                      ← Previous
                    </button>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>
                      {page} / {totalPages}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={page >= totalPages}
                      onClick={() => updateParams({ page: String(page + 1) })}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--text-muted)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={scope === "all"}
                onChange={(event) => updateParams({ scope: event.target.checked ? "all" : "" })}
              />
              Include apocrypha
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
