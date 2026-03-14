function normalizeGlossaryTerm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z']/g, "")
    .replace(/^'+|'+$/g, "");
}

function uniqueTerms(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const normalized = normalizeGlossaryTerm(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function buildLookupCandidates(value) {
  const word = normalizeGlossaryTerm(value);
  if (!word) return [];

  return uniqueTerms([
    word,
    word.endsWith("ies") && word.length > 4 ? `${word.slice(0, -3)}y` : "",
    word.endsWith("es") && word.length > 4 ? word.slice(0, -2) : "",
    word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : "",
    word.endsWith("ed") && word.length > 4 ? word.slice(0, -2) : "",
    word.endsWith("ed") && word.length > 4 ? `${word.slice(0, -2)}e` : "",
    word.endsWith("ing") && word.length > 5 ? word.slice(0, -3) : "",
    word.endsWith("ing") && word.length > 5 ? `${word.slice(0, -3)}e` : "",
    word.endsWith("eth") && word.length > 5 ? word.slice(0, -3) : "",
    word.endsWith("est") && word.length > 5 ? word.slice(0, -3) : "",
  ]);
}

function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(",");
}

function rankByCandidates(rows, key, candidates) {
  if (!rows.length) return null;
  return rows
    .slice()
    .sort((a, b) => {
      const aRank = candidates.indexOf(String(a[key] || ""));
      const bRank = candidates.indexOf(String(b[key] || ""));
      return (aRank === -1 ? 999 : aRank) - (bRank === -1 ? 999 : bRank);
    })[0];
}

function getWorkBySlug(db, workSlug) {
  if (!workSlug) return null;
  return db.prepare("SELECT id, slug, title FROM works WHERE slug=?").get(String(workSlug || "").trim()) || null;
}

function getVariantsForEntry(db, entryId) {
  if (!entryId) return [];
  return db.prepare("SELECT variant FROM glossary_variants WHERE entry_id=? ORDER BY variant").all(entryId).map((row) => row.variant);
}

function serializeEntry(db, row, matchedVariant = "") {
  if (!row) return null;
  return {
    id: row.id,
    headword: row.headword,
    definition: row.definition,
    sourceLabel: row.source_label || "",
    variants: getVariantsForEntry(db, row.id),
    matchedVariant: matchedVariant || "",
  };
}

function serializeOverride(row, scope, work) {
  if (!row) return null;
  return {
    id: row.id,
    scope,
    headword: row.normalized_word,
    lookupTerm: row.normalized_word,
    definition: row.definition,
    sourceLabel: row.source_label || "",
    workSlug: work?.slug || null,
    lineId: row.line_id || "",
  };
}

function findGlobalEntry(db, candidates) {
  if (!candidates.length) return null;
  const clause = placeholders(candidates.length);

  const headwordRows = db.prepare(`SELECT * FROM glossary_entries WHERE headword IN (${clause})`).all(...candidates);
  const headwordMatch = rankByCandidates(headwordRows, "headword", candidates);
  if (headwordMatch) return { entry: headwordMatch, matchedVariant: "" };

  const variantRows = db.prepare(`
    SELECT v.variant, e.*
    FROM glossary_variants v
    JOIN glossary_entries e ON e.id=v.entry_id
    WHERE v.variant IN (${clause})
  `).all(...candidates);
  const variantMatch = rankByCandidates(variantRows, "variant", candidates);
  if (!variantMatch) return null;

  return { entry: variantMatch, matchedVariant: variantMatch.variant };
}

function findOverride(db, workId, lineId, candidates) {
  if (!workId || !candidates.length) return null;
  const clause = placeholders(candidates.length);
  const rows = db.prepare(`
    SELECT *
    FROM glossary_overrides
    WHERE work_id=? AND line_id=? AND normalized_word IN (${clause})
  `).all(workId, lineId || "", ...candidates);
  return rankByCandidates(rows, "normalized_word", candidates);
}

function resolveGlossary(db, { word, workSlug = "", lineId = "", includeEditorial = false } = {}) {
  const normalizedWord = normalizeGlossaryTerm(word);
  const candidates = buildLookupCandidates(word);
  const work = getWorkBySlug(db, workSlug);
  const safeLineId = String(lineId || "").trim() && String(lineId || "") !== "u" ? String(lineId || "").trim() : "";

  const lineOverride = work && safeLineId ? findOverride(db, work.id, safeLineId, candidates) : null;
  const workOverride = work ? findOverride(db, work.id, "", candidates) : null;
  const globalMatch = findGlobalEntry(db, candidates);

  const gloss = lineOverride
    ? serializeOverride(lineOverride, "line", work)
    : workOverride
      ? serializeOverride(workOverride, "work", work)
      : globalMatch
        ? { ...serializeEntry(db, globalMatch.entry, globalMatch.matchedVariant), scope: "global" }
        : null;

  const editorial = includeEditorial
    ? {
        globalEntry: globalMatch ? serializeEntry(db, globalMatch.entry, globalMatch.matchedVariant) : null,
        workOverride: work ? serializeOverride(workOverride, "work", work) : null,
        lineOverride: work && safeLineId ? serializeOverride(lineOverride, "line", work) : null,
      }
    : null;

  return {
    normalizedWord,
    candidates,
    work,
    gloss,
    editorial,
  };
}

module.exports = {
  buildLookupCandidates,
  getWorkBySlug,
  normalizeGlossaryTerm,
  resolveGlossary,
  serializeEntry,
};
