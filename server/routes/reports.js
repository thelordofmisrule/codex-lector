const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { notifyAdmins } = require("../notify");
const { createRateLimit } = require("../rateLimit");

const r = express.Router();
const reportLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  message: "Too many reports. Please wait before submitting another.",
  keyFn: (req) => `report:${req.ip}:${req.user?.id || "anon"}`,
});

function targetLinkFor(targetType, targetId) {
  const id = String(targetId);
  if (targetType === "annotation") return `/annotation/${id}`;
  if (targetType === "forum_thread") return `/forum/${id}`;
  if (targetType === "forum_reply") {
    const reply = db.prepare("SELECT thread_id FROM forum_replies WHERE id=?").get(id);
    return reply ? `/forum/${reply.thread_id}#comment-${id}` : "";
  }
  if (targetType === "blog_reply") {
    const reply = db.prepare("SELECT post_id FROM blog_replies WHERE id=?").get(id);
    return reply ? `/blog/${reply.post_id}#comment-${id}` : "";
  }
  return "";
}

r.post("/", requireAuth, reportLimit, (req, res) => {
  const { targetType, targetId, reason, details } = req.body || {};
  if (!targetType || !targetId || !reason?.trim()) return res.status(400).json({ error:"targetType, targetId, and reason are required." });
  const allowedTypes = new Set(["annotation", "forum_thread", "forum_reply", "blog_reply"]);
  if (!allowedTypes.has(targetType)) return res.status(400).json({ error:"Unsupported report target." });

  const existing = db.prepare("SELECT id FROM content_reports WHERE user_id=? AND target_type=? AND target_id=? AND status='open'")
    .get(req.user.id, targetType, String(targetId));
  if (existing) return res.status(409).json({ error:"You already reported this item." });

  const result = db.prepare("INSERT INTO content_reports (user_id,target_type,target_id,reason,details) VALUES (?,?,?,?,?)")
    .run(req.user.id, targetType, String(targetId), reason.trim().slice(0,80), (details || "").trim().slice(0,500));
  notifyAdmins("report", `New report: ${targetType} #${targetId}`, "/admin-reports");
  res.json({ id: result.lastInsertRowid });
});

r.get("/", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT cr.*, u.username, u.display_name, ru.display_name AS resolver_name
    FROM content_reports cr
    JOIN users u ON u.id=cr.user_id
    LEFT JOIN users ru ON ru.id=cr.resolved_by
    ORDER BY CASE WHEN cr.status='open' THEN 0 ELSE 1 END, cr.created_at DESC
    LIMIT 300
  `).all();
  res.json(rows.map(row => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLink: targetLinkFor(row.target_type, row.target_id),
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolverName: row.resolver_name,
    username: row.username,
    displayName: row.display_name,
  })));
});

r.post("/:id/resolve", requireAdmin, (req, res) => {
  db.prepare("UPDATE content_reports SET status='resolved', resolved_by=?, resolved_at=datetime('now') WHERE id=?")
    .run(req.user.id, req.params.id);
  res.json({ ok:true });
});

module.exports = r;
