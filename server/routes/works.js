const express = require("express");
const db = require("../db");
const { ensureSearchSchema } = require("../lib/workSearchIndex");
const {
  buildFtsQuery,
  buildSearchSnippet,
  computeSearchScore,
  extractSearchLines,
  matchesParsedQuery,
  parseSearchQuery,
} = require("../lib/workSearch");

const r = express.Router();
ensureSearchSchema(db);

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function hasSearchFts() {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE name='work_search_fts'").get();
  return !!row;
}

function hasIndexedSearchRows() {
  const row = db.prepare("SELECT COUNT(*) AS count FROM work_search_lines").get();
  return !!row?.count;
}

function selectWorksForSearch(workSlug, category) {
  const conditions = ["content IS NOT NULL"];
  const params = [];

  if (workSlug) {
    conditions.push("slug = ?");
    params.push(workSlug);
  }
  if (category && category !== "all") {
    conditions.push("category = ?");
    params.push(category);
  }

  return db.prepare(`
    SELECT id, slug, title, category, variant, content
    FROM works
    WHERE ${conditions.join(" AND ")}
    ORDER BY title
  `).all(...params);
}

function formatIndexedRow(row, parsed) {
  const metrics = computeSearchScore({
    lineText: row.line_text,
    normalizedText: row.normalized_text,
    speaker: row.speaker,
  }, parsed, row.rank);

  return {
    id: row.id,
    slug: row.work_slug,
    title: row.work_title,
    category: row.category,
    variant: row.variant,
    lineNumber: row.line_number,
    displayLineNumber: row.display_line_number,
    lineText: row.line_text,
    snippet: buildSearchSnippet(row.line_text, parsed),
    prevText: row.prev_text,
    nextText: row.next_text,
    speaker: row.speaker,
    actLabel: row.act_label,
    sceneLabel: row.scene_label,
    sectionLabel: row.section_label,
    locationLabel: row.location_label,
    score: metrics.score,
    matchedTerms: metrics.matchedTerms,
    exactPhrase: metrics.exactPhrase,
    rank: row.rank,
  };
}

function formatFallbackRow(work, row, parsed) {
  const metrics = computeSearchScore(row, parsed);
  return {
    id: `${work.slug}:${row.lineNumber}`,
    slug: work.slug,
    title: work.title,
    category: work.category,
    variant: work.variant,
    lineNumber: row.lineNumber,
    displayLineNumber: row.displayLineNumber || row.lineNumber,
    lineText: row.lineText,
    snippet: buildSearchSnippet(row.lineText, parsed),
    prevText: row.prevText || "",
    nextText: row.nextText || "",
    speaker: row.speaker || "",
    actLabel: row.actLabel || "",
    sceneLabel: row.sceneLabel || "",
    sectionLabel: row.sectionLabel || "",
    locationLabel: row.locationLabel || "",
    score: metrics.score,
    matchedTerms: metrics.matchedTerms,
    exactPhrase: metrics.exactPhrase,
    rank: null,
  };
}

function buildGroupedResults(rows, matchCounts, limit, perWork) {
  const grouped = new Map();
  let showingMatches = 0;

  for (const row of rows) {
    if (showingMatches >= limit) break;
    let group = grouped.get(row.slug);
    if (!group) {
      group = {
        slug: row.slug,
        title: row.title,
        category: row.category,
        variant: row.variant,
        matchCount: matchCounts.get(row.slug) || 0,
        bestScore: row.score,
        matches: [],
      };
      grouped.set(row.slug, group);
    }
    if (group.matches.length >= perWork) continue;

    group.bestScore = Math.max(group.bestScore, row.score);
    group.matches.push({
      id: row.id,
      lineNumber: row.lineNumber,
      displayLineNumber: row.displayLineNumber,
      lineText: row.lineText,
      snippet: row.snippet,
      prevText: row.prevText,
      nextText: row.nextText,
      speaker: row.speaker,
      actLabel: row.actLabel,
      sceneLabel: row.sceneLabel,
      sectionLabel: row.sectionLabel,
      locationLabel: row.locationLabel,
      score: row.score,
      exactPhrase: row.exactPhrase,
    });
    showingMatches += 1;
  }

  const results = Array.from(grouped.values()).sort((a, b) => {
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    return a.title.localeCompare(b.title);
  });

  return { results, showingMatches };
}

function searchIndexed(parsed, options) {
  const { workSlug, category, limit, perWork } = options;
  const ftsQuery = buildFtsQuery(parsed);
  if (!ftsQuery || !hasSearchFts() || !hasIndexedSearchRows()) return null;

  const where = ["work_search_fts MATCH ?"];
  const params = [ftsQuery];

  if (workSlug) {
    where.push("l.work_slug = ?");
    params.push(workSlug);
  }
  if (category && category !== "all") {
    where.push("l.category = ?");
    params.push(category);
  }

  const whereSql = where.join(" AND ");

  const totals = db.prepare(`
    SELECT COUNT(*) AS totalMatches, COUNT(DISTINCT l.work_id) AS totalWorks
    FROM work_search_fts
    JOIN work_search_lines l ON l.id = work_search_fts.rowid
    WHERE ${whereSql}
  `).get(...params);

  if (!totals?.totalMatches) {
    return { indexed: true, totalMatches: 0, totalWorks: 0, showingMatches: 0, results: [] };
  }

  const matchCountRows = db.prepare(`
    SELECT l.work_slug AS slug, COUNT(*) AS matchCount
    FROM work_search_fts
    JOIN work_search_lines l ON l.id = work_search_fts.rowid
    WHERE ${whereSql}
    GROUP BY l.work_slug
  `).all(...params);
  const matchCounts = new Map(matchCountRows.map((row) => [row.slug, row.matchCount]));

  const candidateLimit = Math.max(limit * 6, perWork * 30, 120);
  const candidateRows = db.prepare(`
    SELECT l.*, bm25(work_search_fts, 12.0, 3.0) AS rank
    FROM work_search_fts
    JOIN work_search_lines l ON l.id = work_search_fts.rowid
    WHERE ${whereSql}
    ORDER BY rank
    LIMIT ?
  `).all(...params, candidateLimit);

  const scoredRows = candidateRows
    .map((row) => formatIndexedRow(row, parsed))
    .filter((row) => matchesParsedQuery(row, parsed))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.rank ?? Infinity) !== (b.rank ?? Infinity)) return (a.rank ?? Infinity) - (b.rank ?? Infinity);
      return a.lineNumber - b.lineNumber;
    });

  const grouped = buildGroupedResults(scoredRows, matchCounts, limit, perWork);
  return {
    indexed: true,
    totalMatches: totals.totalMatches,
    totalWorks: totals.totalWorks,
    showingMatches: grouped.showingMatches,
    results: grouped.results,
  };
}

function searchFallback(parsed, options) {
  const { workSlug, category, limit, perWork } = options;
  const works = selectWorksForSearch(workSlug, category);
  const matchCounts = new Map();
  const rows = [];

  for (const work of works) {
    const extracted = extractSearchLines(work.content || "");
    let localMatches = 0;

    for (const line of extracted) {
      if (!matchesParsedQuery(line, parsed)) continue;
      rows.push(formatFallbackRow(work, line, parsed));
      localMatches += 1;
    }

    if (localMatches > 0) matchCounts.set(work.slug, localMatches);
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.lineNumber - b.lineNumber;
  });

  const grouped = buildGroupedResults(rows, matchCounts, limit, perWork);
  let totalMatches = 0;
  for (const count of matchCounts.values()) totalMatches += count;

  return {
    indexed: false,
    totalMatches,
    totalWorks: matchCounts.size,
    showingMatches: grouped.showingMatches,
    results: grouped.results,
  };
}

// List (no content)
r.get("/", (req, res) => {
  res.json(db.prepare("SELECT id,slug,title,category,variant,authors,(content IS NOT NULL) as has_content FROM works ORDER BY category,title").all());
});

// Ranked text search across works
r.get("/search/text", (req, res) => {
  const startedAt = Date.now();
  const query = String(req.query.q || "").trim();
  if (query.length < 2) {
    return res.json({
      query,
      exact: false,
      work: "",
      category: "all",
      totalMatches: 0,
      totalWorks: 0,
      showingMatches: 0,
      tookMs: 0,
      indexed: hasSearchFts(),
      results: [],
    });
  }

  const workSlug = String(req.query.work || "").trim();
  const category = String(req.query.category || "all").trim() || "all";
  const exact = String(req.query.exact || "") === "1";
  const limit = clampInt(req.query.limit, 6, 60, workSlug ? 18 : 24);
  const perWork = clampInt(req.query.perWork, 1, 8, workSlug ? 6 : 4);
  const parsed = parseSearchQuery(query, { exact });

  let response;
  try {
    response = searchIndexed(parsed, { workSlug, category, limit, perWork });
  } catch (error) {
    console.warn("Indexed search failed, using fallback search:", error.message);
    response = null;
  }
  if (!response) response = searchFallback(parsed, { workSlug, category, limit, perWork });

  res.json({
    query,
    exact,
    work: workSlug,
    category,
    totalMatches: response.totalMatches,
    totalWorks: response.totalWorks,
    showingMatches: response.showingMatches,
    tookMs: Date.now() - startedAt,
    indexed: response.indexed,
    results: response.results,
  });
});

// Single work with content
r.get("/:slug", (req, res) => {
  const w = db.prepare("SELECT * FROM works WHERE slug=?").get(req.params.slug);
  if (!w) return res.status(404).json({ error: "Not found." });
  res.json(w);
});

module.exports = r;
