import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { works as worksApi } from "../lib/api";
import calendarCsv from "../data/year_of_shakespeare_2026_2027_daily.csv?raw";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(value);
      value = "";
      continue;
    }
    if (ch === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    if (ch === "\r") continue;
    value += ch;
  }

  row.push(value);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function parseCalendarRows(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];

  const headers = rows[0].map(h => String(h || "").trim().toLowerCase());
  const idx = (name) => headers.indexOf(name.toLowerCase());
  const dateIdx = idx("date");
  const worksIdx = idx("work(s)");
  const kindIdx = idx("kind");
  const arcIdx = idx("seasonal arc");
  const anchorIdx = idx("anchor");
  const reasonIdx = idx("reason");

  return rows.slice(1).map((r, i) => {
    const isoDate = String(r[dateIdx] || "").trim();
    if (!isoDate) return null;
    const dateObj = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(dateObj.getTime())) return null;
    return {
      id: `${isoDate}-${i}`,
      date: isoDate,
      dateObj,
      works: String(r[worksIdx] || "").trim(),
      kind: String(r[kindIdx] || "").trim(),
      seasonalArc: String(r[arcIdx] || "").trim(),
      anchor: String(r[anchorIdx] || "").trim(),
      reason: String(r[reasonIdx] || "").trim(),
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

function toMonthKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function longDateLabel(dateObj) {
  return dateObj.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function YearOfShakespearePage() {
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [arcFilter, setArcFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [titleToSlug, setTitleToSlug] = useState({});

  const rows = useMemo(() => parseCalendarRows(calendarCsv), []);

  useEffect(() => {
    let cancelled = false;
    worksApi.list()
      .then((allWorks) => {
        if (cancelled) return;
        const map = {};
        (allWorks || []).forEach((w) => {
          if (w?.title && w?.slug) map[String(w.title).toLowerCase()] = w.slug;
        });
        setTitleToSlug(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  return (
    <div className="animate-in" style={{ maxWidth: 1160, margin: "0 auto", padding: "40px 24px 56px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
          Reading Program
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Cinzel Decorative',var(--font-display)", fontSize: 34, color: "var(--accent)", letterSpacing: 1 }}>
          Year of Shakespeare (2026-2027)
        </h1>
        <p style={{ marginTop: 12, marginBottom: 0, color: "var(--text-muted)", lineHeight: 1.75, maxWidth: 860 }}>
          A daily reading calendar mapped to seasonal arcs, anchor moments, and thematic progression across plays and poems.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 18 }}>
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
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
                  const workSlug = titleToSlug[row.works.toLowerCase()] || "";
                  const isToday = row.date === todayIso;
                  return (
                    <div key={row.id} style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--border-light)",
                      background: isToday ? "rgba(122,30,46,0.08)" : "transparent",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "var(--font-display)", color: "var(--accent)", fontWeight: 700 }}>
                            {longDateLabel(row.dateObj)}
                          </span>
                          {isToday && (
                            <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--danger)" }}>
                              Today
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                        <div style={{ color: "var(--text-muted)", lineHeight: 1.65, marginBottom: workSlug ? 8 : 0 }}>
                          {row.reason}
                        </div>
                      )}
                      {workSlug && (
                        <button className="btn btn-ghost btn-sm" onClick={() => nav(`/read/${workSlug}`)}>
                          Open Work
                        </button>
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
