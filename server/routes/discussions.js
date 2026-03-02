const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");
const r = express.Router();

r.get("/:workSlug", (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, u.username, u.display_name, u.is_admin FROM discussions d
    JOIN users u ON d.user_id=u.id WHERE d.work_slug=? ORDER BY d.created_at
  `).all(req.params.workSlug);
  res.json(rows.map(d => ({
    id:d.id, workSlug:d.work_slug, userId:d.user_id, parentId:d.parent_id, body:d.body,
    username:d.username, displayName:d.display_name, isAdmin:!!d.is_admin,
    createdAt:d.created_at, updatedAt:d.updated_at,
  })));
});

r.post("/:workSlug", requireAuth, (req, res) => {
  const { body, parentId } = req.body;
  if (!body?.trim()) return res.status(400).json({ error:"Body required." });
  const result = db.prepare("INSERT INTO discussions (work_slug,user_id,parent_id,body) VALUES (?,?,?,?)")
    .run(req.params.workSlug, req.user.id, parentId||null, body.trim());
  const d = db.prepare("SELECT d.*,u.username,u.display_name,u.is_admin FROM discussions d JOIN users u ON d.user_id=u.id WHERE d.id=?").get(result.lastInsertRowid);
  res.json({ id:d.id, workSlug:d.work_slug, userId:d.user_id, parentId:d.parent_id, body:d.body,
    username:d.username, displayName:d.display_name, isAdmin:!!d.is_admin, createdAt:d.created_at, updatedAt:d.updated_at });
});

r.put("/:id", requireAuth, (req, res) => {
  const d = db.prepare("SELECT * FROM discussions WHERE id=?").get(req.params.id);
  if (!d) return res.status(404).json({ error:"Not found." });
  if (d.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error:"Body required." });
  db.prepare("UPDATE discussions SET body=?, updated_at=datetime('now') WHERE id=?").run(body.trim(), req.params.id);
  res.json({ ok:true });
});

r.delete("/:id", requireAuth, (req, res) => {
  const d = db.prepare("SELECT * FROM discussions WHERE id=?").get(req.params.id);
  if (!d) return res.status(404).json({ error:"Not found." });
  if (d.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  db.prepare("DELETE FROM discussions WHERE id=?").run(req.params.id);
  res.json({ ok:true });
});

module.exports = r;
