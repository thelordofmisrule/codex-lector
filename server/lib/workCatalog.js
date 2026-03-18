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

function buildWorkLookup(works = listWorks()) {
  const bySlug = new Map();
  const byAlias = new Map();

  works.forEach((work) => {
    bySlug.set(work.slug, work);
    buildWorkAliases(work).forEach((alias) => {
      if (!byAlias.has(alias)) byAlias.set(alias, work);
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

module.exports = {
  normalizeWorkRef,
  buildWorkAliases,
  listWorks,
  buildWorkLookup,
  resolveWork,
  resolveWorkSlugs,
  workRefsFromSlugs,
};
