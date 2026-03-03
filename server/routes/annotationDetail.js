const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin, optionalAuth } = require("../auth");
const { notifyAdmins, notifyReply } = require("../notify");
const { createRateLimit } = require("../rateLimit");
const r = express.Router();
const commentLimit = createRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 25,
  message: "Too many comments. Please wait before posting again.",
  keyFn: (req) => `annotation:comment:${req.ip}:${req.user?.id || "anon"}`,
});
const suggestionLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  message: "Too many suggestions. Please wait before submitting another.",
  keyFn: (req) => `annotation:suggest:${req.ip}:${req.user?.id || "anon"}`,
});

/* ── Get annotation detail with comments + suggestions ── */
r.get("/:id", optionalAuth, (req, res) => {
  const ann = db.prepare("SELECT a.*, w.slug as work_slug, w.title as work_title FROM annotations a JOIN works w ON a.work_id=w.id WHERE a.id=?").get(req.params.id);
  if (!ann) return res.status(404).json({ error:"Annotation not found." });

  const comments = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.is_admin, u.avatar_color
    FROM annotation_comments c JOIN users u ON c.user_id=u.id
    WHERE c.annotation_id=? ORDER BY c.created_at
  `).all(req.params.id).map(c => ({
    id:c.id, annotationId:c.annotation_id, userId:c.user_id, parentId:c.parent_id,
    body:c.body, username:c.username, displayName:c.display_name, isAdmin:!!c.is_admin,
    avatarColor:c.avatar_color, createdAt:c.created_at, updatedAt:c.updated_at,
  }));

  const suggestions = db.prepare(`
    SELECT s.*, u.username, u.display_name, u.avatar_color,
      ru.username as resolver_username, ru.display_name as resolver_name
    FROM annotation_suggestions s
    JOIN users u ON s.user_id=u.id
    LEFT JOIN users ru ON s.resolved_by=ru.id
    WHERE s.annotation_id=? ORDER BY s.created_at DESC
  `).all(req.params.id).map(s => ({
    id:s.id, annotationId:s.annotation_id, userId:s.user_id,
    suggestedNote:s.suggested_note, suggestedColor:s.suggested_color,
    reason:s.reason, status:s.status,
    username:s.username, displayName:s.display_name, avatarColor:s.avatar_color,
    resolverName:s.resolver_name, resolvedAt:s.resolved_at,
    createdAt:s.created_at,
  }));

  // Get author info
  const author = ann.user_id ? db.prepare("SELECT username, display_name, avatar_color FROM users WHERE id=?").get(ann.user_id) : null;

  res.json({
    annotation: {
      ...ann,
      authorUsername: author?.username,
      authorName: author?.display_name,
      authorColor: author?.avatar_color,
    },
    comments,
    suggestions,
  });
});

/* ── Comments CRUD ── */
r.post("/:id/comments", requireAuth, commentLimit, (req, res) => {
  const ann = db.prepare("SELECT id FROM annotations WHERE id=?").get(req.params.id);
  if (!ann) return res.status(404).json({ error:"Annotation not found." });
  const { body, parentId } = req.body;
  if (!body?.trim()) return res.status(400).json({ error:"Body required." });
  const result = db.prepare("INSERT INTO annotation_comments (annotation_id,user_id,parent_id,body) VALUES (?,?,?,?)")
    .run(req.params.id, req.user.id, parentId||null, body.trim());
  const c = db.prepare("SELECT c.*,u.username,u.display_name,u.is_admin,u.avatar_color FROM annotation_comments c JOIN users u ON c.user_id=u.id WHERE c.id=?").get(result.lastInsertRowid);
  res.json({ id:c.id, annotationId:c.annotation_id, userId:c.user_id, parentId:c.parent_id,
    body:c.body, username:c.username, displayName:c.display_name, isAdmin:!!c.is_admin,
    avatarColor:c.avatar_color, createdAt:c.created_at, updatedAt:c.updated_at });
});

r.put("/comments/:cid", requireAuth, (req, res) => {
  const c = db.prepare("SELECT * FROM annotation_comments WHERE id=?").get(req.params.cid);
  if (!c) return res.status(404).json({ error:"Not found." });
  if (c.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error:"Body required." });
  db.prepare("UPDATE annotation_comments SET body=?, updated_at=datetime('now') WHERE id=?").run(body.trim(), req.params.cid);
  res.json({ ok:true });
});

r.delete("/comments/:cid", requireAuth, (req, res) => {
  const c = db.prepare("SELECT * FROM annotation_comments WHERE id=?").get(req.params.cid);
  if (!c) return res.status(404).json({ error:"Not found." });
  if (c.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  db.prepare("DELETE FROM annotation_comments WHERE id=?").run(req.params.cid);
  res.json({ ok:true });
});

/* ── Suggestions: propose, accept, reject ── */
r.post("/:id/suggestions", requireAuth, suggestionLimit, (req, res) => {
  const ann = db.prepare("SELECT id FROM annotations WHERE id=?").get(req.params.id);
  if (!ann) return res.status(404).json({ error:"Annotation not found." });
  const { suggestedNote, suggestedColor, reason } = req.body;
  if (!suggestedNote?.trim()) return res.status(400).json({ error:"Suggested text required." });
  const result = db.prepare("INSERT INTO annotation_suggestions (annotation_id,user_id,suggested_note,suggested_color,reason) VALUES (?,?,?,?,?)")
    .run(req.params.id, req.user.id, suggestedNote.trim(), suggestedColor??null, (reason||"").trim());
  const s = db.prepare("SELECT s.*,u.username,u.display_name,u.avatar_color FROM annotation_suggestions s JOIN users u ON s.user_id=u.id WHERE s.id=?").get(result.lastInsertRowid);
  notifyAdmins("suggestion", `${s.display_name} suggested an edit to annotation #${req.params.id}`, `/annotation/${req.params.id}`);
  res.json({ id:s.id, annotationId:s.annotation_id, userId:s.user_id,
    suggestedNote:s.suggested_note, suggestedColor:s.suggested_color, reason:s.reason,
    status:s.status, username:s.username, displayName:s.display_name, avatarColor:s.avatar_color,
    createdAt:s.created_at });
});

r.post("/suggestions/:sid/accept", requireAdmin, (req, res) => {
  const s = db.prepare("SELECT * FROM annotation_suggestions WHERE id=?").get(req.params.sid);
  if (!s) return res.status(404).json({ error:"Suggestion not found." });
  // Apply the suggested edit to the annotation
  const updates = ["note=?"];
  const vals = [s.suggested_note];
  if (s.suggested_color !== null) { updates.push("color=?"); vals.push(s.suggested_color); }
  vals.push(s.annotation_id);
  db.prepare(`UPDATE annotations SET ${updates.join(",")} WHERE id=?`).run(...vals);
  db.prepare("UPDATE annotation_suggestions SET status='accepted', resolved_by=?, resolved_at=datetime('now') WHERE id=?").run(req.user.id, req.params.sid);
  const { notify } = require("../notify");
  notify(s.user_id, "suggestion_accepted", "Your annotation edit suggestion was accepted!", `/annotation/${s.annotation_id}`);
  res.json({ ok:true });
});

r.post("/suggestions/:sid/reject", requireAdmin, (req, res) => {
  const s = db.prepare("SELECT * FROM annotation_suggestions WHERE id=?").get(req.params.sid);
  db.prepare("UPDATE annotation_suggestions SET status='rejected', resolved_by=?, resolved_at=datetime('now') WHERE id=?").run(req.user.id, req.params.sid);
  if (s) {
    const { notify } = require("../notify");
    notify(s.user_id, "suggestion_rejected", "Your annotation edit suggestion was not accepted.", `/annotation/${s.annotation_id}`);
  }
  res.json({ ok:true });
});

module.exports = r;
