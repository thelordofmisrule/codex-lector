import { useEffect, useMemo, useRef, useState } from "react";

const LEAFLET_CSS_ID = "codex-leaflet-css";
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const FALLBACK_CENTER = [45.2, 12.0];
const FALLBACK_ZOOM = 4;

let leafletLoader = null;

function ensureLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("Leaflet requires a browser."));
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoader) return leafletLoader;

  leafletLoader = new Promise((resolve, reject) => {
    if (!document.getElementById(LEAFLET_CSS_ID)) {
      const link = document.createElement("link");
      link.id = LEAFLET_CSS_ID;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Could not load map library."));
    document.body.appendChild(script);
  });

  return leafletLoader;
}

function validPlaces(places) {
  return (places || []).map((place) => {
    const lat = Number(place?.lat);
    const lng = Number(place?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { ...place, lat, lng } : null;
  }).filter(Boolean);
}

export default function PlacesMap({
  places = [],
  selectedSlug = "",
  showAll = false,
  onSelect = () => {},
  minHeight = 560,
}) {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const points = useMemo(() => validPlaces(places), [places]);

  useEffect(() => {
    let cancelled = false;
    ensureLeaflet().then((L) => {
      if (cancelled || !mapNodeRef.current || mapRef.current) return;
      const map = L.map(mapNodeRef.current, {
        center: FALLBACK_CENTER,
        zoom: FALLBACK_ZOOM,
      });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION }).addTo(map);
      const markerLayer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = markerLayer;
      setReady(true);
      setError("");
    }).catch((e) => {
      if (cancelled) return;
      setError(e.message || "Could not initialize map.");
    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current || !window.L) return;
    const L = window.L;
    const map = mapRef.current;
    const layer = layerRef.current;
    layer.clearLayers();

    if (!points.length) {
      map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
      return;
    }

    const bounds = L.latLngBounds([]);
    let selectedLatLng = null;
    points.forEach((place) => {
      const isSelected = place.slug === selectedSlug;
      const marker = L.circleMarker([place.lat, place.lng], {
        radius: isSelected ? 7 : 5,
        weight: isSelected ? 2 : 1,
        color: isSelected ? "#7A2E1E" : "#5C4E38",
        fillColor: isSelected ? "#A34030" : "#C9A84C",
        fillOpacity: isSelected ? 0.92 : 0.7,
      });
      marker.bindTooltip(place.name, { direction: "top", offset: [0, -4] });
      marker.on("click", () => onSelect(place.slug));
      marker.addTo(layer);
      bounds.extend([place.lat, place.lng]);
      if (isSelected) selectedLatLng = [place.lat, place.lng];
    });

    if (!showAll && selectedLatLng) {
      map.setView(selectedLatLng, Math.max(map.getZoom(), 6));
      return;
    }
    map.fitBounds(bounds.pad(0.2), { maxZoom: showAll ? 6 : 7 });
  }, [points, selectedSlug, ready, showAll, onSelect]);

  return (
    <div style={{ position: "relative", minHeight, borderRadius: 14, border: "1px solid var(--border-light)", overflow: "hidden", background: "rgba(244,240,229,0.9)" }}>
      {!error && !ready && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(250,246,237,0.85)", zIndex: 2 }}>
          <div className="spinner" />
        </div>
      )}
      {error && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20, textAlign: "center", color: "var(--danger)", background: "rgba(250,246,237,0.95)", zIndex: 2 }}>
          <div>{error}</div>
        </div>
      )}
      <div ref={mapNodeRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
