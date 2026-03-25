const db = require("../db");

function normalizeWorkRef(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bthe\s+/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function ordinalWord(number) {
  return ({ 1: "first", 2: "second", 3: "third", 4: "fourth" }[number] || `${number}th`);
}

function buildWorkAliases(work) {
  const aliases = new Set();
  const title = String(work?.title || "").trim();
  const slug = String(work?.slug || "").trim();
  if (!title && !slug) return aliases;

  if (slug) aliases.add(normalizeWorkRef(slug));
  if (title) aliases.add(normalizeWorkRef(title));

  const match = title.match(/^(.*?),\s*Part\s+(\d+)$/i);
  if (match) {
    const base = match[1].trim();
    const partNumber = Number(match[2]);
    const normalizedBase = normalizeWorkRef(base);
    aliases.add(normalizeWorkRef(`${base} Part ${partNumber}`));
    aliases.add(normalizeWorkRef(`${partNumber} ${base}`));
    aliases.add(normalizeWorkRef(`${ordinalWord(partNumber)} Part of ${base}`));
    aliases.add(normalizeWorkRef(`${base} ${partNumber}`));
    aliases.add(normalizedBase ? `${partNumber} ${normalizedBase}` : "");
  }

  return new Set([...aliases].filter(Boolean));
}

function listWorks() {
  return db.prepare("SELECT slug, title, category FROM works ORDER BY title").all();
}

function workPreferenceScore(work) {
  const slug = String(work?.slug || "");
  const category = String(work?.category || "");
  if (category === "first_folio" || slug.startsWith("f1-")) return 3;
  if (category === "apocrypha" || slug.startsWith("apo-")) return 2;
  return 1;
}

function editionKeyForWork(work) {
  const slug = String(work?.slug || "");
  const category = String(work?.category || "");
  const variant = String(work?.variant || "");
  if (category === "first_folio" || slug.startsWith("f1-") || variant === "first-folio") return "first-folio";
  if (category === "apocrypha" || slug.startsWith("apo-") || variant === "ps-apocrypha") return "apocrypha";
  if (variant === "ps" || variant === "ps-poems") return "modern";
  return "edition";
}

function editionLabelForWork(work) {
  switch (editionKeyForWork(work)) {
    case "first-folio":
      return "First Folio";
    case "apocrypha":
      return "Apocrypha";
    case "modern":
      return "Modern";
    default:
      return String(work?.variant || "").trim() || "Edition";
  }
}

function compareWorkPreference(left, right) {
  const scoreDiff = workPreferenceScore(left) - workPreferenceScore(right);
  if (scoreDiff !== 0) return scoreDiff;
  return String(left?.slug || "").localeCompare(String(right?.slug || ""));
}

function buildWorkLookup(works = listWorks()) {
  const bySlug = new Map();
  const byAlias = new Map();

  works.forEach((work) => {
    bySlug.set(work.slug, work);
    buildWorkAliases(work).forEach((alias) => {
      const existing = byAlias.get(alias);
      if (!existing || compareWorkPreference(work, existing) < 0) byAlias.set(alias, work);
    });
  });

  return { works, bySlug, byAlias };
}

function resolveWork(value, lookup = buildWorkLookup()) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (lookup.bySlug.has(raw)) return lookup.bySlug.get(raw);
  const normalized = normalizeWorkRef(raw);
  return lookup.byAlias.get(normalized) || null;
}

function resolveWorkSlugs(values, lookup = buildWorkLookup()) {
  const result = [];
  const seen = new Set();
  const list = Array.isArray(values) ? values : [values];
  list.forEach((value) => {
    const work = resolveWork(value, lookup);
    if (work && !seen.has(work.slug)) {
      seen.add(work.slug);
      result.push(work.slug);
    }
  });
  return result;
}

function workRefsFromSlugs(slugs, lookup = buildWorkLookup()) {
  return resolveWorkSlugs(slugs, lookup)
    .map((slug) => lookup.bySlug.get(slug))
    .filter(Boolean)
    .map((work) => ({ slug: work.slug, title: work.title, category: work.category }));
}

function equivalentWorkSlugs(value, lookup = buildWorkLookup()) {
  const work = typeof value === "string" && lookup.bySlug.has(value)
    ? lookup.bySlug.get(value)
    : resolveWork(value, lookup);
  if (!work) return [];
  const familyKey = normalizeWorkRef(work.title);
  return lookup.works
    .filter((candidate) => normalizeWorkRef(candidate.title) === familyKey)
    .sort(compareWorkPreference)
    .map((candidate) => candidate.slug);
}

function equivalentWorks(value, lookup = buildWorkLookup()) {
  return equivalentWorkSlugs(value, lookup)
    .map((slug) => lookup.bySlug.get(slug))
    .filter(Boolean);
}

function enrichWork(work, lookup = buildWorkLookup()) {
  if (!work) return null;
  const familyWorks = equivalentWorks(work, lookup);
  const primary = familyWorks[0] || work;
  const editionLabel = editionLabelForWork(work);
  return {
    ...work,
    editionKey: editionKeyForWork(work),
    editionLabel,
    familySlug: primary.slug,
    familyTitle: primary.title,
    familySize: familyWorks.length || 1,
    hasAlternateEdition: familyWorks.length > 1,
    isPrimaryEdition: primary.slug === work.slug,
    selectorLabel: familyWorks.length > 1 ? `${work.title} — ${editionLabel}` : work.title,
    familySelectorLabel: primary.title,
  };
}

function enrichWorks(works, lookup = buildWorkLookup(works)) {
  return (works || []).map((work) => enrichWork(work, lookup));
}

module.exports = {
  normalizeWorkRef,
  buildWorkAliases,
  listWorks,
  workPreferenceScore,
  editionKeyForWork,
  editionLabelForWork,
  compareWorkPreference,
  buildWorkLookup,
  resolveWork,
  resolveWorkSlugs,
  workRefsFromSlugs,
  equivalentWorkSlugs,
  equivalentWorks,
  enrichWork,
  enrichWorks,
};
