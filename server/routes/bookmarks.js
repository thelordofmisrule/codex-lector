const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");
const r = express.Router();

/* Get bookmark for a work */
r.get("/:workSlug", requireAuth, (req, res) => {
  const w = db.prepare("SELECT id FROM works WHERE slug=?").get(req.params.workSlug);
  if (!w) return res.json(null);
  const bm = db.prepare("SELECT * FROM bookmarks WHERE user_id=? AND work_id=?").get(req.user.id, w.id);
  res.json(bm || null);
});

/* Get all bookmarks for current user */
r.get("/", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, w.title as work_title, w.slug as work_slug
    FROM bookmarks b JOIN works w ON b.work_id=w.id
    WHERE b.user_id=? ORDER BY b.updated_at DESC
  `).all(req.user.id);
  res.json(rows);
});

/* Set/update bookmark (upsert) */
r.post("/:workSlug", requireAuth, (req, res) => {
  const w = db.prepare("SELECT id FROM works WHERE slug=?").get(req.params.workSlug);
  if (!w) return res.status(404).json({ error: "Work not found." });
  const { lineId, lineText } = req.body;
  if (!lineId) return res.status(400).json({ error: "lineId required." });
  const existing = db.prepare("SELECT id FROM bookmarks WHERE user_id=? AND work_id=?").get(req.user.id, w.id);
  if (existing) {
    db.prepare("UPDATE bookmarks SET line_id=?, line_text=?, updated_at=datetime('now') WHERE id=?")
      .run(lineId, (lineText || "").slice(0, 100), existing.id);
  } else {
    db.prepare("INSERT INTO bookmarks (user_id, work_id, line_id, line_text) VALUES (?,?,?,?)")
      .run(req.user.id, w.id, lineId, (lineText || "").slice(0, 100));
  }
  res.json({ ok: true });
});

/* Delete bookmark */
r.delete("/:workSlug", requireAuth, (req, res) => {
  const w = db.prepare("SELECT id FROM works WHERE slug=?").get(req.params.workSlug);
  if (!w) return res.json({ ok: true });
  db.prepare("DELETE FROM bookmarks WHERE user_id=? AND work_id=?").run(req.user.id, w.id);
  res.json({ ok: true });
});

module.exports = r;
