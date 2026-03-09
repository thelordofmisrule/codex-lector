const { extractSearchLines } = require("./workSearch");

function ensureSearchSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_search_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      work_slug TEXT NOT NULL,
      work_title TEXT NOT NULL,
      category TEXT NOT NULL,
      variant TEXT DEFAULT 'ps',
      line_number INTEGER NOT NULL,
      display_line_number INTEGER NOT NULL,
      line_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      speaker TEXT DEFAULT '',
      act_label TEXT DEFAULT '',
      scene_label TEXT DEFAULT '',
      section_label TEXT DEFAULT '',
      location_label TEXT DEFAULT '',
      prev_text TEXT DEFAULT '',
      next_text TEXT DEFAULT '',
      UNIQUE(work_id, line_number)
    );

    CREATE INDEX IF NOT EXISTS idx_work_search_lines_work
      ON work_search_lines(work_id, line_number);
    CREATE INDEX IF NOT EXISTS idx_work_search_lines_slug
      ON work_search_lines(work_slug, line_number);
    CREATE INDEX IF NOT EXISTS idx_work_search_lines_category
      ON work_search_lines(category, work_id);
  `);

  let ftsEnabled = true;
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS work_search_fts
      USING fts5(
        line_text,
        normalized_text,
        content='work_search_lines',
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2',
        prefix='2 3 4 5 6 7 8 9 10'
      );
    `);
  } catch (error) {
    ftsEnabled = false;
  }

  return { ftsEnabled };
}

function rebuildSearchIndex(db, options = {}) {
  const logger = options.logger || console;
  const logEachWork = !!options.logEachWork;
  const { ftsEnabled } = ensureSearchSchema(db);
  const works = db.prepare(`
    SELECT id, slug, title, category, variant, content
    FROM works
    WHERE content IS NOT NULL
    ORDER BY id
  `).all();

  const clearRows = db.prepare("DELETE FROM work_search_lines");
  const insertRow = db.prepare(`
    INSERT INTO work_search_lines (
      work_id, work_slug, work_title, category, variant,
      line_number, display_line_number, line_text, normalized_text,
      speaker, act_label, scene_label, section_label, location_label,
      prev_text, next_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalLines = 0;

  const rebuild = db.transaction(() => {
    clearRows.run();
    for (const work of works) {
      const rows = extractSearchLines(work.content || "");
      totalLines += rows.length;
      if (logEachWork) logger.log(`  ${work.title}: ${rows.length} searchable lines`);
      for (const row of rows) {
        insertRow.run(
          work.id,
          work.slug,
          work.title,
          work.category,
          work.variant || "ps",
          row.lineNumber,
          row.displayLineNumber || row.lineNumber,
          row.lineText,
          row.normalizedText,
          row.speaker || "",
          row.actLabel || "",
          row.sceneLabel || "",
          row.sectionLabel || "",
          row.locationLabel || "",
          row.prevText || "",
          row.nextText || ""
        );
      }
    }
  });

  rebuild();

  if (ftsEnabled) {
    try {
      db.exec("INSERT INTO work_search_fts(work_search_fts) VALUES ('rebuild')");
    } catch (error) {
      logger.warn(`Search FTS rebuild skipped: ${error.message}`);
      return { works: works.length, lines: totalLines, ftsEnabled: false };
    }
  }

  return { works: works.length, lines: totalLines, ftsEnabled };
}

module.exports = {
  ensureSearchSchema,
  rebuildSearchIndex,
};
