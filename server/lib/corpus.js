/**
 * Shared helpers for querying the line corpus (work_search_lines + work_search_fts).
 *
 * work_search_lines is the authoritative word-level view of the texts: one row
 * per line with speaker, act/scene labels, and normalized_text (lowercased,
 * punctuation and apostrophes stripped, so "lov'd" -> "lovd"). Every feature
 * that counts, locates, or samples words should query it through these helpers
 * rather than re-parsing works.content.
 */

const SCOPE_VARIANTS = {
  canon: ["ps", "ps-poems"],
  all: ["ps", "ps-poems", "ps-apocrypha"],
  everything: null, // no variant filter — includes First Folio reprints
};

/* Normalize a word the same way workSearchIndex normalizes line text. */
function normalizeWord(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z]/g, "");
}

function scopeVariants(scope) {
  return SCOPE_VARIANTS[scope] !== undefined ? SCOPE_VARIANTS[scope] : SCOPE_VARIANTS.canon;
}

function ftsMatchExpression(forms) {
  return `normalized_text : (${forms.map((form) => `"${form}"`).join(" OR ")})`;
}

/* Builds "AND l.variant IN (?,?)" plus params, or nothing for unscoped queries. */
function variantFilter(variants) {
  if (!variants || !variants.length) return { sql: "", params: [] };
  return {
    sql: ` AND l.variant IN (${variants.map(() => "?").join(",")})`,
    params: [...variants],
  };
}

const LINE_COLUMNS = `
  l.work_slug AS slug, l.work_title AS title, l.category, l.variant,
  l.line_number AS lineNumber, l.display_line_number AS displayLineNumber,
  l.line_text AS lineText, l.normalized_text AS normalizedText,
  l.speaker, l.act_label AS actLabel, l.scene_label AS sceneLabel
`;

function buildLineWhere(forms, variants, { workSlug = "", speaker = "" } = {}) {
  const variant = variantFilter(variants);
  let where = `work_search_fts MATCH ?${variant.sql}`;
  const params = [ftsMatchExpression(forms), ...variant.params];
  if (workSlug) {
    where += " AND l.work_slug = ?";
    params.push(workSlug);
  }
  if (speaker) {
    where += " AND l.speaker = ?";
    params.push(speaker);
  }
  return { where, params };
}

function countLines(db, forms, variants, filters = {}) {
  const { where, params } = buildLineWhere(forms, variants, filters);
  return db.prepare(`
    SELECT count(*) AS n
    FROM work_search_fts f
    JOIN work_search_lines l ON l.id = f.rowid
    WHERE ${where}
  `).get(...params)?.n || 0;
}

function fetchLines(db, forms, variants, { workSlug = "", speaker = "", limit = 0, offset = 0 } = {}) {
  const { where, params } = buildLineWhere(forms, variants, { workSlug, speaker });
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

function countLinesPerWork(db, forms, variants) {
  const { where, params } = buildLineWhere(forms, variants);
  return db.prepare(`
    SELECT l.work_slug AS slug, l.work_title AS title, l.category, count(*) AS lines
    FROM work_search_fts f
    JOIN work_search_lines l ON l.id = f.rowid
    WHERE ${where}
    GROUP BY l.work_slug
    ORDER BY lines DESC
  `).all(...params);
}

/* --- memoized corpus statistics (invalidated only by process restart, which
       matches how often the corpus itself changes: on re-import + deploy) --- */

let workTokenTotals = null;
function getWorkTokenTotals(db) {
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

let globalTokenFreq = null;
function getGlobalTokenFreq(db) {
  if (!globalTokenFreq) {
    const freq = new Map();
    let total = 0;
    db.prepare(`
      SELECT normalized_text AS text FROM work_search_lines
      WHERE variant IN ('ps','ps-poems') AND normalized_text != ''
    `).all().forEach(({ text }) => {
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

module.exports = {
  normalizeWord,
  scopeVariants,
  ftsMatchExpression,
  variantFilter,
  countLines,
  fetchLines,
  countLinesPerWork,
  getWorkTokenTotals,
  getGlobalTokenFreq,
};
