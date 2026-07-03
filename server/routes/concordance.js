const express = require("express");
const db = require("../db");
const { resolveGlossary } = require("../lib/glossary");
const { compositionYear } = require("../lib/workChronology");

const r = express.Router();

/*
 * Concordance queries run against work_search_lines / work_search_fts, whose
 * normalized_text strips punctuation and apostrophes ("lov'd" -> "lovd").
 * Words handled here are normalized the same way.
 */

const SCOPES = {
  canon: ["ps", "ps-poems"],
  all: ["ps", "ps-poems", "ps-apocrypha"],
};

// Above this many matching lines we fall back to SQL aggregates only
// (per-work and per-speaker counts) and skip occurrence counts and collocates.
const FULL_SCAN_LINE_LIMIT = 20000;

const STOPWORDS = new Set([
  "the", "and", "to", "of", "in", "that", "is", "it", "not", "for", "with",
  "his", "her", "him", "she", "he", "you", "your", "my", "me", "we", "us",
  "our", "they", "them", "their", "this", "these", "those", "but", "be",
  "as", "at", "by", "on", "or", "an", "are", "was", "were", "will", "shall",
  "so", "if", "no", "nor", "do", "did", "have", "has", "had", "what", "when",
  "which", "who", "whom", "how", "then", "there", "here", "from", "all",
  "would", "should", "could", "may", "might", "must", "am", "been", "than",
  "too", "unto", "upon", "out", "up", "now", "let", "yet", "thee", "thou",
  "thy", "thine", "ye", "hath", "doth", "tis", "er", "st", "th", "ll", "ere",
  "come", "go", "well", "good", "more", "most", "such", "some", "one", "two",
  "man", "men", "like", "make", "made", "say", "said", "see", "know", "give",
  "take", "can", "cannot", "where", "why", "against", "before", "after",
  "into", "again", "away", "much", "many", "any", "every", "own", "other",
  "himself", "herself", "myself", "thyself", "itself", "yourself",
]);

function normalizeWord(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z]/g, "");
}

function scopeVariants(scope) {
  return SCOPES[scope === "all" ? "all" : "canon"];
}

function variantPlaceholders(variants) {
  return variants.map(() => "?").join(",");
}

function ftsMatchExpression(forms) {
  return `normalized_text : (${forms.map((form) => `"${form}"`).join(" OR ")})`;
}

function parseForms(rawForms, word) {
  const forms = new Set([word]);
  String(rawForms || "")
    .split(",")
    .map((form) => normalizeWord(form))
    .filter((form) => form.length >= 2 && form.length <= 30)
    .forEach((form) => forms.add(form));
  return [...forms].filter((form) => form.length >= 2);
}

/* --- corpus token totals per work (for per-10k rates), computed once --- */
let workTokenTotals = null;
function getWorkTokenTotals() {
  if (!workTokenTotals) {
    workTokenTotals = new Map();
    db.prepare(`
      SELECT work_slug AS slug,
             SUM(length(normalized_text) - length(replace(normalized_text, ' ', '')) + 1) AS tokens
      FROM work_search_lines
      WHERE normalized_text != ''
      GROUP BY work_slug
    `).all().forEach((row) => workTokenTotals.set(row.slug, row.tokens || 0));
  }
  return workTokenTotals;
}

/* --- global token frequencies (collocate background), computed once --- */
let globalTokenFreq = null;
function getGlobalTokenFreq() {
  if (!globalTokenFreq) {
    const freq = new Map();
    let total = 0;
    const rows = db.prepare(`
      SELECT normalized_text AS text FROM work_search_lines
      WHERE variant IN ('ps','ps-poems') AND normalized_text != ''
    `).all();
    rows.forEach(({ text }) => {
      text.split(" ").forEach((token) => {
        if (token.length < 2) return;
        freq.set(token, (freq.get(token) || 0) + 1);
        total += 1;
      });
    });
    globalTokenFreq = { freq, total: Math.max(1, total) };
  }
  return globalTokenFreq;
}

/* --- word form suggestions, verified against the corpus --- */
function candidateStems(word) {
  const stems = new Set([word]);
  const strip = (suffix) => {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      stems.add(word.slice(0, -suffix.length));
    }
  };
  ["ings", "ing", "eth", "est", "ies", "ied", "ed", "es", "st", "th", "s", "d"].forEach(strip);
  if (word.endsWith("ies")) stems.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ied")) stems.add(`${word.slice(0, -3)}y`);
  return [...stems];
}

function candidateForms(word) {
  const forms = new Set();
  candidateStems(word).forEach((stem) => {
    ["", "s", "es", "d", "ed", "ing", "ings", "st", "est", "eth", "th"].forEach((suffix) => {
      forms.add(stem + suffix);
    });
    if (stem.endsWith("e")) {
      const short = stem.slice(0, -1);
      ["ing", "ings"].forEach((suffix) => forms.add(short + suffix));
    }
    if (stem.endsWith("y") && stem.length > 3) {
      const short = stem.slice(0, -1);
      ["ies", "ied", "iest"].forEach((suffix) => forms.add(short + suffix));
    }
  });
  return [...forms].filter((form) => form.length >= 2 && form.length <= 30);
}

function suggestForms(word, variants) {
  const stmt = db.prepare(`
    SELECT count(*) AS n
    FROM work_search_fts f
    JOIN work_search_lines l ON l.id = f.rowid
    WHERE work_search_fts MATCH ? AND l.variant IN (${variantPlaceholders(variants)})
  `);
  const found = [];
  candidateForms(word).forEach((form) => {
    const n = stmt.get(ftsMatchExpression([form]), ...variants)?.n || 0;
    if (n > 0) found.push({ form, lines: n });
  });
  found.sort((a, b) => b.lines - a.lines);
  return found;
}

/* --- matched line retrieval --- */
function countMatchingLines(forms, variants, { workSlug = "", speaker = "" } = {}) {
  const params = [ftsMatchExpression(forms), ...variants];
  let where = `work_search_fts MATCH ? AND l.variant IN (${variantPlaceholders(variants)})`;
  if (workSlug) {
    where += " AND l.work_slug = ?";
    params.push(workSlug);
  }
  if (speaker) {
    where += " AND l.speaker = ?";
    params.push(speaker);
  }
  return db.prepare(`
    SELECT count(*) AS n
    FROM work_search_fts f
    JOIN work_search_lines l ON l.id = f.rowid
    WHERE ${where}
  `).get(...params)?.n || 0;
}

const LINE_COLUMNS = `
  l.work_slug AS slug, l.work_title AS title, l.category, l.variant,
  l.line_number AS lineNumber, l.display_line_number AS displayLineNumber,
  l.line_text AS lineText, l.normalized_text AS normalizedText,
  l.speaker, l.act_label AS actLabel, l.scene_label AS sceneLabel
`;

function fetchMatchingLines(forms, variants, { workSlug = "", speaker = "", limit = 0, offset = 0 } = {}) {
  const params = [ftsMatchExpression(forms), ...variants];
  let where = `work_search_fts MATCH ? AND l.variant IN (${variantPlaceholders(variants)})`;
  if (workSlug) {
    where += " AND l.work_slug = ?";
    params.push(workSlug);
  }
  if (speaker) {
    where += " AND l.speaker = ?";
    params.push(speaker);
  }
  let sql = `
    SELECT ${LINE_COLUMNS}
    FROM work_search_fts f
    JOIN work_search_lines l ON l.id = f.rowid
    WHERE ${where}
    ORDER BY l.work_id, l.line_number
  `;
  if (limit > 0) {
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);
  }
  return db.prepare(sql).all(...params);
}

/* --- summary aggregation --- */
const summaryCache = new Map();
const SUMMARY_CACHE_MAX = 60;

function cacheKey(forms, scope) {
  return `${scope}:${[...forms].sort().join(",")}`;
}

function rememberSummary(key, value) {
  if (summaryCache.size >= SUMMARY_CACHE_MAX) {
    const oldest = summaryCache.keys().next().value;
    summaryCache.delete(oldest);
  }
  summaryCache.set(key, value);
}

function buildWorkRow(slug, title, category, occurrences, lines) {
  const tokens = getWorkTokenTotals().get(slug) || 0;
  return {
    slug,
    title,
    category,
    year: compositionYear(slug),
    occurrences,
    lines,
    per10k: tokens > 0 ? +((occurrences / tokens) * 10000).toFixed(2) : 0,
  };
}

function summarizeFromRows(rows, forms) {
  const formRegex = new RegExp(`\\b(${forms.join("|")})\\b`, "g");
  const formSet = new Set(forms);
  const perWork = new Map();
  const perSpeaker = new Map();
  const collocateCounts = new Map();
  let occurrences = 0;

  rows.forEach((row) => {
    const matches = row.normalizedText.match(formRegex);
    const count = matches ? matches.length : 0;
    if (!count) return;
    occurrences += count;

    if (!perWork.has(row.slug)) {
      perWork.set(row.slug, { title: row.title, category: row.category, occurrences: 0, lines: 0 });
    }
    const workEntry = perWork.get(row.slug);
    workEntry.occurrences += count;
    workEntry.lines += 1;

    const speakerKey = row.speaker || "";
    if (!perSpeaker.has(speakerKey)) {
      perSpeaker.set(speakerKey, { occurrences: 0, lines: 0, works: new Set() });
    }
    const speakerEntry = perSpeaker.get(speakerKey);
    speakerEntry.occurrences += count;
    speakerEntry.lines += 1;
    speakerEntry.works.add(row.slug);

    row.normalizedText.split(" ").forEach((token) => {
      if (token.length < 3 || formSet.has(token) || STOPWORDS.has(token)) return;
      collocateCounts.set(token, (collocateCounts.get(token) || 0) + 1);
    });
  });

  const { freq: bgFreq, total: bgTotal } = getGlobalTokenFreq();
  const windowTokens = rows.reduce((sum, row) => sum + row.normalizedText.split(" ").length, 0) || 1;
  const collocates = [...collocateCounts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([token, count]) => {
      const expected = ((bgFreq.get(token) || 0.5) / bgTotal) * windowTokens;
      return { word: token, count, score: +(count * Math.log(count / Math.max(expected, 0.0001))).toFixed(2) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);

  return {
    occurrences,
    lines: rows.length,
    perWork: [...perWork.entries()]
      .map(([slug, entry]) => buildWorkRow(slug, entry.title, entry.category, entry.occurrences, entry.lines))
      .sort((a, b) => b.occurrences - a.occurrences),
    perSpeaker: [...perSpeaker.entries()]
      .map(([speaker, entry]) => ({
        speaker,
        occurrences: entry.occurrences,
        lines: entry.lines,
        workCount: entry.works.size,
      }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 20),
    collocates,
    approximate: false,
  };
}

function summarizeAggregateOnly(forms, variants) {
  const match = ftsMatchExpression(forms);
  const perWork = db.prepare(`
    SELECT l.work_slug AS slug, l.work_title AS title, l.category, count(*) AS lines
    FROM work_search_fts f
    JOIN work_search_lines l ON l.id = f.rowid
    WHERE work_search_fts MATCH ? AND l.variant IN (${variantPlaceholders(variants)})
    GROUP BY l.work_slug
    ORDER BY lines DESC
  `).all(match, ...variants);

  const perSpeaker = db.prepare(`
    SELECT l.speaker, count(*) AS lines, count(DISTINCT l.work_slug) AS workCount
    FROM work_search_fts f
    JOIN work_search_lines l ON l.id = f.rowid
    WHERE work_search_fts MATCH ? AND l.variant IN (${variantPlaceholders(variants)})
    GROUP BY l.speaker
    ORDER BY lines DESC
    LIMIT 20
  `).all(match, ...variants);

  const lines = perWork.reduce((sum, row) => sum + row.lines, 0);
  return {
    occurrences: lines,
    lines,
    perWork: perWork.map((row) => buildWorkRow(row.slug, row.title, row.category, row.lines, row.lines)),
    perSpeaker: perSpeaker.map((row) => ({
      speaker: row.speaker || "",
      occurrences: row.lines,
      lines: row.lines,
      workCount: row.workCount,
    })),
    collocates: [],
    approximate: true,
  };
}

function getSummary(forms, scope) {
  const key = cacheKey(forms, scope);
  if (summaryCache.has(key)) return summaryCache.get(key);

  const variants = scopeVariants(scope);
  const totalLines = countMatchingLines(forms, variants);
  const summary = totalLines > FULL_SCAN_LINE_LIMIT
    ? summarizeAggregateOnly(forms, variants)
    : summarizeFromRows(fetchMatchingLines(forms, variants), forms);

  rememberSummary(key, summary);
  return summary;
}

/* Summary: stats, forms, per-work, per-speaker, collocates, gloss. */
r.get("/:word", (req, res) => {
  const word = normalizeWord(req.params.word);
  if (!word || word.length < 2) return res.status(400).json({ error: "Word too short." });

  const scope = req.query.scope === "all" ? "all" : "canon";
  const variants = scopeVariants(scope);
  const forms = parseForms(req.query.forms, word);

  try {
    const suggestedForms = suggestForms(word, variants);
    const summary = getSummary(forms, scope);
    const totals = getWorkTokenTotals();
    const scopeTokens = db.prepare(`
      SELECT DISTINCT work_slug AS slug FROM work_search_lines WHERE variant IN (${variantPlaceholders(variants)})
    `).all(...variants).reduce((sum, row) => sum + (totals.get(row.slug) || 0), 0);

    const glossary = resolveGlossary(db, {
      word,
      workSlug: "",
      lineId: "",
      includeEditorial: false,
    });

    res.json({
      word,
      scope,
      activeForms: forms,
      suggestedForms,
      gloss: glossary.gloss || null,
      stats: {
        occurrences: summary.occurrences,
        lines: summary.lines,
        works: summary.perWork.length,
        per10k: scopeTokens > 0 ? +((summary.occurrences / scopeTokens) * 10000).toFixed(2) : 0,
        approximate: summary.approximate,
      },
      perWork: summary.perWork,
      perSpeaker: summary.perSpeaker,
      collocates: summary.collocates,
    });
  } catch (err) {
    console.error("Concordance summary failed:", err);
    res.status(500).json({ error: "Concordance lookup failed." });
  }
});

/* Paginated KWIC lines, filterable by work and speaker. */
r.get("/:word/lines", (req, res) => {
  const word = normalizeWord(req.params.word);
  if (!word || word.length < 2) return res.status(400).json({ error: "Word too short." });

  const scope = req.query.scope === "all" ? "all" : "canon";
  const variants = scopeVariants(scope);
  const forms = parseForms(req.query.forms, word);
  const workSlug = String(req.query.work || "").trim();
  const speaker = String(req.query.speaker || "").trim();
  const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize || "50", 10) || 50));

  try {
    const total = countMatchingLines(forms, variants, { workSlug, speaker });
    const rows = fetchMatchingLines(forms, variants, {
      workSlug,
      speaker,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    res.json({
      total,
      page,
      pageSize,
      lines: rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        category: row.category,
        lineNumber: row.lineNumber,
        displayLineNumber: row.displayLineNumber,
        lineText: row.lineText,
        speaker: row.speaker,
        actLabel: row.actLabel,
        sceneLabel: row.sceneLabel,
      })),
    });
  } catch (err) {
    console.error("Concordance lines failed:", err);
    res.status(500).json({ error: "Concordance lookup failed." });
  }
});

module.exports = r;
