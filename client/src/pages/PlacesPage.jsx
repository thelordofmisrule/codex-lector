import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { places as placesApi, works as worksApi } from "../lib/api";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";
import PlacesMap from "../components/PlacesMap";

function prettyCategory(cat) {
  return String(cat || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function normalizePlaceType(value) {
  return String(value || "").trim().toLowerCase();
}

function mapLinkUrl(place) {
  if (!place) return "https://www.openstreetmap.org/#map=4/45.2/12.0";
  if (!Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) {
    return "https://www.openstreetmap.org/#map=4/45.2/12.0";
  }
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

function normalizeCsvList(raw) {
  return [...new Set(String(raw || "").split(/[,\n;]+/).map(s => s.trim()).filter(Boolean))];
}

function placeDraftFromPlace(place) {
  return {
    name: place?.name || "",
    modernName: place?.modernName || "",
    placeType: place?.placeType || "",
    modernCountry: place?.modernCountry || "",
    lat: place?.lat ?? "",
    lng: place?.lng ?? "",
    aliases: (place?.aliases || []).join(", "),
    sourcePlays: (place?.sourcePlays || []).join(", "),
    isReal: place?.isReal !== false,
    description: place?.description || "",
    historicalNote: place?.historicalNote || "",
    imageUrl: place?.imageUrl || "",
  };
}

function buildSuggestionChanges(originalPlace, draft) {
  const changes = {};
  if (!originalPlace) return changes;

  const scalarChecks = [
    ["name", draft.name, originalPlace.name || ""],
    ["modernName", draft.modernName, originalPlace.modernName || ""],
    ["placeType", draft.placeType, originalPlace.placeType || ""],
    ["modernCountry", draft.modernCountry, originalPlace.modernCountry || ""],
    ["description", draft.description, originalPlace.description || ""],
    ["historicalNote", draft.historicalNote, originalPlace.historicalNote || ""],
    ["imageUrl", draft.imageUrl, originalPlace.imageUrl || ""],
  ];
  scalarChecks.forEach(([key, nextRaw, prevRaw]) => {
    const next = String(nextRaw || "").trim();
    const prev = String(prevRaw || "").trim();
    if (next !== prev) changes[key] = next;
  });

  const nextLat = draft.lat === "" ? null : Number(draft.lat);
  const nextLng = draft.lng === "" ? null : Number(draft.lng);
  const prevLat = originalPlace.lat === null || originalPlace.lat === undefined || originalPlace.lat === "" ? null : Number(originalPlace.lat);
  const prevLng = originalPlace.lng === null || originalPlace.lng === undefined || originalPlace.lng === "" ? null : Number(originalPlace.lng);
  if (nextLat !== prevLat) changes.lat = nextLat;
  if (nextLng !== prevLng) changes.lng = nextLng;

  const nextAliases = normalizeCsvList(draft.aliases);
  const prevAliases = [...new Set((originalPlace.aliases || []).map(s => String(s || "").trim()).filter(Boolean))];
  if (nextAliases.join("|") !== prevAliases.join("|")) changes.aliases = nextAliases;

  const nextPlays = normalizeCsvList(draft.sourcePlays);
  const prevPlays = [...new Set((originalPlace.sourcePlays || []).map(s => String(s || "").trim()).filter(Boolean))];
  if (nextPlays.join("|") !== prevPlays.join("|")) changes.sourcePlays = nextPlays;

  if (!!draft.isReal !== !!originalPlace.isReal) changes.isReal = !!draft.isReal;
  return changes;
}

function buildCreatePayloadFromDraft(draft) {
  const parsedLat = draft.lat === "" ? null : Number(draft.lat);
  const parsedLng = draft.lng === "" ? null : Number(draft.lng);
  if ((draft.lat !== "" && !Number.isFinite(parsedLat)) || (draft.lng !== "" && !Number.isFinite(parsedLng))) {
    throw new Error("Latitude/longitude must be numeric values.");
  }
  const name = String(draft.name || "").trim();
  if (!name) {
    throw new Error("Name is required.");
  }
  return {
    name,
    modernName: String(draft.modernName || "").trim(),
    placeType: String(draft.placeType || "").trim(),
    modernCountry: String(draft.modernCountry || "").trim(),
    lat: parsedLat,
    lng: parsedLng,
    aliases: normalizeCsvList(draft.aliases),
    sourcePlays: normalizeCsvList(draft.sourcePlays),
    isReal: !!draft.isReal,
    description: String(draft.description || "").trim(),
    historicalNote: String(draft.historicalNote || "").trim(),
    imageUrl: String(draft.imageUrl || "").trim(),
  };
}

export default function PlacesPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedPlaceParam = searchParams.get("place") || "";
  const requestedWorkParam = searchParams.get("work") || "";
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();

  const [works, setWorks] = useState([]);
  const [places, setPlaces] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState(() => requestedPlaceParam);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [citations, setCitations] = useState([]);
  const [citationExclusions, setCitationExclusions] = useState([]);
  const [citationExclusionsLoading, setCitationExclusionsLoading] = useState(false);
  const [workFilter, setWorkFilter] = useState(() => requestedWorkParam);
  const [typeFilter, setTypeFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [showAllMap, setShowAllMap] = useState(false);
  const [showAllPlacesList, setShowAllPlacesList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestEditor, setShowSuggestEditor] = useState(false);
  const [suggestDraft, setSuggestDraft] = useState(() => placeDraftFromPlace(null));
  const [suggestReason, setSuggestReason] = useState("");
  const [suggestMsg, setSuggestMsg] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [newPlaceSuggestions, setNewPlaceSuggestions] = useState([]);
  const [newPlaceSuggestionsLoading, setNewPlaceSuggestionsLoading] = useState(false);
  const [showSuggestNewEditor, setShowSuggestNewEditor] = useState(false);
  const [suggestNewDraft, setSuggestNewDraft] = useState(() => placeDraftFromPlace(null));
  const [suggestNewReason, setSuggestNewReason] = useState("");
  const [suggestNewMsg, setSuggestNewMsg] = useState("");
  const [suggestingNew, setSuggestingNew] = useState(false);
  const [showCreateEditor, setShowCreateEditor] = useState(false);
  const [createEditor, setCreateEditor] = useState(() => placeDraftFromPlace(null));
  const [createMsg, setCreateMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(() => placeDraftFromPlace(null));

  useEffect(() => {
    setWorkFilter(prev => prev === requestedWorkParam ? prev : requestedWorkParam);
    if (requestedPlaceParam) {
      setSelectedSlug(prev => prev === requestedPlaceParam ? prev : requestedPlaceParam);
    }
  }, [requestedPlaceParam, requestedWorkParam]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      worksApi.list(),
      placesApi.list(workFilter, true),
    ]).then(([worksData, placesData]) => {
      if (cancelled) return;
      setWorks((worksData || []).filter(w => w.has_content));
      const nextPlaces = placesData.places || [];
      setPlaces(nextPlaces);
      setSelectedSlug(prev => {
        if (requestedPlaceParam && nextPlaces.some(p => p.slug === requestedPlaceParam)) return requestedPlaceParam;
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
  }, [requestedPlaceParam, workFilter]);

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
    const draft = placeDraftFromPlace(selectedPlace);
    setEditor(draft);
    setSuggestDraft(draft);
    setSuggestReason("");
    setSuggestMsg("");
    setShowSuggestEditor(false);
  }, [selectedPlace]);

  useEffect(() => {
    if (!selectedSlug || !user) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestionsLoading(true);
    placesApi.suggestions(selectedSlug).then(data => {
      if (cancelled) return;
      setSuggestions(data.suggestions || []);
    }).catch(() => {
      if (cancelled) return;
      setSuggestions([]);
    }).finally(() => {
      if (!cancelled) setSuggestionsLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedSlug, user]);

  useEffect(() => {
    if (!user) {
      setNewPlaceSuggestions([]);
      setNewPlaceSuggestionsLoading(false);
      return;
    }
    let cancelled = false;
    setNewPlaceSuggestionsLoading(true);
    placesApi.newSuggestions().then(data => {
      if (cancelled) return;
      setNewPlaceSuggestions(data.suggestions || []);
    }).catch(() => {
      if (cancelled) return;
      setNewPlaceSuggestions([]);
    }).finally(() => {
      if (!cancelled) setNewPlaceSuggestionsLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!selectedSlug || !user?.isAdmin) {
      setCitationExclusions([]);
      setCitationExclusionsLoading(false);
      return;
    }
    let cancelled = false;
    setCitationExclusionsLoading(true);
    placesApi.citationExclusions(selectedSlug).then(data => {
      if (cancelled) return;
      setCitationExclusions(data.exclusions || []);
    }).catch(() => {
      if (cancelled) return;
      setCitationExclusions([]);
    }).finally(() => {
      if (!cancelled) setCitationExclusionsLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedSlug, user?.isAdmin]);

  const visiblePlaces = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return places.filter((place) => {
      if (typeFilter !== "all" && normalizePlaceType(place.placeType) !== typeFilter) return false;
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
    const byValue = new Map();
    places.forEach((place) => {
      const value = normalizePlaceType(place.placeType);
      if (!value) return;
      if (!byValue.has(value)) byValue.set(value, prettyCategory(value));
    });
    return [...byValue.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [places]);

  const countryOptions = useMemo(() => {
    const countries = [...new Set(places.map(place => place.modernCountry).filter(Boolean))];
    return countries.sort((a, b) => a.localeCompare(b));
  }, [places]);

  const selectedWork = works.find(work => work.slug === workFilter);
  const workTitleBySlug = useMemo(() => {
    const map = {};
    works.forEach(work => { map[work.slug] = work.title; });
    return map;
  }, [works]);
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
    const parsedLat = editor.lat === "" ? null : Number(editor.lat);
    const parsedLng = editor.lng === "" ? null : Number(editor.lng);
    if ((editor.lat !== "" && !Number.isFinite(parsedLat)) || (editor.lng !== "" && !Number.isFinite(parsedLng))) {
      toast?.error("Latitude/longitude must be numeric values.");
      return;
    }
    setSaving(true);
    try {
      const data = await placesApi.update(selectedPlace.slug, {
        ...editor,
        lat: parsedLat,
        lng: parsedLng,
      });
      setSelectedPlace(data.place);
      setPlaces(prev => prev.map(place => place.slug === data.place.slug ? { ...place, ...data.place } : place));
      toast?.success("Place details updated.");
    } catch (e) {
      toast?.error(e.message || "Could not save place details.");
    } finally {
      setSaving(false);
    }
  };

  const deletePlace = async () => {
    if (!selectedPlace || !user?.isAdmin || deleting) return;
    const placeName = selectedPlace.name || selectedPlace.slug;
    const ok = await confirm({
      title: "Delete Place",
      message: `Delete ${placeName}? This will remove the place, its edit suggestions, and its excluded citation matches.`,
      confirmText: "Delete Place",
      cancelText: "Keep Place",
      danger: true,
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await placesApi.delete(selectedPlace.slug);
      setPlaces(prev => prev.filter(place => place.slug !== selectedPlace.slug));
      setSelectedSlug("");
      setSelectedPlace(null);
      setCitations([]);
      setCitationExclusions([]);
      setSuggestions([]);
      toast?.success("Place deleted.");
    } catch (e) {
      toast?.error(e.message || "Could not delete place.");
    } finally {
      setDeleting(false);
    }
  };

  const upsertPlace = (nextPlace) => {
    setPlaces(prev => {
      const idx = prev.findIndex(place => place.slug === nextPlace.slug);
      const next = idx >= 0
        ? prev.map(place => place.slug === nextPlace.slug ? { ...place, ...nextPlace } : place)
        : [...prev, nextPlace];
      return [...next].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    });
  };

  const createPlace = async () => {
    let payload;
    try {
      payload = buildCreatePayloadFromDraft(createEditor);
    } catch (e) {
      setCreateMsg(e.message || "Invalid place details.");
      return;
    }
    setCreating(true);
    setCreateMsg("");
    try {
      const data = await placesApi.create(payload);
      upsertPlace(data.place);
      setSelectedSlug(data.place.slug);
      setShowCreateEditor(false);
      setCreateEditor(placeDraftFromPlace(null));
      toast?.success("New place created.");
    } catch (e) {
      setCreateMsg(e.message || "Could not create place.");
    } finally {
      setCreating(false);
    }
  };

  const submitSuggestion = async () => {
    if (!selectedPlace) return;
    const parsedLat = suggestDraft.lat === "" ? null : Number(suggestDraft.lat);
    const parsedLng = suggestDraft.lng === "" ? null : Number(suggestDraft.lng);
    if ((suggestDraft.lat !== "" && !Number.isFinite(parsedLat)) || (suggestDraft.lng !== "" && !Number.isFinite(parsedLng))) {
      setSuggestMsg("Latitude/longitude must be numeric values.");
      return;
    }

    const changes = buildSuggestionChanges(selectedPlace, {
      ...suggestDraft,
      lat: parsedLat,
      lng: parsedLng,
    });
    if (!Object.keys(changes).length) {
      setSuggestMsg("No changes to suggest.");
      return;
    }

    setSuggesting(true);
    setSuggestMsg("");
    try {
      const data = await placesApi.suggest(selectedPlace.slug, changes, suggestReason);
      setSuggestions(prev => [data.suggestion, ...prev]);
      setShowSuggestEditor(false);
      setSuggestReason("");
      toast?.success("Place edit suggestion submitted.");
    } catch (e) {
      setSuggestMsg(e.message || "Could not submit suggestion.");
    } finally {
      setSuggesting(false);
    }
  };

  const submitNewPlaceSuggestion = async () => {
    let payload;
    try {
      payload = buildCreatePayloadFromDraft(suggestNewDraft);
    } catch (e) {
      setSuggestNewMsg(e.message || "Invalid place details.");
      return;
    }
    setSuggestingNew(true);
    setSuggestNewMsg("");
    try {
      const data = await placesApi.suggestNew(payload, suggestNewReason);
      setNewPlaceSuggestions(prev => [data.suggestion, ...prev]);
      setShowSuggestNewEditor(false);
      setSuggestNewDraft(placeDraftFromPlace(null));
      setSuggestNewReason("");
      toast?.success("New place suggestion submitted.");
    } catch (e) {
      setSuggestNewMsg(e.message || "Could not submit new place suggestion.");
    } finally {
      setSuggestingNew(false);
    }
  };

  const acceptSuggestion = async (id) => {
    try {
      await placesApi.acceptSuggestion(id);
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "accepted" } : s));
      const refreshed = await placesApi.get(selectedSlug, workFilter);
      setSelectedPlace(refreshed.place);
      setCitations(refreshed.citations || []);
      setPlaces(prev => prev.map(place => place.slug === refreshed.place.slug ? { ...place, ...refreshed.place } : place));
      toast?.success("Suggestion accepted.");
    } catch (e) {
      toast?.error(e.message || "Could not accept suggestion.");
    }
  };

  const rejectSuggestion = async (id) => {
    try {
      await placesApi.rejectSuggestion(id);
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "rejected" } : s));
      toast?.success("Suggestion rejected.");
    } catch (e) {
      toast?.error(e.message || "Could not reject suggestion.");
    }
  };

  const acceptNewPlaceSuggestion = async (id) => {
    try {
      const data = await placesApi.acceptNewSuggestion(id);
      if (data.place) {
        upsertPlace(data.place);
        setSelectedSlug(data.place.slug);
      }
      setNewPlaceSuggestions(prev => prev.map(s => (
        s.id === id
          ? { ...s, status: "accepted", createdPlace: data.place ? { slug: data.place.slug, name: data.place.name } : s.createdPlace }
          : s
      )));
      toast?.success("New place suggestion accepted.");
    } catch (e) {
      toast?.error(e.message || "Could not accept new place suggestion.");
    }
  };

  const rejectNewPlaceSuggestion = async (id) => {
    try {
      await placesApi.rejectNewSuggestion(id);
      setNewPlaceSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "rejected" } : s));
      toast?.success("New place suggestion rejected.");
    } catch (e) {
      toast?.error(e.message || "Could not reject new place suggestion.");
    }
  };

  const excludeCitationMatch = async (citation) => {
    if (!selectedPlace) return;
    try {
      const data = await placesApi.excludeCitation(selectedPlace.slug, citation.workSlug, citation.lineNumber, citation.lineText);
      setCitations(prev => prev.filter(item => !(item.workSlug === citation.workSlug && item.lineNumber === citation.lineNumber)));
      if (data?.exclusion) {
        setCitationExclusions(prev => {
          if (prev.some(item => item.id === data.exclusion.id)) return prev;
          return [data.exclusion, ...prev];
        });
      }
      toast?.success("Citation excluded for this place.");
    } catch (e) {
      toast?.error(e.message || "Could not exclude citation.");
    }
  };

  const restoreCitationExclusion = async (id) => {
    if (!selectedPlace) return;
    try {
      await placesApi.restoreCitationExclusion(selectedPlace.slug, id);
      setCitationExclusions(prev => prev.filter(item => item.id !== id));
      const refreshed = await placesApi.get(selectedSlug, workFilter);
      setSelectedPlace(refreshed.place);
      setCitations(refreshed.citations || []);
      toast?.success("Citation exclusion removed.");
    } catch (e) {
      toast?.error(e.message || "Could not restore citation.");
    }
  };

  return (
    <div className="animate-in" style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 24px 56px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontFamily: "var(--font-display)", color: "var(--gold)", letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>
          Shakespearean Geography
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 400, color: "var(--accent)", letterSpacing: 2, marginBottom: 12 }}>
          Places in the Works
        </h1>
        <p style={{ maxWidth: 780, lineHeight: 1.8, color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0 }}>
          Explore Shakespearean settings across cities, regions, rivers, battlefields, streets, and imagined locations. The map uses live
          OpenStreetMap tiles when coordinates exist, and each place card can be refined with historical context and editorial notes.
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
            <option key={type.value} value={type.value}>{type.label}</option>
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
            {user?.isAdmin && (
              <div style={{ borderBottom: "1px solid var(--border-light)", paddingBottom: 14, marginBottom: 16 }}>
                {!showCreateEditor ? (
                  <button className="btn btn-secondary" onClick={() => setShowCreateEditor(true)}>
                    Add New Place
                  </button>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)" }}>
                      Create New Place
                    </div>
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <input className="input" value={createEditor.name} onChange={e => setCreateEditor(prev => ({ ...prev, name: e.target.value }))} placeholder="Name" />
                      <input className="input" value={createEditor.modernName} onChange={e => setCreateEditor(prev => ({ ...prev, modernName: e.target.value }))} placeholder="Modern name" />
                      <input className="input" value={createEditor.placeType} onChange={e => setCreateEditor(prev => ({ ...prev, placeType: e.target.value }))} placeholder="Place type" />
                      <input className="input" value={createEditor.modernCountry} onChange={e => setCreateEditor(prev => ({ ...prev, modernCountry: e.target.value }))} placeholder="Country / region" />
                    </div>
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <input className="input" value={createEditor.lat} onChange={e => setCreateEditor(prev => ({ ...prev, lat: e.target.value }))} placeholder="Latitude" />
                      <input className="input" value={createEditor.lng} onChange={e => setCreateEditor(prev => ({ ...prev, lng: e.target.value }))} placeholder="Longitude" />
                    </div>
                    <input className="input" value={createEditor.aliases} onChange={e => setCreateEditor(prev => ({ ...prev, aliases: e.target.value }))} placeholder="Aliases (comma separated)" />
                    <input className="input" value={createEditor.sourcePlays} onChange={e => setCreateEditor(prev => ({ ...prev, sourcePlays: e.target.value }))} placeholder="Source plays (comma separated)" />
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                      <input type="checkbox" checked={!!createEditor.isReal} onChange={e => setCreateEditor(prev => ({ ...prev, isReal: e.target.checked }))} />
                      Real-world location
                    </label>
                    <textarea className="input" value={createEditor.description} onChange={e => setCreateEditor(prev => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Description" style={{ resize: "vertical" }} />
                    <textarea className="input" value={createEditor.historicalNote} onChange={e => setCreateEditor(prev => ({ ...prev, historicalNote: e.target.value }))} rows={3} placeholder="Historical note" style={{ resize: "vertical" }} />
                    <input className="input" value={createEditor.imageUrl} onChange={e => setCreateEditor(prev => ({ ...prev, imageUrl: e.target.value }))} placeholder="Image URL" />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-primary btn-sm" onClick={createPlace} disabled={creating}>
                        {creating ? "Creating..." : "Create Place"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setShowCreateEditor(false);
                          setCreateEditor(placeDraftFromPlace(null));
                          setCreateMsg("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {createMsg && <div style={{ fontSize: 13, color: "var(--danger)" }}>{createMsg}</div>}
                  </div>
                )}
              </div>
            )}

            {user && !user.isAdmin && (
              <div style={{ borderBottom: "1px solid var(--border-light)", paddingBottom: 14, marginBottom: 16 }}>
                {!showSuggestNewEditor ? (
                  <button className="btn btn-secondary" onClick={() => setShowSuggestNewEditor(true)}>
                    Suggest New Place
                  </button>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)" }}>
                      Suggest New Place
                    </div>
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <input className="input" value={suggestNewDraft.name} onChange={e => setSuggestNewDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Name" />
                      <input className="input" value={suggestNewDraft.modernName} onChange={e => setSuggestNewDraft(prev => ({ ...prev, modernName: e.target.value }))} placeholder="Modern name" />
                      <input className="input" value={suggestNewDraft.placeType} onChange={e => setSuggestNewDraft(prev => ({ ...prev, placeType: e.target.value }))} placeholder="Place type" />
                      <input className="input" value={suggestNewDraft.modernCountry} onChange={e => setSuggestNewDraft(prev => ({ ...prev, modernCountry: e.target.value }))} placeholder="Country / region" />
                    </div>
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <input className="input" value={suggestNewDraft.lat} onChange={e => setSuggestNewDraft(prev => ({ ...prev, lat: e.target.value }))} placeholder="Latitude" />
                      <input className="input" value={suggestNewDraft.lng} onChange={e => setSuggestNewDraft(prev => ({ ...prev, lng: e.target.value }))} placeholder="Longitude" />
                    </div>
                    <input className="input" value={suggestNewDraft.aliases} onChange={e => setSuggestNewDraft(prev => ({ ...prev, aliases: e.target.value }))} placeholder="Aliases (comma separated)" />
                    <input className="input" value={suggestNewDraft.sourcePlays} onChange={e => setSuggestNewDraft(prev => ({ ...prev, sourcePlays: e.target.value }))} placeholder="Source plays (comma separated)" />
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                      <input type="checkbox" checked={!!suggestNewDraft.isReal} onChange={e => setSuggestNewDraft(prev => ({ ...prev, isReal: e.target.checked }))} />
                      Real-world location
                    </label>
                    <textarea className="input" value={suggestNewDraft.description} onChange={e => setSuggestNewDraft(prev => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Description" style={{ resize: "vertical" }} />
                    <textarea className="input" value={suggestNewDraft.historicalNote} onChange={e => setSuggestNewDraft(prev => ({ ...prev, historicalNote: e.target.value }))} rows={3} placeholder="Historical note" style={{ resize: "vertical" }} />
                    <input className="input" value={suggestNewDraft.imageUrl} onChange={e => setSuggestNewDraft(prev => ({ ...prev, imageUrl: e.target.value }))} placeholder="Image URL" />
                    <textarea className="input" value={suggestNewReason} onChange={e => setSuggestNewReason(e.target.value)} rows={2} placeholder="Why are you suggesting this place? (optional)" style={{ resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-primary btn-sm" onClick={submitNewPlaceSuggestion} disabled={suggestingNew}>
                        {suggestingNew ? "Submitting..." : "Submit New Place"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setShowSuggestNewEditor(false);
                          setSuggestNewDraft(placeDraftFromPlace(null));
                          setSuggestNewReason("");
                          setSuggestNewMsg("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {suggestNewMsg && <div style={{ fontSize: 13, color: "var(--danger)" }}>{suggestNewMsg}</div>}
                  </div>
                )}
              </div>
            )}

            {user && (
              <div style={{ borderBottom: "1px solid var(--border-light)", paddingBottom: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)" }}>
                    New Place Submissions
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                    {newPlaceSuggestionsLoading ? "Loading..." : `${newPlaceSuggestions.length} total`}
                  </div>
                </div>
                {newPlaceSuggestionsLoading ? (
                  <div style={{ padding: 10 }}><div className="spinner" /></div>
                ) : newPlaceSuggestions.length === 0 ? (
                  <div style={{ color: "var(--text-light)", fontSize: 13 }}>No new place submissions yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {newPlaceSuggestions.map(s => (
                      <div key={s.id} style={{ border: "1px solid var(--border-light)", borderRadius: 10, padding: "10px 12px", background: "rgba(201,168,76,0.05)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 13 }}>
                            <strong>{s.displayName}</strong>
                            <span style={{ color: "var(--text-light)", marginLeft: 8 }}>{new Date(s.createdAt).toLocaleString()}</span>
                          </div>
                          <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: s.status === "accepted" ? "var(--success)" : s.status === "rejected" ? "var(--danger)" : "var(--gold)" }}>
                            {s.status}
                          </span>
                        </div>
                        {s.reason && <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Reason: {s.reason}</div>}
                        {s.createdPlace && (
                          <div style={{ marginBottom: 6 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setSelectedSlug(s.createdPlace.slug)}
                            >
                              Open Created Place: {s.createdPlace.name}
                            </button>
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "var(--text-light)", marginBottom: 6 }}>
                          Suggested fields: {Object.keys(s.payload || {}).join(", ") || "None"}
                        </div>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "var(--text-muted)", background: "var(--bg)", padding: 8, borderRadius: 6, border: "1px solid var(--border-light)" }}>
{JSON.stringify(s.payload || {}, null, 2)}
                        </pre>
                        {user.isAdmin && s.status === "pending" && (
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => acceptNewPlaceSuggestion(s.id)}>Accept & Create</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => rejectNewPlaceSuggestion(s.id)}>Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                  <div style={{ fontSize: 12, color: "var(--text-light)", marginBottom: 10 }}>
                    {Number.isFinite(Number(selectedPlace.lat)) && Number.isFinite(Number(selectedPlace.lng))
                      ? `Coordinates: ${Number(selectedPlace.lat).toFixed(4)}, ${Number(selectedPlace.lng).toFixed(4)}`
                      : "Coordinates not set yet."}
                  </div>
                  {selectedPlace.sourcePlays?.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-light)", marginBottom: 10 }}>
                      Source index: {selectedPlace.sourcePlays.slice(0, 8).join(", ")}{selectedPlace.sourcePlays.length > 8 ? ` +${selectedPlace.sourcePlays.length - 8} more` : ""}
                    </div>
                  )}
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

                {user && !user.isAdmin && (
                  <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 14, marginBottom: 16 }}>
                    {!showSuggestEditor ? (
                      <button className="btn btn-secondary" onClick={() => setShowSuggestEditor(true)}>
                        Suggest Place Edit
                      </button>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)" }}>
                          Suggest Edits
                        </div>
                        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                          <input className="input" value={suggestDraft.name} onChange={e => setSuggestDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Name" />
                          <input className="input" value={suggestDraft.modernName} onChange={e => setSuggestDraft(prev => ({ ...prev, modernName: e.target.value }))} placeholder="Modern name" />
                          <input className="input" value={suggestDraft.placeType} onChange={e => setSuggestDraft(prev => ({ ...prev, placeType: e.target.value }))} placeholder="Place type" />
                          <input className="input" value={suggestDraft.modernCountry} onChange={e => setSuggestDraft(prev => ({ ...prev, modernCountry: e.target.value }))} placeholder="Country / region" />
                        </div>
                        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                          <input className="input" value={suggestDraft.lat} onChange={e => setSuggestDraft(prev => ({ ...prev, lat: e.target.value }))} placeholder="Latitude" />
                          <input className="input" value={suggestDraft.lng} onChange={e => setSuggestDraft(prev => ({ ...prev, lng: e.target.value }))} placeholder="Longitude" />
                        </div>
                        <input className="input" value={suggestDraft.aliases} onChange={e => setSuggestDraft(prev => ({ ...prev, aliases: e.target.value }))} placeholder="Aliases (comma separated)" />
                        <input className="input" value={suggestDraft.sourcePlays} onChange={e => setSuggestDraft(prev => ({ ...prev, sourcePlays: e.target.value }))} placeholder="Source plays (comma separated)" />
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                          <input type="checkbox" checked={!!suggestDraft.isReal} onChange={e => setSuggestDraft(prev => ({ ...prev, isReal: e.target.checked }))} />
                          Real-world location
                        </label>
                        <textarea className="input" value={suggestDraft.description} onChange={e => setSuggestDraft(prev => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Description" style={{ resize: "vertical" }} />
                        <textarea className="input" value={suggestDraft.historicalNote} onChange={e => setSuggestDraft(prev => ({ ...prev, historicalNote: e.target.value }))} rows={3} placeholder="Historical note" style={{ resize: "vertical" }} />
                        <input className="input" value={suggestDraft.imageUrl} onChange={e => setSuggestDraft(prev => ({ ...prev, imageUrl: e.target.value }))} placeholder="Image URL" />
                        <textarea className="input" value={suggestReason} onChange={e => setSuggestReason(e.target.value)} rows={2} placeholder="Why are you suggesting this change? (optional)" style={{ resize: "vertical" }} />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="btn btn-primary btn-sm" onClick={submitSuggestion} disabled={suggesting}>
                            {suggesting ? "Submitting..." : "Submit Suggestion"}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setShowSuggestEditor(false);
                              setSuggestDraft(placeDraftFromPlace(selectedPlace));
                              setSuggestReason("");
                              setSuggestMsg("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                        {suggestMsg && <div style={{ fontSize: 13, color: "var(--danger)" }}>{suggestMsg}</div>}
                      </div>
                    )}
                  </div>
                )}

                {user?.isAdmin && (
                  <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 14, marginBottom: 16 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
                      Edit Place Card
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                        <input
                          className="input"
                          value={editor.name}
                          onChange={e => setEditor(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Name"
                        />
                        <input
                          className="input"
                          value={editor.modernName}
                          onChange={e => setEditor(prev => ({ ...prev, modernName: e.target.value }))}
                          placeholder="Modern name"
                        />
                        <input
                          className="input"
                          value={editor.placeType}
                          onChange={e => setEditor(prev => ({ ...prev, placeType: e.target.value }))}
                          placeholder="Place type"
                        />
                        <input
                          className="input"
                          value={editor.modernCountry}
                          onChange={e => setEditor(prev => ({ ...prev, modernCountry: e.target.value }))}
                          placeholder="Country / region"
                        />
                      </div>
                      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                        <input
                          className="input"
                          value={editor.lat}
                          onChange={e => setEditor(prev => ({ ...prev, lat: e.target.value }))}
                          placeholder="Latitude"
                        />
                        <input
                          className="input"
                          value={editor.lng}
                          onChange={e => setEditor(prev => ({ ...prev, lng: e.target.value }))}
                          placeholder="Longitude"
                        />
                      </div>
                      <input
                        className="input"
                        value={editor.aliases}
                        onChange={e => setEditor(prev => ({ ...prev, aliases: e.target.value }))}
                        placeholder="Aliases (comma separated)"
                      />
                      <input
                        className="input"
                        value={editor.sourcePlays}
                        onChange={e => setEditor(prev => ({ ...prev, sourcePlays: e.target.value }))}
                        placeholder="Source plays (comma separated)"
                      />
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                        <input
                          type="checkbox"
                          checked={!!editor.isReal}
                          onChange={e => setEditor(prev => ({ ...prev, isReal: e.target.checked }))}
                        />
                        Real-world location
                      </label>
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
                        <button className="btn btn-primary btn-sm" onClick={savePlace} disabled={saving || deleting}>
                          {saving ? "Saving..." : "Save Place"}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={deletePlace}
                          disabled={saving || deleting}
                          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                        >
                          {deleting ? "Deleting..." : "Delete Place"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {user && (
                  <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 14, marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)" }}>
                        Edit Suggestions
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                        {suggestionsLoading ? "Loading..." : `${suggestions.length} total`}
                      </div>
                    </div>
                    {suggestionsLoading ? (
                      <div style={{ padding: 10 }}><div className="spinner" /></div>
                    ) : suggestions.length === 0 ? (
                      <div style={{ color: "var(--text-light)", fontSize: 13 }}>No suggestions yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {suggestions.map(s => (
                          <div key={s.id} style={{ border: "1px solid var(--border-light)", borderRadius: 10, padding: "10px 12px", background: "rgba(201,168,76,0.05)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                              <div style={{ fontSize: 13 }}>
                                <strong>{s.displayName}</strong>
                                <span style={{ color: "var(--text-light)", marginLeft: 8 }}>{new Date(s.createdAt).toLocaleString()}</span>
                              </div>
                              <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: s.status === "accepted" ? "var(--success)" : s.status === "rejected" ? "var(--danger)" : "var(--gold)" }}>
                                {s.status}
                              </span>
                            </div>
                            {s.reason && <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Reason: {s.reason}</div>}
                            <div style={{ fontSize: 12, color: "var(--text-light)", marginBottom: 6 }}>
                              Suggested fields: {Object.keys(s.payload || {}).join(", ") || "None"}
                            </div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "var(--text-muted)", background: "var(--bg)", padding: 8, borderRadius: 6, border: "1px solid var(--border-light)" }}>
{JSON.stringify(s.payload || {}, null, 2)}
                            </pre>
                            {user.isAdmin && s.status === "pending" && (
                              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <button className="btn btn-primary btn-sm" onClick={() => acceptSuggestion(s.id)}>Accept</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => rejectSuggestion(s.id)}>Reject</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
                        <div
                          key={`${citation.workSlug}-${citation.lineNumber}-${idx}`}
                          style={{
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
                          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => nav(`/read/${citation.workSlug}?line=${citation.lineNumber}`)}
                            >
                              Open In Reader
                            </button>
                            {user?.isAdmin && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => excludeCitationMatch(citation)}
                              >
                                Not Place
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {user?.isAdmin && (
                    <div style={{ marginTop: 14, borderTop: "1px solid var(--border-light)", paddingTop: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)" }}>
                          Excluded Citation Matches
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                          {citationExclusionsLoading ? "Loading..." : `${citationExclusions.length} excluded`}
                        </div>
                      </div>
                      {citationExclusionsLoading ? (
                        <div style={{ padding: 10 }}><div className="spinner" /></div>
                      ) : citationExclusions.length === 0 ? (
                        <div style={{ fontSize: 13, color: "var(--text-light)" }}>
                          No excluded citation matches.
                        </div>
                      ) : (
                        <div style={{ display: "grid", gap: 8 }}>
                          {citationExclusions.map((item) => (
                            <div key={item.id} style={{ border: "1px solid var(--border-light)", borderRadius: 10, padding: "8px 10px", background: "rgba(122,30,46,0.04)" }}>
                              <div style={{ fontSize: 13, marginBottom: 6 }}>
                                <strong>{workTitleBySlug[item.workSlug] || item.workSlug}</strong>
                                <span style={{ color: "var(--text-light)", marginLeft: 8 }}>Line {item.lineNumber}</span>
                              </div>
                              {item.lineText && (
                                <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 6 }}>
                                  {item.lineText}
                                </div>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => restoreCitationExclusion(item.id)}
                              >
                                Restore Match
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
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
