const express = require("express");
const db = require("../db");
const { resolveGlossary } = require("../lib/glossary");
const {
  normalizeWord,
  scopeVariants,
  countLinesPerWork,
  fetchLines,
  getWorkTokenTotals,
} = require("../lib/corpus");

const r = express.Router();

/* Glossary lookups keep interior apostrophes ("lov'd"); corpus queries strip them. */
function sanitizeGlossaryWord(value) {
  return String(value || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z']/g, "");
}

function buildSnippet(lineText, word) {
  const text = String(lineText || "").replace(/\s+/g, " ").trim();
  if (text.length <= 120) return text;

  // Trim long prose lines to a window around the first match.
  const pattern = new RegExp(`\\b${word.split("").join("[’']?")}\\b`, "i");
  const match = pattern.exec(text);
  const at = match ? match.index : 0;
  const start = Math.max(0, at - 46);
  const end = Math.min(text.length, at + word.length + 60);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet += "…";
  return snippet;
}

/*
 * Word lookup for the reader popover: editorial glossary first, then corpus
 * frequency and examples from the line search index (all editions, so counts
 * match whichever text the reader has open).
 */
r.get("/:word", (req, res) => {
  const word = normalizeWord(req.params.word);
  const glossaryWord = sanitizeGlossaryWord(req.params.word);
  if (!word || word.length < 2) return res.status(400).json({ error: "Word too short." });

  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");

  const workSlug = String(req.query.work || "").trim();
  const lineId = String(req.query.lineId || "").trim();

  // Counts cover the canonical texts plus apocrypha; First Folio reprints are
  // excluded so the same play is not double-counted.
  const variants = scopeVariants("all");
  const perWork = countLinesPerWork(db, [word], variants);
  const totalCount = perWork.reduce((sum, row) => sum + row.lines, 0);
  const scopeSlugs = db.prepare(`
    SELECT DISTINCT work_slug AS slug FROM work_search_lines
    WHERE variant IN (${variants.map(() => "?").join(",")})
  `).all(...variants);
  const tokenTotals = getWorkTokenTotals(db);
  const totalTokens = scopeSlugs.reduce((sum, row) => sum + (tokenTotals.get(row.slug) || 0), 0);

  const examples = [];
  // The reader may have any edition open (including First Folio); its own
  // examples come first, then canonical works by frequency.
  const preferredRows = workSlug ? fetchLines(db, [word], null, { workSlug, limit: 2 }) : [];
  preferredRows.forEach((row) => {
    examples.push({
      work: row.title,
      slug: row.slug,
      lineNumber: row.displayLineNumber || row.lineNumber,
      snippet: buildSnippet(row.lineText, word),
    });
  });
  for (const row of perWork) {
    if (examples.length >= 5) break;
    if (row.slug === workSlug) continue;
    fetchLines(db, [word], variants, { workSlug: row.slug, limit: 2 }).forEach((line) => {
      if (examples.length >= 5) return;
      examples.push({
        work: line.title,
        slug: line.slug,
        lineNumber: line.displayLineNumber || line.lineNumber,
        snippet: buildSnippet(line.lineText, word),
      });
    });
  }

  const glossary = resolveGlossary(db, {
    word: glossaryWord,
    workSlug,
    lineId,
    includeEditorial: !!req.user?.canPublishGlobal,
  });

  res.json({
    word: glossaryWord || word,
    totalCount,
    worksAppearingIn: perWork.length,
    relativeFrequency: totalTokens > 0 ? totalCount / totalTokens : 0,
    frequency: perWork.map((row) => ({ title: row.title, slug: row.slug, count: row.lines })),
    examples,
    gloss: glossary.gloss,
    editorial: glossary.editorial,
    normalizedWord: glossary.normalizedWord,
  });
});

/* Autocomplete over the vocabulary table (derived from the line search index). */
r.get("/", (req, res) => {
  const prefix = normalizeWord(req.query.prefix || "");
  if (!prefix || prefix.length < 2) return res.json([]);
  res.set("Cache-Control", "public, max-age=3600");
  const words = db.prepare(`
    SELECT word, SUM(count) as total FROM word_index
    WHERE word LIKE ? GROUP BY word ORDER BY total DESC LIMIT 20
  `).all(`${prefix}%`);
  res.json(words);
});

module.exports = r;
