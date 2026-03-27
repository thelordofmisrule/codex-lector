import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { works as api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../lib/ToastContext";
import { getWorkEditionOptionLabel } from "../lib/workPresentation";

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "tragedy", label: "Tragedies" },
  { value: "comedy", label: "Comedies" },
  { value: "history", label: "Histories" },
  { value: "poetry", label: "Poetry" },
  { value: "first_folio", label: "First Folio" },
  { value: "apocrypha", label: "Apocrypha" },
];

function variantLabel(variant) {
  if (variant === "first-folio") return "First Folio";
  if (variant === "ps-apocrypha") return "Apocrypha";
  if (variant === "ps") return "Modern Edition";
  return variant || "Edition";
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTerms(query) {
  return String(query || "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9" ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHighlightTerms(query, exact) {
  const normalized = normalizeTerms(query);
  if (!normalized) return [];
  if (exact) return [String(query || "").replace(/"/g, "").trim()].filter(Boolean);

  const quoted = Array.from(String(query || "").matchAll(/"([^"]+)"/g))
    .map((match) => normalizeTerms(match[1]))
    .filter(Boolean);
  const tokens = normalized.replace(/"([^"]+)"/g, " ").split(" ").filter(Boolean);

  return Array.from(new Set([...quoted, ...tokens])).sort((a, b) => b.length - a.length);
}

function highlightText(text, query, exact) {
  const raw = String(text || "");
  const terms = buildHighlightTerms(query, exact);
  if (!raw || !terms.length) return raw;

  const pattern = new RegExp(`(${terms.map((term) => escapeRegex(term)).join("|")})`, "gi");
  const parts = raw.split(pattern);
  const normalizedTerms = new Set(terms.map((term) => term.toLowerCase()));

  if (parts.length === 1) return raw;

  return parts.map((part, index) => (
    normalizedTerms.has(part.toLowerCase())
      ? (
        <mark key={`${part}-${index}`} style={{ background: "var(--gold-faint)", color: "var(--gold)", padding: "0 2px", borderRadius: 2 }}>
          {part}
        </mark>
      )
      : <span key={`${part}-${index}`}>{part}</span>
  ));
}

function Metadata({ match, showSemanticPath = true }) {
  const bits = [];
  if (showSemanticPath && match.semanticPath) bits.push(match.semanticPath);
  if (match.locationLabel && match.locationLabel !== match.semanticPath) bits.push(match.locationLabel);
  if (match.speaker) bits.push(match.speaker);
  if (match.displayLineNumber) {
    bits.push(
      match.displayEndLineNumber && match.displayEndLineNumber !== match.displayLineNumber
        ? `Lines ${match.displayLineNumber}-${match.displayEndLineNumber}`
        : `Line ${match.displayLineNumber}`
    );
  }
  return (
    <div style={{ fontSize: 11, color: "var(--text-light)", marginBottom: 6, fontFamily: "var(--font-display)", letterSpacing: 1.1, textTransform: "uppercase" }}>
      {bits.join(" · ")}
    </div>
  );
}

function semanticPathParts(match) {
  return String(match?.semanticPath || "")
    .split("›")
    .map((part) => part.trim())
    .filter(Boolean);
}

function groupSemanticMatches(matches) {
  const groups = new Map();
  (matches || []).forEach((match) => {
    const parts = semanticPathParts(match);
    const leaf = parts.length > 1 ? parts[parts.length - 1] : "";
    const branchParts = parts.length > 1 ? parts.slice(0, -1) : [];
    const branchLabel = branchParts.join(" › ") || match.locationLabel || "Best passages";
    const branchKey = branchLabel.toLowerCase();
    const existing = groups.get(branchKey);
    if (existing) {
      existing.matches.push({ ...match, semanticLeafLabel: leaf });
      existing.bestScore = Math.max(existing.bestScore, match.score || 0);
      return;
    }
    groups.set(branchKey, {
      key: branchKey,
      label: branchLabel,
      matches: [{ ...match, semanticLeafLabel: leaf }],
      bestScore: match.score || 0,
    });
  });

  return [...groups.values()]
    .sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      return a.label.localeCompare(b.label);
    });
}

function SearchMatchButton({ resultSlug, match, query, exact, nav, semantic = false }) {
  return (
    <button
      key={match.id}
      className="btn btn-ghost"
      onClick={() => nav(`/read/${match.resultSlug || resultSlug}${match.lineNumber ? `?line=${match.lineNumber}` : ""}`)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        background: "var(--bg-soft)",
        border: "1px solid var(--border-light)",
        borderRadius: 10,
      }}
    >
      {semantic && match.semanticLeafLabel && (
        <div style={{ fontSize: 11, color: "var(--gold)", marginBottom: 5, fontFamily: "var(--font-display)", letterSpacing: 1.1, textTransform: "uppercase" }}>
          {match.semanticLeafLabel}
        </div>
      )}
      <Metadata match={match} showSemanticPath={!semantic} />
      <ContextLine text={match.prevText} query={query} exact={exact} emphasized={false} />
      <ContextLine text={match.snippet || match.lineText} query={query} exact={exact} emphasized />
      <ContextLine text={match.nextText} query={query} exact={exact} emphasized={false} />
    </button>
  );
}

function ContextLine({ text, query, exact, emphasized }) {
  if (!text) return null;
  return (
    <div
      style={{
        color: emphasized ? "var(--text)" : "var(--text-muted)",
        opacity: emphasized ? 1 : 0.76,
        fontSize: emphasized ? 15 : 13,
        lineHeight: 1.6,
        paddingLeft: emphasized ? 0 : 12,
        borderLeft: emphasized ? "3px solid var(--accent)" : "1px solid var(--border-light)",
        marginBottom: 4,
      }}
    >
      {highlightText(text, query, exact)}
    </div>
  );
}

export default function SearchPage() {
  const nav = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user, authReady } = useAuth();

  const params = new URLSearchParams(location.search);
  const [query, setQuery] = useState(() => params.get("q") || "");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(() => params.get("mode") === "semantic" ? "semantic" : "text");
  const [scope, setScope] = useState(() => (params.get("work") ? "work" : "all"));
  const [workSlug, setWorkSlug] = useState(() => params.get("work") || "");
  const [category, setCategory] = useState(() => params.get("category") || "all");
  const [exact, setExact] = useState(() => params.get("exact") === "1");
  const [semanticMode, setSemanticMode] = useState(() => params.get("semanticMode") === "explore" ? "explore" : "tight");
  const [originWorkSlug, setOriginWorkSlug] = useState(() => params.get("originWork") || "");
  const [returnLine, setReturnLine] = useState(() => Math.max(0, parseInt(params.get("returnLine") || "0", 10) || 0));
  const [works, setWorks] = useState([]);
  const [semanticStatus, setSemanticStatus] = useState({ loaded: false, available: false, reason: "" });

  useEffect(() => {
    if (!authReady) return undefined;
    if (!user) {
      setSemanticStatus({ loaded: true, available: false, reason: "Semantic search requires sign-in." });
      return undefined;
    }

    let cancelled = false;
    setSemanticStatus((prev) => ({ ...prev, loaded: false }));
    api.semanticStatus()
      .then((status) => {
        if (cancelled) return;
        setSemanticStatus({
          loaded: true,
          available: !!status?.available,
          reason: String(status?.reason || ""),
        });
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setSemanticStatus({
          loaded: true,
          available: false,
          reason: e.message || "Semantic search is not available right now.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  useEffect(() => {
    api.list()
      .then((rows) => setWorks((rows || []).filter((row) => row.has_content)))
      .catch((e) => {
        console.error(e);
        toast?.error("Could not load the works list.");
      });
  }, [toast]);

  useEffect(() => {
    const nextParams = new URLSearchParams(location.search);
    const nextQuery = nextParams.get("q") || "";
    const nextWork = nextParams.get("work") || "";
    const nextCategory = nextParams.get("category") || "all";
    const nextExact = nextParams.get("exact") === "1";
    const nextSemanticMode = nextParams.get("semanticMode") === "explore" ? "explore" : "tight";
    const requestedMode = nextParams.get("mode") === "semantic" ? "semantic" : "text";
    const nextReturnLine = Math.max(0, parseInt(nextParams.get("returnLine") || "0", 10) || 0);
    const nextOrigin = nextParams.get("originWork") || ((nextReturnLine && nextWork) ? nextWork : "");
    const wantsSemantic = requestedMode === "semantic";
    if (wantsSemantic && !authReady) return undefined;
    if (wantsSemantic && user && !semanticStatus.loaded) return undefined;
    const nextMode = wantsSemantic && user && semanticStatus.available ? "semantic" : "text";

    setQuery(nextQuery);
    setMode(nextMode);
    setWorkSlug(nextWork);
    setCategory(nextCategory);
    setExact(nextExact);
    setSemanticMode(nextSemanticMode);
    setReturnLine(nextReturnLine);
    setOriginWorkSlug(nextOrigin);
    setScope(nextWork ? "work" : "all");

    if (nextQuery.trim().length < (nextMode === "semantic" ? 3 : 2)) {
      setResults(null);
      setLoading(false);
      setError("");
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const searchFn = nextMode === "semantic" ? api.searchSemantic : api.searchText;
      searchFn(nextQuery.trim(), {
        workSlug: nextWork,
        category: nextWork ? "all" : nextCategory,
        exact: nextMode === "text" ? nextExact : false,
        semanticMode: nextMode === "semantic" ? nextSemanticMode : "tight",
        limit: nextWork ? 18 : 24,
        perWork: nextWork ? 6 : 4,
      })
      .then((response) => {
        if (cancelled) return;
        setResults(response);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setResults(null);
        setError(e.message || "Search failed.");
        toast?.error(e.message || "Search failed. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, location.search, semanticStatus.available, semanticStatus.loaded, toast, user]);

  const semanticEnabled = !!user && semanticStatus.available;
  const activeMode = mode === "semantic" && semanticEnabled ? "semantic" : "text";

  const submitSearch = () => {
    const trimmed = query.trim();
    if (trimmed.length < (activeMode === "semantic" ? 3 : 2)) {
      setError(activeMode === "semantic" ? "Enter at least three characters for semantic search." : "Enter at least two characters.");
      return;
    }

    const nextParams = new URLSearchParams();
    nextParams.set("q", trimmed);
    if (activeMode === "semantic") {
      nextParams.set("mode", "semantic");
      if (semanticMode === "explore") nextParams.set("semanticMode", "explore");
    }

    if (scope === "work" && workSlug) nextParams.set("work", workSlug);
    if (scope === "all" && category !== "all") nextParams.set("category", category);
    if (activeMode === "text" && exact) nextParams.set("exact", "1");
    if (returnLine) nextParams.set("returnLine", String(returnLine));

    const origin = originWorkSlug || ((scope === "work" && workSlug && returnLine) ? workSlug : "");
    if (origin) nextParams.set("originWork", origin);

    nav(`/search?${nextParams.toString()}`);
  };

  const totalMatches = results?.totalMatches || 0;
  const showingMatches = results?.showingMatches || 0;
  const scopedDescription = activeMode === "semantic"
    ? (scope === "work" && workSlug
      ? "Find semantically similar passages within one work, ranked by embedding similarity rather than exact wording."
      : "Find semantically similar passages across the canon, grouped by work family and ordered by conceptual closeness.")
    : (scope === "work" && workSlug
      ? "Search within a single work, with ranked line matches and surrounding context."
      : "Search across the canon, grouped by work and ordered by the strongest matches first.");

  return (
    <div className="animate-in" style={{ maxWidth: 980, margin: "0 auto", padding: "48px 24px 72px" }}>
      <div style={{ maxWidth: 760, marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: 2, marginBottom: 6 }}>
          {activeMode === "semantic" ? "Semantic Passage Search" : "Text Search"}
        </h1>
        <p style={{ fontFamily: "var(--font-fell)", fontStyle: "italic", color: "var(--text-muted)", fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
          {scopedDescription}
        </p>

        {originWorkSlug && (
          <div style={{ marginBottom: 14 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => nav(`/read/${originWorkSlug}${returnLine ? `?line=${returnLine}` : ""}`)}
              style={{ color: "var(--text-light)", fontFamily: "var(--font-display)", letterSpacing: 1 }}
            >
              Back to Work
            </button>
          </div>
        )}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 14, padding: 18, marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button
            className={`btn btn-sm ${activeMode === "text" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMode("text")}
          >
            Text
          </button>
          {semanticEnabled && (
            <button
              className={`btn btn-sm ${activeMode === "semantic" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMode("semantic")}
            >
              Semantic
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button
            className={`btn btn-sm ${scope === "work" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setScope("work")}
          >
            One Work
          </button>
          <button
            className={`btn btn-sm ${scope === "all" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setScope("all")}
          >
            All Works
          </button>
        </div>

        {activeMode === "semantic" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <button
              className={`btn btn-sm ${semanticMode === "tight" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setSemanticMode("tight")}
            >
              Tighter
            </button>
            <button
              className={`btn btn-sm ${semanticMode === "explore" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setSemanticMode("explore")}
            >
              Exploratory
            </button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: scope === "work" ? "minmax(0, 2fr) minmax(240px, 1fr)" : "minmax(0, 1fr) minmax(220px, 0.8fr)", gap: 10, marginBottom: 10 }}>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSearch()}
            autoFocus
            placeholder={activeMode === "semantic"
              ? "Describe a passage, theme, or paste a remembered excerpt..."
              : (exact ? 'Search an exact phrase...' : 'Enter a word, phrase, or quoted phrase...')}
            style={{ width: "100%" }}
          />
          {scope === "work" ? (
            <select className="input" value={workSlug} onChange={(e) => setWorkSlug(e.target.value)}>
              <option value="">Choose a work...</option>
              {works.map((work) => (
                <option key={work.slug} value={work.slug}>{getWorkEditionOptionLabel(work)}</option>
              ))}
            </select>
          ) : (
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {activeMode === "text" ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-light)" }}>
              <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} />
              Exact phrase only
            </label>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-light)", lineHeight: 1.6 }}>
              Semantic search is approximate. <span style={{ color: "var(--accent)" }}>Tighter</span> favors inwardly similar passages; <span style={{ color: "var(--accent)" }}>Exploratory</span> casts a wider net.
            </div>
          )}
          <button className="btn btn-primary" onClick={submitSearch} disabled={loading || (scope === "work" && !workSlug)}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-light)", lineHeight: 1.6 }}>
          {activeMode === "semantic"
            ? <>Tip: try a remembered line, a prose description like <span style={{ color: "var(--accent)" }}>Tarquin arguing with himself before the rape</span>, or a thematic phrase such as <span style={{ color: "var(--accent)" }}>honor and shame after violence</span>.</>
            : <>Tip: use quotation marks for a phrase such as <span style={{ color: "var(--accent)" }}>"to be or not to be"</span>.</>}
        </div>
      </div>

      {results && (
        <div style={{ fontSize: 14, color: "var(--text-light)", marginBottom: 16 }}>
          {activeMode === "semantic" && results.available === false ? (
            <>{results.reason || "Semantic search is not available on this server yet."}</>
          ) : totalMatches > 0 ? (
            <>
              {activeMode === "semantic"
                ? <>Found semantic matches across {results.totalWorks} work famil{results.totalWorks === 1 ? "y" : "ies"} in {results.tookMs}ms. Showing the top {showingMatches}.</>
                : <>Found {totalMatches} match{totalMatches === 1 ? "" : "es"} across {results.totalWorks} work{results.totalWorks === 1 ? "" : "s"} in {results.tookMs}ms.
                  {totalMatches > showingMatches ? ` Showing the top ${showingMatches}.` : ""}</>}
            </>
          ) : (
            <>No matches for "{query}".</>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--danger)", borderRadius: 10, padding: "14px 16px", marginBottom: 18 }}>
          <div style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</div>
          <button className="btn btn-secondary btn-sm" onClick={submitSearch}>Try Again</button>
        </div>
      )}

      {results?.results?.length > 0 && (
        <div style={{ display: "grid", gap: 14 }}>
          {results.results.map((result) => (
            <section key={result.slug} style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 14, padding: "18px 20px" }}>
              {(() => {
                const semanticGroups = activeMode === "semantic" ? groupSemanticMatches(result.matches) : [];
                return (
                  <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <button
                    className="btn btn-ghost"
                    onClick={() => nav(`/read/${result.slug}${result.matches[0]?.lineNumber ? `?line=${result.matches[0].lineNumber}` : ""}`)}
                    style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, color: "var(--accent)", padding: 0, marginBottom: 4 }}
                  >
                    {result.title}
                  </button>
                  <div style={{ fontSize: 12, color: "var(--text-light)", textTransform: "capitalize" }}>
                    {result.category.replace("_", " ")} · {variantLabel(result.variant)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-light)", fontFamily: "var(--font-display)", letterSpacing: 1 }}>
                  {activeMode === "semantic"
                    ? `${semanticGroups.length} branch${semanticGroups.length === 1 ? "" : "es"}`
                    : `${result.matchCount} total match${result.matchCount === 1 ? "" : "es"}`}
                </div>
              </div>

              {activeMode === "semantic" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {semanticGroups.map((group, groupIndex) => (
                    <details
                      key={group.key}
                      open={groupIndex === 0}
                      style={{
                        background: "var(--bg-soft)",
                        border: "1px solid var(--border-light)",
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <summary style={{ cursor: "pointer", listStyle: "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--gold)", marginBottom: 2, fontFamily: "var(--font-display)", letterSpacing: 1.2, textTransform: "uppercase" }}>
                              Matching Branch
                            </div>
                            <div style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.45 }}>
                              {group.label}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-light)", fontFamily: "var(--font-display)", letterSpacing: 1 }}>
                            {group.matches.length} passage{group.matches.length === 1 ? "" : "s"}
                          </div>
                        </div>
                      </summary>
                      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                        {group.matches.map((match) => (
                          <SearchMatchButton
                            key={match.id}
                            resultSlug={result.slug}
                            match={match}
                            query={query}
                            exact={exact}
                            nav={nav}
                            semantic
                          />
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {result.matches.map((match) => (
                    <SearchMatchButton
                      key={match.id}
                      resultSlug={result.slug}
                      match={match}
                      query={query}
                      exact={exact}
                      nav={nav}
                    />
                  ))}
                </div>
              )}
                  </>
                );
              })()}
            </section>
          ))}
        </div>
      )}

      {results && !results.results?.length && !error && !(activeMode === "semantic" && results.available === false) && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 12, padding: "18px 20px", color: "var(--text-muted)", lineHeight: 1.7 }}>
          {activeMode === "semantic"
            ? "Try a fuller phrase, a remembered excerpt, or a more conceptually specific description."
            : "Try fewer words, turn off exact phrase search, or narrow to a single work if you are looking for a remembered passage."}
        </div>
      )}

      <div className="tudor-rule" />
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 12 }}>Reader's Tools</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <a href="https://www.opensourceshakespeare.org/concordance/" target="_blank" rel="noopener"
          style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 8, padding: 16, textDecoration: "none" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--accent)", marginBottom: 4 }}>Shakespeare Concordance</div>
          <div style={{ fontSize: 13, color: "var(--text-light)" }}>Look up every occurrence of any word across the canon.</div>
        </a>
        <a href="https://www.shakespeareswords.com/" target="_blank" rel="noopener"
          style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 8, padding: 16, textDecoration: "none" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--accent)", marginBottom: 4 }}>Shakespeare's Words</div>
          <div style={{ fontSize: 13, color: "var(--text-light)" }}>Glossary and language companion by David Crystal.</div>
        </a>
        <a href="https://www.folger.edu/explore/shakespeares-works/" target="_blank" rel="noopener"
          style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 8, padding: 16, textDecoration: "none" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--accent)", marginBottom: 4 }}>Folger Shakespeare Library</div>
          <div style={{ fontSize: 13, color: "var(--text-light)" }}>Scholarly editions with notes and performance history.</div>
        </a>
        <a href="https://www.lexically.net/wordsmith/support/shakespeare.html" target="_blank" rel="noopener"
          style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 8, padding: 16, textDecoration: "none" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--accent)", marginBottom: 4 }}>Words Shakespeare Invented</div>
          <div style={{ fontSize: 13, color: "var(--text-light)" }}>Catalogue of coinages and first attestations.</div>
        </a>
      </div>
    </div>
  );
}
