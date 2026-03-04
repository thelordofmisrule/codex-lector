import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { places as placesApi, works as worksApi } from "../lib/api";

const MAP_BOUNDS = {
  west: -12,
  east: 42,
  north: 62,
  south: 24,
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function markerLeft(lng) {
  const pct = ((lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * 100;
  return `${clamp(pct, 2.5, 97.5)}%`;
}

function markerTop(lat) {
  const pct = ((MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * 100;
  return `${clamp(pct, 3, 97)}%`;
}

function prettyCategory(cat) {
  return String(cat || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function AtlasBackground() {
  return (
    <svg
      viewBox="0 0 1000 640"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <defs>
        <linearGradient id="seaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(243,237,224,0.95)" />
          <stop offset="100%" stopColor="rgba(232,223,203,0.96)" />
        </linearGradient>
        <linearGradient id="landFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(195,180,141,0.82)" />
          <stop offset="100%" stopColor="rgba(177,155,110,0.92)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1000" height="640" fill="url(#seaFill)" />

      {[166, 332, 498, 664, 830].map(x => (
        <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="640" stroke="rgba(122,30,46,0.06)" strokeWidth="1" />
      ))}
      {[128, 256, 384, 512].map(y => (
        <line key={`h-${y}`} x1="0" y1={y} x2="1000" y2={y} stroke="rgba(122,30,46,0.06)" strokeWidth="1" />
      ))}

      <path
        d="M108 116 L154 98 L182 112 L198 148 L190 186 L168 224 L150 258 L146 296 L128 312 L112 292 L108 248 L96 208 L96 164 Z"
        fill="url(#landFill)"
        stroke="rgba(122,30,46,0.22)"
        strokeWidth="2"
      />
      <path
        d="M204 146 L238 122 L298 112 L362 118 L402 132 L438 158 L470 188 L500 220 L524 252 L542 288 L566 314 L602 336 L642 340 L680 326 L702 298 L712 270 L730 258 L758 266 L782 294 L792 336 L780 380 L752 404 L720 410 L694 430 L656 432 L630 414 L610 388 L578 370 L552 348 L522 322 L498 294 L482 264 L456 238 L426 212 L398 190 L372 170 L338 154 L294 150 L252 162 L220 176 Z"
        fill="url(#landFill)"
        stroke="rgba(122,30,46,0.22)"
        strokeWidth="2"
      />
      <path
        d="M520 258 L548 246 L580 248 L608 262 L624 288 L612 314 L588 326 L560 316 L540 294 Z"
        fill="rgba(233,225,205,0.95)"
        stroke="rgba(122,30,46,0.16)"
        strokeWidth="1.5"
      />
      <path
        d="M602 326 L626 346 L642 378 L636 418 L620 450 L602 486 L592 524 L570 544 L558 520 L560 484 L568 448 L582 418 L590 388 L590 356 Z"
        fill="url(#landFill)"
        stroke="rgba(122,30,46,0.22)"
        strokeWidth="2"
      />
      <path
        d="M648 442 L678 462 L694 488 L684 514 L662 526 L638 516 L630 492 L636 464 Z"
        fill="url(#landFill)"
        stroke="rgba(122,30,46,0.22)"
        strokeWidth="2"
      />
      <path
        d="M454 426 L494 412 L560 414 L626 422 L702 424 L784 434 L850 452 L894 478 L902 514 L876 540 L812 548 L736 544 L654 550 L566 556 L486 550 L432 532 L406 502 L410 466 Z"
        fill="url(#landFill)"
        stroke="rgba(122,30,46,0.22)"
        strokeWidth="2"
      />
      <path
        d="M798 274 L852 260 L904 266 L936 288 L946 320 L934 352 L900 370 L852 362 L818 342 L798 312 Z"
        fill="url(#landFill)"
        stroke="rgba(122,30,46,0.22)"
        strokeWidth="2"
      />

      <text x="124" y="90" fill="rgba(122,30,46,0.44)" fontSize="20" style={{ letterSpacing: "3px", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
        Britain
      </text>
      <text x="286" y="96" fill="rgba(122,30,46,0.38)" fontSize="18" style={{ letterSpacing: "3px", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
        France
      </text>
      <text x="548" y="216" fill="rgba(122,30,46,0.38)" fontSize="17" style={{ letterSpacing: "3px", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
        Italy
      </text>
      <text x="650" y="248" fill="rgba(122,30,46,0.32)" fontSize="16" style={{ letterSpacing: "3px", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
        Balkans
      </text>
      <text x="664" y="592" fill="rgba(122,30,46,0.28)" fontSize="15" style={{ letterSpacing: "3px", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
        North Africa
      </text>
      <text x="824" y="246" fill="rgba(122,30,46,0.3)" fontSize="15" style={{ letterSpacing: "3px", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
        Anatolia
      </text>
    </svg>
  );
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
              minHeight: 540,
              borderRadius: 14,
              border: "1px solid var(--border-light)",
              overflow: "hidden",
              background: "linear-gradient(180deg, rgba(247,243,232,0.98), rgba(239,231,212,0.98))",
            }}>
              <AtlasBackground />
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
                      zIndex: isSelected ? 4 : 3,
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
                  {selectedPlace.imageUrl && (
                    <img
                      src={selectedPlace.imageUrl}
                      alt={selectedPlace.name}
                      style={{
                        width: "100%",
                        maxHeight: 220,
                        objectFit: "cover",
                        borderRadius: 12,
                        border: "1px solid var(--border-light)",
                        marginBottom: 12,
                        background: "var(--paper)",
                      }}
                    />
                  )}
                  <p style={{ margin: 0, lineHeight: 1.75, color: "var(--text-muted)" }}>
                    {selectedPlace.description}
                  </p>
                  {selectedPlace.historicalNote && (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.16)" }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
                        Shakespeare's Horizon
                      </div>
                      <div style={{ lineHeight: 1.7, color: "var(--text-muted)", fontSize: 14 }}>
                        {selectedPlace.historicalNote}
                      </div>
                    </div>
                  )}
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
