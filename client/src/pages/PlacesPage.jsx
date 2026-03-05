import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { places as placesApi, works as worksApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";
import PlacesMap from "../components/PlacesMap";

function prettyCategory(cat) {
  return String(cat || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function mapLinkUrl(place) {
  if (!place) return "https://www.openstreetmap.org/#map=4/45.2/12.0";
  return `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=7/${place.lat}/${place.lng}`;
}

function mapLinkUrlForPlaces(places) {
  if (!places?.length) return mapLinkUrl(null);
  const acc = places.reduce((sum, place) => ({
    lat: sum.lat + (Number(place.lat) || 0),
    lng: sum.lng + (Number(place.lng) || 0),
  }), { lat: 0, lng: 0 });
  const centerLat = acc.lat / places.length;
  const centerLng = acc.lng / places.length;
  return `https://www.openstreetmap.org/#map=4/${centerLat.toFixed(4)}/${centerLng.toFixed(4)}`;
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

  const [works, setWorks] = useState([]);
  const [places, setPlaces] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [citations, setCitations] = useState([]);
  const [workFilter, setWorkFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [showAllMap, setShowAllMap] = useState(false);
  const [showAllPlacesList, setShowAllPlacesList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
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

  const visiblePlaces = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return places.filter((place) => {
      if (typeFilter !== "all" && place.placeType !== typeFilter) return false;
      if (countryFilter !== "all" && place.modernCountry !== countryFilter) return false;
      if (!q) return true;
      const haystack = [
        place.name,
        place.modernName,
        place.modernCountry,
        place.placeType,
        ...(place.aliases || []),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [places, typeFilter, countryFilter, searchFilter]);

  const listPlaces = useMemo(() => (
    showAllPlacesList ? visiblePlaces : visiblePlaces.slice(0, 28)
  ), [visiblePlaces, showAllPlacesList]);

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

  const countryOptions = useMemo(() => {
    const countries = [...new Set(places.map(place => place.modernCountry).filter(Boolean))];
    return countries.sort((a, b) => a.localeCompare(b));
  }, [places]);

  const selectedWork = works.find(work => work.slug === workFilter);
  const mapLink = showAllMap ? mapLinkUrlForPlaces(visiblePlaces) : mapLinkUrl(selectedPlace);

  useEffect(() => {
    setShowAllPlacesList(false);
  }, [workFilter, typeFilter, countryFilter, searchFilter]);

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
        <select className="input" value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={{ minWidth: 180 }}>
          <option value="all">All Countries</option>
          {countryOptions.map(country => (
            <option key={country} value={country}>{country}</option>
          ))}
        </select>
        <input
          className="input"
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          placeholder="Find place name or alias…"
          style={{ minWidth: 240 }}
        />
        {(typeFilter !== "all" || countryFilter !== "all" || searchFilter.trim()) && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setTypeFilter("all");
              setCountryFilter("all");
              setSearchFilter("");
            }}
          >
            Clear Filters
          </button>
        )}
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
                  {showAllMap
                    ? "Browsing all filtered locations"
                    : selectedWork
                      ? `Focused by selection · ${selectedWork.title}`
                      : "Focused by selection"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "var(--text-light)" }}>{visiblePlaces.length} / {places.length} places</div>
                <a className="btn btn-ghost btn-sm" href={mapLink} target="_blank" rel="noopener noreferrer">
                  Open Larger
                </a>
              </div>
            </div>

            <PlacesMap
              places={visiblePlaces}
              selectedSlug={showAllMap ? "" : selectedSlug}
              showAll={showAllMap}
              onSelect={(slug) => {
                setSelectedSlug(slug);
                setShowAllMap(false);
              }}
            />

            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 220, overflowY: "auto", paddingRight: 2, alignContent: "flex-start" }}>
              <button
                className={showAllMap ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                onClick={() => setShowAllMap(true)}
                disabled={visiblePlaces.length === 0}
              >
                Show All On Map
              </button>
              <button
                className={!showAllMap ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                onClick={() => setShowAllMap(false)}
                disabled={!selectedSlug}
              >
                Focus Selected
              </button>
              {visiblePlaces.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-light)" }}>
                  No matching places for this filter.
                </div>
              ) : listPlaces.map(place => (
                <button
                  key={place.slug}
                  className={place.slug === selectedSlug ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                  onClick={() => {
                    setSelectedSlug(place.slug);
                    setShowAllMap(false);
                  }}
                  style={{ fontSize: 12 }}
                >
                  {place.name}
                </button>
              ))}
              {!showAllPlacesList && visiblePlaces.length > listPlaces.length && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAllPlacesList(true)}>
                  Show {visiblePlaces.length - listPlaces.length} More
                </button>
              )}
              {showAllPlacesList && visiblePlaces.length > 28 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAllPlacesList(false)}>
                  Collapse List
                </button>
              )}
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
