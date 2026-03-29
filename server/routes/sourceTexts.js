const express = require("express");
const db = require("../db");
const { ensureSourceTextSchema } = require("../lib/sourceTexts");

const r = express.Router();
ensureSourceTextSchema(db);

r.get("/", (req, res) => {
  const sourceId = String(req.query.source || "").trim();
  const rows = sourceId
    ? db.prepare(`
        SELECT id, source_id, tcp_id, slug, title, author, date_label, publication, language, imported_at, updated_at
        FROM source_texts
        WHERE source_id=?
        ORDER BY date_label, tcp_id
      `).all(sourceId)
    : db.prepare(`
        SELECT id, source_id, tcp_id, slug, title, author, date_label, publication, language, imported_at, updated_at
        FROM source_texts
        ORDER BY title, tcp_id
      `).all();
  res.json({ sourceId, results: rows });
});

r.get("/:identifier", (req, res) => {
  const raw = String(req.params.identifier || "").trim();
  const lower = raw.toLowerCase();
  const upper = raw.toUpperCase();
  const row = db.prepare(`
    SELECT id, source_id, tcp_id, slug, title, author, date_label, publication, language, xml, imported_at, updated_at
    FROM source_texts
    WHERE slug = ? COLLATE NOCASE OR tcp_id = ? COLLATE NOCASE
    LIMIT 1
  `).get(lower, upper);

  if (!row) return res.status(404).json({ error: "Source text not found." });

  const alternatives = row.source_id
    ? db.prepare(`
        SELECT tcp_id, slug, title, date_label
        FROM source_texts
        WHERE source_id=? AND id<>?
        ORDER BY date_label, tcp_id
      `).all(row.source_id, row.id)
    : [];

  res.json({
    ...row,
    alternatives,
  });
});

module.exports = r;
