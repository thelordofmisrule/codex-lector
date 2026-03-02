const express = require("express");
const db = require("../db");
const { requireAuth, optionalAuth } = require("../auth");
const r = express.Router();

/* Get all of current user's annotations across all works — MUST be before /:workSlug */
r.get("/my/all", requireAuth, (req, res) => {
  const q = req.query.q?.trim();
  let rows;
  if (q) {
    rows = db.prepare(`
      SELECT a.*, w.title as work_title, w.slug as work_slug
      FROM annotations a JOIN works w ON a.work_id=w.id
      WHERE a.user_id=? AND (a.note LIKE ? OR a.selected_text LIKE ? OR w.title LIKE ?)
      ORDER BY a.created_at DESC LIMIT 200
    `).all(req.user.id, `%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare(`
      SELECT a.*, w.title as work_title, w.slug as work_slug
      FROM annotations a JOIN works w ON a.work_id=w.id
      WHERE a.user_id=? ORDER BY a.created_at DESC LIMIT 200
    `).all(req.user.id);
  }
  res.json(rows);
});

/* Get annotations for a work.
   ?filter=all (global + mine + subscribed layers), mine (only mine), global (only global/admin) */
r.get("/:workSlug", optionalAuth, (req, res) => {
  const w = db.prepare("SELECT id FROM works WHERE slug=?").get(req.params.workSlug);
  if (!w) return res.json([]);
  const filter = req.query.filter || "all";
  const userId = req.user?.id;

  const cols = "a.*, u.display_name as author_name, u.is_admin as author_is_admin, al.name as layer_name";
  const joins = "annotations a JOIN users u ON a.user_id=u.id LEFT JOIN annotation_layers al ON a.layer_id=al.id";

  let rows;
  if (filter === "mine" && userId) {
    rows = db.prepare(`SELECT ${cols} FROM ${joins} WHERE a.work_id=? AND a.user_id=? ORDER BY a.line_id, a.created_at`).all(w.id, userId);
  } else if (filter === "global") {
    rows = db.prepare(`SELECT ${cols} FROM ${joins} WHERE a.work_id=? AND a.is_global=1 ORDER BY a.line_id, a.created_at`).all(w.id);
  } else {
    // "all" — global + mine + annotations from subscribed layers
    if (userId) {
      rows = db.prepare(`SELECT ${cols} FROM ${joins} WHERE a.work_id=? AND (
        a.is_global=1 OR a.user_id=? OR
        a.layer_id IN (SELECT layer_id FROM layer_subscriptions WHERE user_id=?)
      ) ORDER BY a.line_id, a.created_at`).all(w.id, userId, userId);
    } else {
      rows = db.prepare(`SELECT ${cols} FROM ${joins} WHERE a.work_id=? AND a.is_global=1 ORDER BY a.line_id, a.created_at`).all(w.id);
    }
  }
  res.json(rows);
});

/* Create annotation — any signed-in user. Admin creates global. */
r.post("/", requireAuth, (req, res) => {
  const { workId, lineId, note, color, selectedText } = req.body;
  if (!workId || !lineId || !note) return res.status(400).json({ error: "workId, lineId, note required." });
  const isGlobal = req.user.isAdmin ? 1 : 0;
  try {
    const result = db.prepare(
      "INSERT INTO annotations (work_id, user_id, line_id, note, color, selected_text, is_global) VALUES (?,?,?,?,?,?,?)"
    ).run(workId, req.user.id, lineId, note, color || 0, selectedText || "", isGlobal);
    res.json(db.prepare("SELECT a.*, u.display_name as author_name, u.is_admin as author_is_admin FROM annotations a JOIN users u ON a.user_id=u.id WHERE a.id=?").get(result.lastInsertRowid));
  } catch (e) {
    console.error("Annotation create error:", e);
    res.status(500).json({ error: "Failed to create annotation." });
  }
});

/* Edit annotation — owner or admin */
r.put("/:id", requireAuth, (req, res) => {
  const ann = db.prepare("SELECT * FROM annotations WHERE id=?").get(req.params.id);
  if (!ann) return res.status(404).json({ error: "Not found." });
  if (ann.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: "Forbidden." });
  const { note, color } = req.body;
  db.prepare("UPDATE annotations SET note=COALESCE(?,note), color=COALESCE(?,color) WHERE id=?")
    .run(note ?? null, color ?? null, req.params.id);
  res.json(db.prepare("SELECT a.*, u.display_name as author_name, u.is_admin as author_is_admin FROM annotations a JOIN users u ON a.user_id=u.id WHERE a.id=?").get(req.params.id));
});

/* Delete annotation — owner or admin */
r.delete("/:id", requireAuth, (req, res) => {
  const ann = db.prepare("SELECT * FROM annotations WHERE id=?").get(req.params.id);
  if (!ann) return res.status(404).json({ error: "Not found." });
  if (ann.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: "Forbidden." });
  db.prepare("DELETE FROM annotations WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = r;
