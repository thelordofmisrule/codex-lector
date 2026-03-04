import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { places as placesApi, works as worksApi } from "../lib/api";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function markerLeft(lng) {
  return `${clamp(((lng + 180) / 360) * 100, 3, 97)}%`;
}

function markerTop(lat) {
  return `${clamp(((90 - lat) / 180) * 100, 6, 94)}%`;
}

function prettyCategory(cat) {
  return String(cat || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function PlacesPage() {
  const nav = useNavigate();
  const [works, setWorks] = useState([]);
  const [places, setPlaces] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [citations, setCitations] = useState([]);
  const [workFilter, setWorkFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      worksApi.list(),
      placesApi.list(workFilter),
    ]).then(([worksData, placesData]) => {
      if (cancelled) return;
      setWorks((worksData || []).filter(w => w.has_content));
      const nextPlaces = placesData.places || [];
      setPlaces(nextPlaces);
      setSelectedSlug(prev => {
        if (prev && nextPlaces.some(p => p.slug === prev)) return prev;
        return nextPlaces[0]?.slug || "";
      });
    }).catch(e => {
      if (cancelled) return;
      setError(e.message || "Could not load place geography.");
      setPlaces([]);
      setSelectedSlug("");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [workFilter]);

  useEffect(() => {
    if (!selectedSlug) {
      setSelectedPlace(null);
      setCitations([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    placesApi.get(selectedSlug, workFilter).then(data => {
      if (cancelled) return;
      setError("");
      setSelectedPlace(data.place);
      setCitations(data.citations || []);
    }).catch(e => {
      if (cancelled) return;
      setError(e.message || "Could not load place details.");
      setSelectedPlace(null);
      setCitations([]);
    }).finally(() => {
      if (!cancelled) setDetailLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedSlug, workFilter]);

  const visiblePlaces = useMemo(() => (
    typeFilter === "all" ? places : places.filter(place => place.placeType === typeFilter)
  ), [places, typeFilter]);

  useEffect(() => {
    if (!visiblePlaces.length) {
      setSelectedSlug("");
      return;
    }
    if (!visiblePlaces.some(place => place.slug === selectedSlug)) {
      setSelectedSlug(visiblePlaces[0].slug);
    }
  }, [visiblePlaces, selectedSlug]);

  const typeOptions = useMemo(() => {
    const types = [...new Set(places.map(place => place.placeType))];
    return types.sort();
  }, [places]);

  const selectedWork = works.find(work => work.slug === workFilter);

  return (
    <div className="animate-in" style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px 56px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontFamily: "var(--font-display)", color: "var(--gold)", letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>
          Shakespearean Geography
        </div>
        <h1 style={{ fontFamily: "'Cinzel Decorative',var(--font-display)", fontSize: 36, fontWeight: 400, color: "var(--accent)", letterSpacing: 2, marginBottom: 12 }}>
          Places in the Works
        </h1>
        <p style={{ maxWidth: 760, lineHeight: 1.8, color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0 }}>
          Explore a curated atlas of real places named in Shakespeare. This map is grounded in the actual imported text:
          each marker opens line-level citations, and each citation can send you straight back into the work.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <select className="input" value={workFilter} onChange={e => setWorkFilter(e.target.value)} style={{ minWidth: 240 }}>
          <option value="">All Works</option>
          {[...works].sort((a, b) => a.title.localeCompare(b.title)).map(work => (
            <option key={work.slug} value={work.slug}>{work.title}</option>
          ))}
        </select>
        <select className="input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ minWidth: 180 }}>
          <option value="all">All Place Types</option>
          {typeOptions.map(type => (
            <option key={type} value={type}>{prettyCategory(type)}</option>
          ))}
        </select>
        <button className="btn btn-secondary" onClick={() => nav("/search")} style={{ whiteSpace: "nowrap" }}>
          Search Texts
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 18, padding: "12px 14px", border: "1px solid rgba(139,31,31,0.25)", background: "rgba(139,31,31,0.08)", borderRadius: 10, color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 18, background: "linear-gradient(180deg, rgba(201,168,76,0.08), rgba(122,30,46,0.05))", padding: 16, boxShadow: "0 12px 30px rgba(0,0,0,0.06)" }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "var(--accent)" }}>Atlas View</div>
                <div style={{ fontSize: 13, color: "var(--text-light)" }}>
                  {selectedWork ? `Filtered to ${selectedWork.title}` : "All imported works with real-place matches"}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-light)" }}>
                {visiblePlaces.length} places
              </div>
            </div>
            <div style={{
              position: "relative",
              minHeight: 500,
              borderRadius: 14,
              border: "1px solid var(--border-light)",
              overflow: "hidden",
              background: [
                "radial-gradient(circle at 26% 38%, rgba(201,168,76,0.18), transparent 18%)",
                "radial-gradient(circle at 54% 44%, rgba(122,30,46,0.14), transparent 22%)",
                "radial-gradient(circle at 68% 62%, rgba(201,168,76,0.12), transparent 20%)",
                "repeating-linear-gradient(to right, rgba(122,30,46,0.06) 0, rgba(122,30,46,0.06) 1px, transparent 1px, transparent 12.5%)",
                "repeating-linear-gradient(to bottom, rgba(122,30,46,0.05) 0, rgba(122,30,46,0.05) 1px, transparent 1px, transparent 16.6%)",
                "linear-gradient(180deg, rgba(247,243,232,0.95), rgba(239,231,212,0.95))",
              ].join(","),
            }}>
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", color: "rgba(122,30,46,0.32)", fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>
                <span style={{ position: "absolute", top: "10%", left: "18%" }}>Britain</span>
                <span style={{ position: "absolute", top: "24%", left: "38%" }}>Western Europe</span>
                <span style={{ position: "absolute", top: "38%", left: "52%" }}>Italy</span>
                <span style={{ position: "absolute", top: "55%", left: "62%" }}>Mediterranean</span>
                <span style={{ position: "absolute", top: "68%", left: "71%" }}>Levant</span>
              </div>
              {visiblePlaces.map(place => {
                const isSelected = place.slug === selectedSlug;
                return (
                  <button
                    key={place.slug}
                    className="btn"
                    onClick={() => setSelectedSlug(place.slug)}
                    title={`${place.name} · ${place.workCount} works`}
                    style={{
                      position: "absolute",
                      left: markerLeft(place.lng),
                      top: markerTop(place.lat),
                      transform: "translate(-50%, -50%)",
                      width: isSelected ? 18 : 14,
                      height: isSelected ? 18 : 14,
                      minWidth: 0,
                      minHeight: 0,
                      borderRadius: "50%",
                      padding: 0,
                      border: isSelected ? "2px solid var(--accent)" : "1px solid rgba(122,30,46,0.35)",
                      background: isSelected ? "var(--accent)" : "rgba(201,168,76,0.85)",
                      boxShadow: isSelected ? "0 0 0 5px rgba(122,30,46,0.12)" : "0 2px 8px rgba(0,0,0,0.15)",
                      cursor: "pointer",
                    }}
                  />
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {visiblePlaces.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-light)" }}>
                  No matching places for this filter.
                </div>
              ) : visiblePlaces.map(place => (
                <button
                  key={place.slug}
                  className={place.slug === selectedSlug ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                  onClick={() => setSelectedSlug(place.slug)}
                  style={{ fontSize: 12 }}
                >
                  {place.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 18, background: "var(--surface)", padding: 18 }}>
            {!selectedPlace ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-light)" }}>
                Select a place to inspect its textual footprint.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
                    <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 24, color: "var(--accent)" }}>
                      {selectedPlace.name}
                    </h2>
                    <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, color: "var(--gold)" }}>
                      {prettyCategory(selectedPlace.placeType)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-light)", marginBottom: 10 }}>
                    {selectedPlace.modernCountry}{selectedPlace.modernName && selectedPlace.modernName !== selectedPlace.name ? ` · Modern name: ${selectedPlace.modernName}` : ""}
                  </div>
                  <p style={{ margin: 0, lineHeight: 1.75, color: "var(--text-muted)" }}>
                    {selectedPlace.description}
                  </p>
                </div>

                <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)" }}>
                      Textual Citations
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                      {detailLoading ? "Loading..." : `${citations.length} matches`}
                    </div>
                  </div>
                  {detailLoading ? (
                    <div style={{ padding: 20, textAlign: "center" }}><div className="spinner" /></div>
                  ) : citations.length === 0 ? (
                    <div style={{ padding: "10px 0", color: "var(--text-light)" }}>
                      No direct line matches surfaced for this filter.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {citations.map((citation, idx) => (
                        <button
                          key={`${citation.workSlug}-${citation.lineNumber}-${idx}`}
                          className="btn"
                          onClick={() => nav(`/read/${citation.workSlug}?line=${citation.lineNumber}`)}
                          style={{
                            display: "block",
                            textAlign: "left",
                            border: "1px solid var(--border-light)",
                            borderRadius: 12,
                            padding: "12px 14px",
                            background: "rgba(201,168,76,0.06)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, color: "var(--text)" }}>{citation.workTitle}</span>
                            <span style={{ fontSize: 12, color: "var(--text-light)" }}>
                              Line {citation.lineNumber} · {prettyCategory(citation.workCategory)}
                            </span>
                          </div>
                          <div style={{ color: "var(--text-muted)", lineHeight: 1.65 }}>
                            {citation.lineText}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
