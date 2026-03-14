import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { works as worksApi, progress as progressApi } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import {
  YEAR_OF_SHAKESPEARE_ROWS,
  longDateLabel,
  monthLabel,
  normalizeTitleKey,
  resolveWorkLinks,
  toMonthKey,
} from "../lib/yearOfShakespeare";

export default function YearOfShakespearePage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [arcFilter, setArcFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [workLookup, setWorkLookup] = useState({});
  const [progressBySlug, setProgressBySlug] = useState({});

  const rows = YEAR_OF_SHAKESPEARE_ROWS;

  useEffect(() => {
    let cancelled = false;
    worksApi.list()
      .then((allWorks) => {
        if (cancelled) return;
        const map = Object.create(null);
        (allWorks || []).forEach((w) => {
          if (!w?.title || !w?.slug) return;
          const key = normalizeTitleKey(w.title);
          if (!key) return;
          if (!map[key]) map[key] = { modernSlug: "", firstFolioSlug: "", anySlug: "" };
          const entry = map[key];
          if (!entry.anySlug) entry.anySlug = w.slug;
          if (w.variant === "first-folio") {
            if (!entry.firstFolioSlug) entry.firstFolioSlug = w.slug;
          } else if (w.variant === "ps") {
            entry.modernSlug = w.slug;
          } else if (!entry.modernSlug) {
            entry.modernSlug = w.slug;
          }
        });
        setWorkLookup(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setProgressBySlug({});
      return () => { cancelled = true; };
    }
    progressApi.myAll()
      .then((rows) => {
        if (cancelled) return;
        const map = Object.create(null);
        (rows || []).forEach((row) => {
          if (!row?.slug) return;
          const line = Math.max(1, parseInt(row.max_line_reached, 10) || 1);
          map[row.slug] = line;
        });
        setProgressBySlug(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const kindOptions = useMemo(
    () => [...new Set(rows.map(r => r.kind).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const arcOptions = useMemo(
    () => [...new Set(rows.map(r => r.seasonalArc).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const monthOptions = useMemo(
    () => [...new Set(rows.map(r => toMonthKey(r.dateObj)))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (arcFilter !== "all" && r.seasonalArc !== arcFilter) return false;
      if (monthFilter !== "all" && toMonthKey(r.dateObj) !== monthFilter) return false;
      if (!q) return true;
      return [r.works, r.kind, r.seasonalArc, r.anchor, r.reason].join(" ").toLowerCase().includes(q);
    });
  }, [rows, query, kindFilter, arcFilter, monthFilter]);

  const todayIso = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const byMonth = useMemo(() => {
    return filtered.reduce((acc, row) => {
      const month = toMonthKey(row.dateObj);
      if (!acc[month]) acc[month] = [];
      acc[month].push(row);
      return acc;
    }, {});
  }, [filtered]);

  const uniqueWorks = useMemo(() => new Set(rows.map(r => r.works).filter(Boolean)).size, [rows]);

  const openWithResume = (slug) => {
    if (!slug) return;
    const line = parseInt(progressBySlug[slug], 10) || 0;
    nav(`/read/${slug}${line > 1 ? `?line=${line}` : ""}`);
  };

  return (
    <div className="animate-in year-page" style={{ maxWidth: 1160, margin: "0 auto", padding: "40px 24px 56px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
          Reading Program
        </div>
        <h1 className="year-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 34, color: "var(--accent)", letterSpacing: 1 }}>
          Year of Shakespeare (2026-2027)
        </h1>
        <p style={{ marginTop: 12, marginBottom: 0, color: "var(--text-muted)", lineHeight: 1.75, maxWidth: 860 }}>
          A daily reading calendar mapped to seasonal arcs, anchor moments, and thematic progression across plays and poems.
        </p>
      </div>

      <div className="year-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 18 }}>
        <div style={{ border: "1px solid var(--border-light)", borderRadius: 10, background: "var(--surface)", padding: "10px 12px" }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-light)" }}>Days</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{rows.length}</div>
        </div>
        <div style={{ border: "1px solid var(--border-light)", borderRadius: 10, background: "var(--surface)", padding: "10px 12px" }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-light)" }}>Unique Works</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{uniqueWorks}</div>
        </div>
        <div style={{ border: "1px solid var(--border-light)", borderRadius: 10, background: "var(--surface)", padding: "10px 12px" }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-light)" }}>Range</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
            {rows[0] ? longDateLabel(rows[0].dateObj) : "—"} to {rows[rows.length - 1] ? longDateLabel(rows[rows.length - 1].dateObj) : "—"}
          </div>
        </div>
      </div>

      <div className="year-filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <input
          className="input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search work, anchor, or reason…"
          style={{ minWidth: 250 }}
        />
        <select className="input" value={kindFilter} onChange={e => setKindFilter(e.target.value)} style={{ minWidth: 170 }}>
          <option value="all">All Kinds</option>
          {kindOptions.map(kind => <option key={kind} value={kind}>{kind}</option>)}
        </select>
        <select className="input" value={arcFilter} onChange={e => setArcFilter(e.target.value)} style={{ minWidth: 200 }}>
          <option value="all">All Seasonal Arcs</option>
          {arcOptions.map(arc => <option key={arc} value={arc}>{arc}</option>)}
        </select>
        <select className="input" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ minWidth: 190 }}>
          <option value="all">All Months</option>
          {monthOptions.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={() => {
          setQuery("");
          setKindFilter("all");
          setArcFilter("all");
          setMonthFilter("all");
        }}>
          Reset
        </button>
      </div>

      <div style={{ marginBottom: 14, color: "var(--text-light)", fontSize: 13 }}>
        Showing {filtered.length} of {rows.length} days.
      </div>

      {Object.keys(byMonth).length === 0 ? (
        <div style={{ border: "1px solid var(--border-light)", borderRadius: 12, padding: 18, background: "var(--surface)", color: "var(--text-light)" }}>
          No calendar rows match your filters.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {Object.entries(byMonth).map(([month, monthRows]) => (
            <section key={month} style={{ border: "1px solid var(--border-light)", borderRadius: 14, overflow: "hidden", background: "var(--surface)" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-light)", background: "rgba(201,168,76,0.08)" }}>
                <strong style={{ fontFamily: "var(--font-display)", letterSpacing: 1, color: "var(--accent)" }}>{monthLabel(month)}</strong>
                <span style={{ marginLeft: 8, color: "var(--text-light)", fontSize: 12 }}>{monthRows.length} day{monthRows.length === 1 ? "" : "s"}</span>
              </div>
              <div style={{ display: "grid", gap: 0 }}>
                {monthRows.map((row) => {
                  const actions = resolveWorkLinks(row.works, row.kind, workLookup)
                    .filter((action, idx, arr) => action?.slug && arr.findIndex(a => a.slug === action.slug) === idx);
                  const isToday = row.date === todayIso;
                  return (
                    <div key={row.id} className="year-row" style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--border-light)",
                      background: isToday ? "rgba(122,30,46,0.08)" : "transparent",
                    }}>
                      <div className="year-row-header" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <div className="year-row-date" style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "var(--font-display)", color: "var(--accent)", fontWeight: 700 }}>
                            {longDateLabel(row.dateObj)}
                          </span>
                          {isToday && (
                            <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--danger)" }}>
                              Today
                            </span>
                          )}
                        </div>
                        <div className="year-row-pills" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {row.kind && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border-light)", color: "var(--text-light)" }}>{row.kind}</span>}
                          {row.seasonalArc && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border-light)", color: "var(--text-light)" }}>{row.seasonalArc}</span>}
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
                        {row.works}
                      </div>
                      {row.anchor && (
                        <div style={{ color: "var(--gold)", fontSize: 13, marginBottom: 4 }}>
                          Anchor: {row.anchor}
                        </div>
                      )}
                      {row.reason && (
                        <div style={{ color: "var(--text-muted)", lineHeight: 1.65, marginBottom: actions.length ? 8 : 0 }}>
                          {row.reason}
                        </div>
                      )}
                      {actions.length > 0 && (
                        <div className="year-row-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {actions.map((action) => {
                            const resumeLine = parseInt(progressBySlug[action.slug], 10) || 0;
                            return (
                              <button key={`${row.id}-${action.slug}`} className="btn btn-ghost btn-sm" onClick={() => openWithResume(action.slug)}>
                                {action.label}{resumeLine > 1 ? " (Resume)" : ""}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
