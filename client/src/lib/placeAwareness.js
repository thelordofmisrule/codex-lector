import { places as placesApi } from "./api";

let cachedIndexPromise = null;

function normalizePlaceTerm(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectionCandidates(text) {
  const raw = String(text || "").trim();
  const candidates = new Set();
  const normalized = normalizePlaceTerm(raw);
  if (normalized) candidates.add(normalized);

  if (/['’]s\b/i.test(raw)) {
    const stripped = normalizePlaceTerm(raw.replace(/['’]s\b/gi, ""));
    if (stripped) candidates.add(stripped);
  }

  return Array.from(candidates);
}

function buildPlaceTerms(place) {
  return [
    { value: place.name, kind: "name", priority: 0 },
    { value: place.modernName, kind: "modern", priority: 1 },
    ...((place.aliases || []).map((alias) => ({ value: alias, kind: "alias", priority: 2 }))),
  ]
    .map((entry) => ({
      ...entry,
      normalized: normalizePlaceTerm(entry.value),
    }))
    .filter((entry) => entry.normalized);
}

function buildIndex(places) {
  const byTerm = new Map();

  for (const place of places) {
    for (const term of buildPlaceTerms(place)) {
      const existing = byTerm.get(term.normalized) || [];
      existing.push({
        slug: place.slug,
        place,
        matchedTerm: term.value,
        matchedKind: term.kind,
        priority: term.priority,
      });
      byTerm.set(term.normalized, existing);
    }
  }

  for (const [term, matches] of byTerm.entries()) {
    byTerm.set(term, matches.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return String(a.place.name || "").localeCompare(String(b.place.name || ""));
    }));
  }

  return { byTerm };
}

export function warmPlaceAwarenessIndex() {
  if (!cachedIndexPromise) {
    cachedIndexPromise = placesApi.list("", true)
      .then((data) => buildIndex(data?.places || []))
      .catch((error) => {
        cachedIndexPromise = null;
        throw error;
      });
  }
  return cachedIndexPromise;
}

export async function findPlaceAwarenessMatch(text) {
  const candidates = selectionCandidates(text);
  if (!candidates.length) return null;
  const index = await warmPlaceAwarenessIndex();

  for (const candidate of candidates) {
    const match = index.byTerm.get(candidate)?.[0];
    if (match) return match;
  }

  return null;
}
