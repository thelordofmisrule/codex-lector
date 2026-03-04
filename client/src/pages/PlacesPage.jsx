import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { places as placesApi, works as worksApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";

const LEAFLET_CSS_ID = "codex-leaflet-css";
const LEAFLET_SCRIPT_ID = "codex-leaflet-js";
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_SCRIPT_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const INITIAL_CENTER = [45.2, 12.0];
const INITIAL_ZOOM = 4;

let leafletPromise = null;

function prettyCategory(cat) {
  return String(cat || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function ensureLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only."));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById(LEAFLET_CSS_ID)) {
      const link = document.createElement("link");
      link.id = LEAFLET_CSS_ID;
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS_URL;
      document.head.appendChild(link);
    }

    const existing = document.getElementById(LEAFLET_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => window.L ? resolve(window.L) : reject(new Error("Leaflet failed to initialize.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load map library.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = LEAFLET_SCRIPT_URL;
    script.async = true;
    script.onload = () => window.L ? resolve(window.L) : reject(new Error("Leaflet failed to initialize."));
    script.onerror = () => reject(new Error("Could not load map library."));
    document.body.appendChild(script);
  });

  return leafletPromise;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export default function PlacesPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef({});

  const [works, setWorks] = useState([]);
  const [places, setPlaces] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [citations, setCitations] = useState([]);
  const [workFilter, setWorkFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [editor, setEditor] = useState({ description: "", historicalNote: "", imageUrl: "" });

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

  useEffect(() => {
    setEditor({
      description: selectedPlace?.description || "",
      historicalNote: selectedPlace?.historicalNote || "",
      imageUrl: selectedPlace?.imageUrl || "",
    });
  }, [selectedPlace]);

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

  useEffect(() => {
    let cancelled = false;
    ensureLeaflet().then(L => {
      if (cancelled || mapRef.current || !mapNodeRef.current) return;
      const map = L.map(mapNodeRef.current, {
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        minZoom: 3,
        maxZoom: 10,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapLoading(false);
      setMapError("");
      setTimeout(() => map.invalidateSize(), 80);
    }).catch(e => {
      if (cancelled) return;
      setMapLoading(false);
      setMapError(e.message || "Could not load the map.");
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L || !layerRef.current) return;

    layerRef.current.clearLayers();
    markersRef.current = {};

    if (!visiblePlaces.length) {
      map.setView(INITIAL_CENTER, INITIAL_ZOOM);
      return;
    }

    const bounds = [];
    visiblePlaces.forEach(place => {
      const marker = L.circleMarker([place.lat, place.lng], {
        radius: place.slug === selectedSlug ? 9 : 7,
        color: "rgba(122,30,46,0.9)",
        weight: place.slug === selectedSlug ? 3 : 2,
        fillColor: place.slug === selectedSlug ? "#7A1E2E" : "#C9A84C",
        fillOpacity: 0.85,
      });
      marker.on("click", () => setSelectedSlug(place.slug));
      marker.bindTooltip(place.name, {
        direction: "top",
        offset: [0, -6],
      });
      marker.addTo(layerRef.current);
      markersRef.current[place.slug] = marker;
      bounds.push([place.lat, place.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 6);
    } else {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 6 });
    }
  }, [visiblePlaces, selectedSlug]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markersRef.current[selectedSlug];
    if (!map || !marker) return;
    const latLng = marker.getLatLng();
    map.flyTo(latLng, Math.max(map.getZoom(), 5), { duration: 0.4 });
    marker.openTooltip();
  }, [selectedSlug]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  const selectedWork = works.find(work => work.slug === workFilter);

  const uploadPlaceImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploaded = await placesApi.uploadImage(file.name, file.type, dataUrl);
      setEditor(prev => ({ ...prev, imageUrl: uploaded.url || "" }));
      toast?.success("Place image uploaded.");
    } catch (e) {
      toast?.error(e.message || "Could not upload place image.");
    } finally {
      setUploading(false);
    }
  };

  const savePlace = async () => {
    if (!selectedPlace) return;
    setSaving(true);
    try {
      const data = await placesApi.update(selectedPlace.slug, editor);
      setSelectedPlace(data.place);
      setPlaces(prev => prev.map(place => place.slug === data.place.slug ? { ...place, ...data.place } : place));
      toast?.success("Place details updated.");
    } catch (e) {
      toast?.error(e.message || "Could not save place details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in" style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 24px 56px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontFamily: "var(--font-display)", color: "var(--gold)", letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>
          Shakespearean Geography
        </div>
        <h1 style={{ fontFamily: "'Cinzel Decorative',var(--font-display)", fontSize: 36, fontWeight: 400, color: "var(--accent)", letterSpacing: 2, marginBottom: 12 }}>
          Places in the Works
        </h1>
        <p style={{ maxWidth: 780, lineHeight: 1.8, color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0 }}>
          Explore a curated geography of real places named in Shakespeare. The map now uses live OpenStreetMap tiles, so places sit where they
          actually belong, and each place card can carry historical context and an image.
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, alignItems: "start" }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 18, background: "linear-gradient(180deg, rgba(201,168,76,0.06), rgba(122,30,46,0.03))", padding: 16, boxShadow: "0 12px 30px rgba(0,0,0,0.06)" }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "var(--accent)" }}>Map View</div>
                <div style={{ fontSize: 13, color: "var(--text-light)" }}>
                  {selectedWork ? `Filtered to ${selectedWork.title}` : "Zoomable real geography via OpenStreetMap"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "var(--text-light)" }}>{visiblePlaces.length} places</div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const map = mapRef.current;
                    if (!map) return;
                    if (!visiblePlaces.length) {
                      map.setView(INITIAL_CENTER, INITIAL_ZOOM);
                      return;
                    }
                    const bounds = visiblePlaces.map(place => [place.lat, place.lng]);
                    if (bounds.length === 1) map.setView(bounds[0], 6);
                    else map.fitBounds(bounds, { padding: [36, 36], maxZoom: 6 });
                  }}
                >
                  Reset View
                </button>
              </div>
            </div>

            <div style={{ position: "relative", minHeight: 560, borderRadius: 14, border: "1px solid var(--border-light)", overflow: "hidden", background: "rgba(244,240,229,0.9)" }}>
              <div ref={mapNodeRef} style={{ position: "absolute", inset: 0 }} />
              {mapLoading && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(244,240,229,0.92)" }}>
                  <div className="spinner" />
                </div>
              )}
              {mapError && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", background: "rgba(244,240,229,0.95)", color: "var(--danger)" }}>
                  {mapError}
                </div>
              )}
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

                {user?.isAdmin && (
                  <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 14, marginBottom: 16 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
                      Edit Place Card
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <textarea
                        className="input"
                        value={editor.description}
                        onChange={e => setEditor(prev => ({ ...prev, description: e.target.value }))}
                        rows={3}
                        placeholder="Short place description"
                        style={{ resize: "vertical" }}
                      />
                      <textarea
                        className="input"
                        value={editor.historicalNote}
                        onChange={e => setEditor(prev => ({ ...prev, historicalNote: e.target.value }))}
                        rows={4}
                        placeholder="Historical note for Shakespeare's period"
                        style={{ resize: "vertical" }}
                      />
                      <input
                        className="input"
                        value={editor.imageUrl}
                        onChange={e => setEditor(prev => ({ ...prev, imageUrl: e.target.value }))}
                        placeholder="Image URL"
                      />
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                          {uploading ? "Uploading..." : "Upload Image"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            onChange={e => uploadPlaceImage(e.target.files?.[0])}
                            style={{ display: "none" }}
                          />
                        </label>
                        <button className="btn btn-primary btn-sm" onClick={savePlace} disabled={saving}>
                          {saving ? "Saving..." : "Save Place"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

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
