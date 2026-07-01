const express = require("express");
const db = require("../db");
const { ensureSearchSchema } = require("../lib/workSearchIndex");
const { cosineSimilarity, ensureSemanticSearchSchema, getSemanticSearchStatus } = require("../lib/semanticSearchIndex");
const { embedTexts } = require("../lib/semanticEmbeddings");
const {
  buildFtsQuery,
  buildSearchSnippet,
  computeSearchScore,
  extractSearchLines,
  matchesParsedQuery,
  parseSearchQuery,
} = require("../lib/workSearch");
const { buildWorkLookup, enrichWork, enrichWorks } = require("../lib/workCatalog");

const r = express.Router();
ensureSearchSchema(db);
ensureSemanticSearchSchema(db);

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
    const groupSlug = row.groupSlug || row.slug;
    let group = grouped.get(groupSlug);
    if (!group) {
      group = {
        slug: groupSlug,
        title: row.groupTitle || row.title,
        category: row.groupCategory || row.category,
        variant: row.groupVariant || row.variant,
        matchCount: matchCounts.get(groupSlug) || 0,
        bestScore: row.score,
        matches: [],
      };
      grouped.set(groupSlug, group);
    }
    if (group.matches.length >= perWork) continue;

    group.bestScore = Math.max(group.bestScore, row.score);
    group.matches.push({
      id: row.id,
      resultSlug: row.slug,
      lineNumber: row.lineNumber,
      displayLineNumber: row.displayLineNumber,
      displayEndLineNumber: row.displayEndLineNumber,
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

function selectSemanticNodes(chunkType, options = {}) {
  const conditions = ["chunk_type = ?", "embedding IS NOT NULL"];
  const params = [chunkType];

  if (options.workSlug) {
    conditions.push("work_slug = ?");
    params.push(options.workSlug);
  }
  if (options.category && options.category !== "all") {
    conditions.push("category = ?");
    params.push(options.category);
  }

  return db.prepare(`
    SELECT *
    FROM semantic_search_chunks
    WHERE ${conditions.join(" AND ")}
    ORDER BY work_slug, node_order, line_start
  `).all(...params);
}

function selectSemanticChildren(parentKeys) {
  if (!Array.isArray(parentKeys) || !parentKeys.length) return [];
  const placeholders = parentKeys.map(() => "?").join(",");
  return db.prepare(`
    SELECT *
    FROM semantic_search_chunks
    WHERE embedding IS NOT NULL
      AND parent_node_key IN (${placeholders})
    ORDER BY node_depth, node_order, line_start
  `).all(...parentKeys);
}

function selectSemanticPassagesForWorks(workSlugs) {
  if (!Array.isArray(workSlugs) || !workSlugs.length) return [];
  const placeholders = workSlugs.map(() => "?").join(",");
  return db.prepare(`
    SELECT *
    FROM semantic_search_chunks
    WHERE chunk_type='passage'
      AND embedding IS NOT NULL
      AND work_slug IN (${placeholders})
    ORDER BY work_slug, line_start
  `).all(...workSlugs);
}

function dedupeSemanticPassages(entries) {
  const deduped = [];
  const seenByScope = new Map();

  for (const entry of entries) {
    const key = `${entry.row.work_slug}::${entry.row.scope_key}`;
    const bucket = seenByScope.get(key) || [];
    const overlapsExisting = bucket.some((existing) => {
      const overlapStart = Math.max(existing.row.line_start, entry.row.line_start);
      const overlapEnd = Math.min(existing.row.line_end, entry.row.line_end);
      const overlap = Math.max(0, overlapEnd - overlapStart + 1);
      const shortestLength = Math.max(1, Math.min(
        existing.row.line_end - existing.row.line_start + 1,
        entry.row.line_end - entry.row.line_start + 1
      ));
      return overlap / shortestLength >= 0.67;
    });
    if (overlapsExisting) continue;
    bucket.push(entry);
    seenByScope.set(key, bucket);
    deduped.push(entry);
  }

  return deduped;
}

function formatSemanticRow(row, score) {
  return {
    id: row.id,
    slug: row.work_slug,
    title: row.work_title,
    category: row.category,
    variant: row.variant,
    lineNumber: row.line_start,
    lineEndNumber: row.line_end,
    displayLineNumber: row.display_line_start,
    displayEndLineNumber: row.display_line_end,
    startLineKey: row.start_line_key || "",
    endLineKey: row.end_line_key || "",
    lineText: row.chunk_text,
    snippet: row.chunk_text,
    prevText: "",
    nextText: "",
    speaker: row.speaker,
    actLabel: "",
    sceneLabel: "",
    sectionLabel: row.label,
    locationLabel: row.location_label || row.label,
    semanticPath: row.path_label || "",
    nodeType: row.chunk_type,
    score,
    semantic: true,
  };
}

const SEMANTIC_QUERY_STOPWORDS = new Set([
  "a", "an", "and", "are", "argues", "arguing", "as", "at", "be", "before", "by", "committing",
  "do", "does", "for", "from", "he", "her", "herself", "him", "himself", "his", "i", "if",
  "in", "into", "is", "it", "itself", "me", "my", "myself", "of", "on", "or", "she",
  "that", "the", "their", "them", "themselves", "then", "there", "they", "this", "to",
  "was", "were", "with", "you", "your", "yourself",
]);

function normalizeSemanticText(text) {
  return ` ${String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function tokenizeSemanticText(text) {
  return normalizeSemanticText(text).trim().split(/\s+/).filter(Boolean);
}

function stemSemanticToken(token) {
  const value = String(token || "").toLowerCase();
  if (value.length <= 4) return value;
  return value
    .replace(/(ingly|edly|ingly|lessly|fully|ation|ition|ments|ment|ously|ously|edly|ness)$/g, "")
    .replace(/(ing|ed|es|s)$/g, "");
}

function matchesSemanticLexicon(text, lexicon) {
  return lexicon.some((regex) => regex.test(text));
}

function regexCount(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function hasAnyRegex(text, regexes) {
  return regexes.some((regex) => regex.test(text));
}

function buildSemanticQueryProfile(query) {
  const raw = String(query || "");
  const text = normalizeSemanticText(raw);
  const tokens = tokenizeSemanticText(raw);
  const distinctiveTokens = Array.from(new Set(tokens.filter((token) => (
    token.length >= 4 && !SEMANTIC_QUERY_STOPWORDS.has(token)
  ))));
  const stemmedTokens = Array.from(new Set(distinctiveTokens.map((token) => stemSemanticToken(token)).filter(Boolean)));
  const namedTerms = Array.from(new Set(
    (raw.match(/\b[A-Z][a-z]{3,}\b/g) || [])
      .map((token) => token.toLowerCase())
      .filter((token) => !SEMANTIC_QUERY_STOPWORDS.has(token))
  ));

  return {
    raw,
    text,
    namedTerms,
    distinctiveTokens,
    stemmedTokens,
    wantsViolence: hasAnyRegex(text, [/\bmurder\b/, /\bkill\b/, /\bdeath\b/, /\bstab\b/, /\bbloody\b/, /\bslay\b/, /\bassassin/, /\brape\b/, /\bravish/]),
    wantsIntrospection: hasAnyRegex(text, [/\bimagin/, /\bimagines?\b/, /\bthink/, /\bthought\b/, /\bmeditat/, /\bponder/, /\bconsider/, /\bfantas/, /\bsurmise/, /\bconscience/, /\bdoubt/, /\bhesitat/, /\bintent\b/, /\bargu/, /\bdebate/, /\bdisput/]),
    wantsBeforeAction: hasAnyRegex(text, [/\bbefore\b/, /\bprior\b/, /\bprepar/, /\babout to\b/, /\byet\b/, /\bnot yet\b/, /\bcommitt?ing\b/, /\bcommit\b/, /\bdoing it\b/, /\bdo it\b/, /\bfirst begin\b/]),
    wantsInteriorConflict: hasAnyRegex(text, [/\bargu/, /\bdebate/, /\bdisput/, /\bconflict/, /\bstruggle/, /\bwrestl/, /\bpause/, /\bindecis/, /\bremorse/, /\bconscience/]),
    wantsSexualViolence: hasAnyRegex(text, [/\brape\b/, /\bravish/, /\bsexual\b/, /\blust\b/, /\bviolate/, /\bassault\b/]),
  };
}

const SELF_DEBATE_LEXICON = [
  /\bargu/, /\bdebate/, /\bdisput/, /\bconscience\b/, /\bthought\b/, /\bthink\b/, /\bsurmise\b/, /\bfantas/, /\bintent\b/,
  /\binclin/, /\bpause\b/, /\bdoubt\b/, /\bhesitat/, /\bdeliber/, /\bresolve\b/, /\bfear\b/, /\bmind\b/, /\bheart\b/,
  /\brevolving\b/, /\bdesire\b/, /\bdread\b/, /\bpersuasion\b/, /\babstain/, /\bopposite persuasion\b/,
];
const SEXUAL_VIOLENCE_LEXICON = [
  /\brape\b/, /\bravish/, /\blust\b/, /\bdesire\b/, /\bbed\b/, /\bshame\b/, /\bstain/, /\btaint/, /\bunchaste\b/,
  /\bmaiden\b/, /\bchaste\b/, /\bwill\b/, /\bnight\b/, /\bdeflow/, /\bforce to my desire\b/, /\bdespoil/,
];

function semanticHeuristicAdjustments(row, profile, workBoost = 0) {
  const text = normalizeSemanticText(row.chunk_text || "");
  const localText = normalizeSemanticText(`${row.label || ""} ${row.location_label || ""} ${row.speaker || ""} ${row.path_label || ""} ${row.work_title || ""}`);
  const combined = `${text}${localText}`;

  const introspectionCount = regexCount(combined, /\b(i|me|my|myself|thought|think|imagine|imaginings|fantastical|surmise|meditate|conscience|intent|inclination|pause|resolve|fear|doubt|remorse)\b/g);
  const violenceCount = regexCount(combined, /\b(murder|kill|killing|death|deed|bloody|stab|slay|assassin|poison)\b/g);
  const beforeCount = regexCount(combined, /\b(yet|before|not yet|if|shall|would|begin|commencing|pause|surmise|fantastical|intent|inclination|thought)\b/g);
  const boastCount = regexCount(combined, /\b(done a thousand more|notorious ill|i curse|ravish a maid|accuse some innocent|set fire|or else devise his death|plot the way to do it)\b/g);
  const listLikeCount = regexCount(combined, /\b(or else|as kill a man|ravish a maid|accuse some innocent|set fire)\b/g)
    + regexCount(String(row.chunk_text || ""), /[,;:]/g);
  const retrospectiveCount = regexCount(combined, /\b(had done|have done|did not|have not done|even now i curse|i curse the day)\b/g);
  const speakerNamed = regexCount(combined, /\b(aaron|lucio|escalus|horatio|polonius)\b/g);

  let adjustment = 0;
  adjustment += workBoost;
  if (profile.wantsIntrospection) adjustment += Math.min(0.11, introspectionCount * 0.015);
  if (profile.wantsViolence) adjustment += Math.min(0.07, violenceCount * 0.012);
  if (profile.wantsBeforeAction) adjustment += Math.min(0.1, beforeCount * 0.016);
  if (profile.wantsInteriorConflict) adjustment += Math.min(0.08, introspectionCount * 0.01) + Math.min(0.04, beforeCount * 0.008);
  if (profile.wantsIntrospection && matchesSemanticLexicon(combined, SELF_DEBATE_LEXICON)) adjustment += 0.045;
  if (profile.wantsSexualViolence && matchesSemanticLexicon(combined, SEXUAL_VIOLENCE_LEXICON)) adjustment += 0.05;
  if (profile.wantsIntrospection && profile.wantsSexualViolence && matchesSemanticLexicon(combined, SELF_DEBATE_LEXICON) && matchesSemanticLexicon(combined, SEXUAL_VIOLENCE_LEXICON)) adjustment += 0.08;
  if ((/\bdesire\b/.test(combined) && /\bdread\b/.test(combined)) || (/\blust\b/.test(combined) && /\bfear\b/.test(combined))) adjustment += 0.06;
  if (/\brevolving\b/.test(combined) || /\bdisputation\b/.test(combined) || /\binward mind\b/.test(combined)) adjustment += 0.06;

  if (introspectionCount >= 3 && violenceCount >= 1 && beforeCount >= 2) adjustment += 0.05;
  if (/\bmy thought\b/.test(combined) || /\bhorrible imaginings\b/.test(combined) || /\bfirst begin\b/.test(combined)) adjustment += 0.08;
  if (/\bdisputation\b/.test(combined) || /\bdebating die\b/.test(combined)) adjustment += 0.07;
  if (/\bconscience\b/.test(combined) && /\bkill/.test(combined)) adjustment += 0.03;

  profile.namedTerms.forEach((term) => {
    if (combined.includes(` ${term} `)) adjustment += 0.09;
  });
  profile.distinctiveTokens.slice(0, 5).forEach((token) => {
    if (combined.includes(` ${token} `)) adjustment += 0.012;
  });
  profile.stemmedTokens.slice(0, 5).forEach((stem) => {
    if (stem.length >= 4 && combined.includes(` ${stem}`)) adjustment += 0.008;
  });

  adjustment -= Math.min(0.15, boastCount * 0.06);
  adjustment -= Math.min(0.1, retrospectiveCount * 0.04);
  adjustment -= Math.min(0.08, Math.max(0, listLikeCount - 3) * 0.01);
  if (speakerNamed > 0 && introspectionCount < 2) adjustment -= 0.015;

  return adjustment;
}

function selectWorkTextRows(workSlugs) {
  if (!Array.isArray(workSlugs) || !workSlugs.length) return [];
  const placeholders = workSlugs.map(() => "?").join(",");
  return db.prepare(`
    SELECT slug, title, content
    FROM works
    WHERE slug IN (${placeholders})
  `).all(...workSlugs);
}

function buildSemanticWorkBoosts(workSlugs, profile) {
  const rows = selectWorkTextRows(workSlugs);
  const boosts = new Map();
  rows.forEach((row) => {
    const combined = normalizeSemanticText(`${row.title || ""} ${row.content || ""}`);
    let boost = 0;
    let nameMatches = 0;
    profile.namedTerms.forEach((term) => {
      if (combined.includes(` ${term} `)) {
        boost += 0.12;
        nameMatches += 1;
      }
    });
    if (profile.namedTerms.length) {
      if (nameMatches === profile.namedTerms.length) boost += 0.1;
      else if (nameMatches === 0) boost -= 0.16;
    }
    profile.distinctiveTokens.slice(0, 4).forEach((token) => {
      if (combined.includes(` ${token} `)) boost += 0.015;
    });
    if (profile.wantsSexualViolence && matchesSemanticLexicon(combined, SEXUAL_VIOLENCE_LEXICON)) boost += 0.04;
    if (profile.wantsIntrospection && matchesSemanticLexicon(combined, SELF_DEBATE_LEXICON)) boost += 0.03;
    if (profile.wantsIntrospection && profile.wantsSexualViolence && matchesSemanticLexicon(combined, SELF_DEBATE_LEXICON) && matchesSemanticLexicon(combined, SEXUAL_VIOLENCE_LEXICON)) boost += 0.06;
    boosts.set(row.slug, Math.max(-0.16, Math.min(0.34, boost)));
  });
  return boosts;
}

function rerankSemanticEntries(entries, query, options = {}) {
  const profile = buildSemanticQueryProfile(query);
  const mode = options.semanticMode === "explore" ? "explore" : "tight";
  const heuristicWeight = mode === "explore" ? 0.6 : 1;
  const workBoosts = options.workBoosts || new Map();
  return entries
    .map((entry) => {
      const workBoost = workBoosts.get(entry.row.work_slug) || 0;
      const heuristic = semanticHeuristicAdjustments(entry.row, profile, workBoost) * heuristicWeight;
      const modeBoost = mode === "tight"
        ? ((entry.row.chunk_type === "passage" ? 0.012 : 0) - Math.max(0, entry.row.line_end - entry.row.line_start - 12) * 0.0008)
        : 0;
      return {
        ...entry,
        heuristicScore: heuristic,
        totalScore: entry.totalScore + heuristic + modeBoost,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

function collapseEquivalentEditionEntries(entries, lookup, options = {}) {
  if (options.workSlug || (options.category && options.category !== "all")) return entries;
  const enrichedBySlug = new Map(lookup.works.map((work) => [work.slug, enrichWork(work, lookup)]));
  const primaryFamilies = new Set();
  entries.forEach((entry) => {
    const meta = enrichedBySlug.get(entry.row.work_slug);
    if (meta?.isPrimaryEdition) primaryFamilies.add(meta.familySlug);
  });
  if (!primaryFamilies.size) return entries;
  return entries.filter((entry) => {
    const meta = enrichedBySlug.get(entry.row.work_slug);
    if (!meta) return true;
    if (meta.isPrimaryEdition) return true;
    return !primaryFamilies.has(meta.familySlug);
  });
}

function scoreSemanticEntries(rows, queryVector, queryNorm, options = {}) {
  const parentScoreByKey = options.parentScoreByKey || new Map();
  const rootScoreByWork = options.rootScoreByWork || new Map();
  const localWeight = typeof options.localWeight === "number" ? options.localWeight : 0.88;
  const parentWeight = typeof options.parentWeight === "number" ? options.parentWeight : 0.12;
  const rootWeight = typeof options.rootWeight === "number" ? options.rootWeight : 0;

  return rows
    .map((row) => {
      const localScore = cosineSimilarity(queryVector, queryNorm, row.embedding, row.embedding_norm);
      if (!Number.isFinite(localScore)) return null;
      const parentScore = parentScoreByKey.get(row.parent_node_key) || 0;
      const rootScore = rootScoreByWork.get(row.work_slug) || 0;
      return {
        row,
        localScore,
        totalScore: (localScore * localWeight) + (parentScore * parentWeight) + (rootScore * rootWeight),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.totalScore - a.totalScore);
}

function pickNextSemanticFrontier(entries, perParent, cap) {
  const picked = [];
  const counts = new Map();

  for (const entry of entries) {
    const parentKey = entry.row.parent_node_key || "";
    const seen = counts.get(parentKey) || 0;
    if (seen >= perParent) continue;
    counts.set(parentKey, seen + 1);
    picked.push(entry);
    if (picked.length >= cap) break;
  }

  return picked;
}

async function searchSemantic(query, options) {
  const status = getSemanticSearchStatus(db);
  if (!status.configured || !status.indexed) {
    return {
      available: false,
      totalMatches: 0,
      totalWorks: 0,
      showingMatches: 0,
      results: [],
      reason: !status.configured
        ? "Semantic search is not configured on this server."
        : "Semantic search has not been indexed yet.",
    };
  }

  const { workSlug, category, limit, perWork, semanticMode = "tight" } = options;
  const queryVector = (await embedTexts([query], { inputType: "query" }))[0] || [];
  if (!queryVector.length) {
    return {
      available: false,
      totalMatches: 0,
      totalWorks: 0,
      showingMatches: 0,
      results: [],
      reason: "Could not generate a semantic embedding for that query.",
    };
  }

  let queryNorm = 0;
  for (const value of queryVector) queryNorm += value * value;
  queryNorm = Math.sqrt(queryNorm) || 1;

  const workLookup = buildWorkLookup();
  const rootRows = selectSemanticNodes("work", { workSlug, category });
  const scoredRoots = scoreSemanticEntries(rootRows, queryVector, queryNorm, { localWeight: 1, parentWeight: 0, rootWeight: 0 })
    .slice(0, workSlug ? 1 : (semanticMode === "explore" ? Math.max(limit + 6, 16) : Math.max(limit, 10)));

  const passageEntryMap = new Map();
  const rootScoreByWork = new Map(scoredRoots.map((entry) => [entry.row.work_slug, entry.totalScore]));
  let frontier = scoredRoots;
  let depth = 0;

  while (frontier.length && depth < 8) {
    const childRows = selectSemanticChildren(frontier.map((entry) => entry.row.node_key));
    if (!childRows.length) break;

    const parentScoreByKey = new Map(frontier.map((entry) => [entry.row.node_key, entry.totalScore]));
    const scoredChildren = scoreSemanticEntries(childRows, queryVector, queryNorm, {
      parentScoreByKey,
      rootScoreByWork,
      localWeight: 0.84,
      parentWeight: 0.12,
      rootWeight: 0.04,
    });

    scoredChildren.forEach((entry) => {
      if (entry.row.chunk_type !== "passage") return;
      const existing = passageEntryMap.get(entry.row.node_key);
      if (!existing || entry.totalScore > existing.totalScore) {
        passageEntryMap.set(entry.row.node_key, entry);
      }
    });

    const nonLeafEntries = scoredChildren.filter((entry) => entry.row.chunk_type !== "passage");
    frontier = pickNextSemanticFrontier(
      nonLeafEntries,
      workSlug ? 3 : (semanticMode === "explore" ? 3 : 2),
      Math.max(limit * (semanticMode === "explore" ? 4 : 3), workSlug ? 18 : (semanticMode === "explore" ? 32 : 24))
    );
    depth += 1;
  }

  const candidateWorkSlugs = [...new Set(scoredRoots.map((entry) => entry.row.work_slug))];
  const directPassageRows = selectSemanticPassagesForWorks(candidateWorkSlugs);
  scoreSemanticEntries(directPassageRows, queryVector, queryNorm, {
    rootScoreByWork,
    localWeight: 0.92,
    parentWeight: 0,
    rootWeight: 0.08,
  }).forEach((entry) => {
    const existing = passageEntryMap.get(entry.row.node_key);
    if (!existing || entry.totalScore > existing.totalScore) {
      passageEntryMap.set(entry.row.node_key, entry);
    }
  });

  const workBoosts = buildSemanticWorkBoosts(candidateWorkSlugs, buildSemanticQueryProfile(query));
  const scoredPassages = collapseEquivalentEditionEntries(
    dedupeSemanticPassages(
      rerankSemanticEntries(
        [...passageEntryMap.values()]
          .sort((a, b) => b.totalScore - a.totalScore),
        query,
        { semanticMode, workBoosts }
      )
    ),
    workLookup,
    { workSlug, category }
  );

  if (!scoredPassages.length) {
    return {
      available: true,
      totalMatches: 0,
      totalWorks: 0,
      showingMatches: 0,
      results: [],
    };
  }

  const matchCounts = new Map();
  scoredPassages.forEach(({ row }) => {
    const meta = enrichWork({ slug: row.work_slug, title: row.work_title, category: row.category, variant: row.variant }, workLookup);
    const groupSlug = (!workSlug && category === "all") ? (meta.familySlug || row.work_slug) : row.work_slug;
    matchCounts.set(groupSlug, (matchCounts.get(groupSlug) || 0) + 1);
  });

  const grouped = buildGroupedResults(
    scoredPassages.map(({ row, totalScore }) => {
      const formatted = formatSemanticRow(row, totalScore);
      if (!workSlug && category === "all") {
        const meta = enrichWork({ slug: row.work_slug, title: row.work_title, category: row.category, variant: row.variant }, workLookup);
        formatted.groupSlug = meta.familySlug || row.work_slug;
        formatted.groupTitle = meta.familyTitle || row.work_title;
        formatted.groupCategory = meta.category || row.category;
        formatted.groupVariant = meta.variant || row.variant;
      }
      return formatted;
    }),
    matchCounts,
    limit,
    perWork
  );

  return {
    available: true,
    totalMatches: scoredPassages.length,
    totalWorks: matchCounts.size,
    showingMatches: grouped.showingMatches,
    results: grouped.results,
  };
}

// List (no content)
r.get("/", (req, res) => {
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  const works = db.prepare("SELECT id,slug,title,category,variant,authors,(content IS NOT NULL) as has_content FROM works ORDER BY category,title").all();
  res.json(enrichWorks(works));
});

// Ranked text search across works
r.get("/search/text", (req, res) => {
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
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

r.get("/search/semantic/status", (req, res) => {
  const semanticStatus = getSemanticSearchStatus(db);
  const isSignedIn = !!req.user;
  const available = isSignedIn && semanticStatus.configured && semanticStatus.indexed;
  const reason = !isSignedIn
    ? "Semantic search requires sign-in."
    : (!semanticStatus.configured
      ? "Semantic search is not configured on this server."
      : (!semanticStatus.indexed ? "Semantic search has not been indexed yet." : ""));

  res.json({
    available,
    requiresLogin: !isSignedIn,
    configured: semanticStatus.configured,
    indexed: semanticStatus.indexed,
    reason,
  });
});

r.get("/search/semantic", async (req, res) => {
  const startedAt = Date.now();
  const query = String(req.query.q || "").trim();
  const semanticStatus = getSemanticSearchStatus(db);
  if (!req.user) {
    return res.status(403).json({ error: "Semantic search requires sign-in." });
  }
  if (query.length < 3) {
    return res.json({
      query,
      work: "",
      category: "all",
      totalMatches: 0,
      totalWorks: 0,
      showingMatches: 0,
      tookMs: 0,
      semantic: true,
      available: semanticStatus.configured && semanticStatus.indexed,
      results: [],
    });
  }

  const workSlug = String(req.query.work || "").trim();
  const category = String(req.query.category || "all").trim() || "all";
  const limit = clampInt(req.query.limit, 6, 60, workSlug ? 18 : 24);
  const perWork = clampInt(req.query.perWork, 1, 8, workSlug ? 6 : 4);
  const semanticMode = String(req.query.semanticMode || "tight").trim() === "explore" ? "explore" : "tight";

  try {
    const response = await searchSemantic(query, { workSlug, category, limit, perWork, semanticMode });
    return res.json({
      query,
      work: workSlug,
      category,
      semanticMode,
      totalMatches: response.totalMatches,
      totalWorks: response.totalWorks,
      showingMatches: response.showingMatches,
      tookMs: Date.now() - startedAt,
      semantic: true,
      available: response.available,
      reason: response.reason || "",
      results: response.results,
    });
  } catch (error) {
    console.error("Semantic search failed:", error);
    return res.status(503).json({ error: error.message || "Semantic search failed." });
  }
});

// Single work with content
r.get("/:slug", (req, res) => {
  const w = db.prepare("SELECT * FROM works WHERE slug=?").get(req.params.slug);
  if (!w) return res.status(404).json({ error: "Not found." });
  // Canonical text changes only when the corpus is re-imported. Keep it in the
  // browser cache so returning to a play does not transfer ~100 KB again.
  res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.json(enrichWork(w, buildWorkLookup()));
});

module.exports = r;
