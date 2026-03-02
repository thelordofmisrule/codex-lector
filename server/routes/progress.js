const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");
const r = express.Router();

/* Get all progress for current user */
r.get("/", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT rp.*, w.title, w.slug, w.category
    FROM reading_progress rp JOIN works w ON rp.work_id=w.id
    WHERE rp.user_id=? ORDER BY rp.last_read_at DESC
  `).all(req.user.id);
  res.json(rows);
});

/* Update progress for a work */
r.post("/:workSlug", requireAuth, (req, res) => {
  const w = db.prepare("SELECT id FROM works WHERE slug=?").get(req.params.workSlug);
  if (!w) return res.status(404).json({ error:"Work not found." });
  const { linesRead, totalLines, maxLineReached } = req.body;
  const existing = db.prepare("SELECT * FROM reading_progress WHERE user_id=? AND work_id=?").get(req.user.id, w.id);
  if (existing) {
    // Only update max_line_reached if it's higher
    const newMax = Math.max(existing.max_line_reached, maxLineReached || 0);
    db.prepare("UPDATE reading_progress SET lines_read=?, total_lines=?, max_line_reached=?, last_read_at=datetime('now') WHERE id=?")
      .run(linesRead || existing.lines_read, totalLines || existing.total_lines, newMax, existing.id);
  } else {
    db.prepare("INSERT INTO reading_progress (user_id, work_id, lines_read, total_lines, max_line_reached) VALUES (?,?,?,?,?)")
      .run(req.user.id, w.id, linesRead || 0, totalLines || 0, maxLineReached || 0);
  }
  res.json({ ok:true });
});

module.exports = r;
