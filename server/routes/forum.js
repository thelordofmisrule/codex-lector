const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");
const { notifyReply } = require("../notify");
const { createRateLimit } = require("../rateLimit");
const { submitIndexNow } = require("../indexNow");
const r = express.Router();
const threadLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many new threads. Please wait before posting another.",
  keyFn: (req) => `forum:thread:${req.ip}:${req.user?.id || "anon"}`,
});
const replyLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 35,
  message: "Too many replies. Please wait a bit before posting again.",
  keyFn: (req) => `forum:reply:${req.ip}:${req.user?.id || "anon"}`,
});

// Get all tags
r.get("/tags", (req, res) => {
  const tags = db.prepare("SELECT * FROM forum_tags ORDER BY name").all();
  // Include thread count per tag
  const counts = db.prepare(`
    SELECT tag_id, COUNT(*) as count FROM forum_thread_tags GROUP BY tag_id
  `).all();
  const countMap = {};
  counts.forEach(c => { countMap[c.tag_id] = c.count; });
  res.json(tags.map(t => ({ ...t, threadCount: countMap[t.id] || 0 })));
});

// List threads (with optional tag filter and search)
r.get("/", (req, res) => {
  const { tag, search } = req.query;
  let sql = `
    SELECT t.*, u.username, u.display_name, u.is_admin,
      (SELECT COUNT(*) FROM forum_replies WHERE thread_id=t.id) as reply_count,
      GROUP_CONCAT(ft.name, '||') as tag_names,
      GROUP_CONCAT(ft.color, '||') as tag_colors,
      GROUP_CONCAT(ft.id, '||') as tag_ids
    FROM forum_threads t
    JOIN users u ON t.user_id=u.id
    LEFT JOIN forum_thread_tags ftt ON ftt.thread_id=t.id
    LEFT JOIN forum_tags ft ON ft.id=ftt.tag_id
  `;
  const conditions = [];
  const params = [];

  if (tag) {
    conditions.push("EXISTS (SELECT 1 FROM forum_thread_tags ftt2 JOIN forum_tags ft2 ON ft2.id=ftt2.tag_id WHERE ftt2.thread_id=t.id AND ft2.name=?)");
    params.push(tag);
  }
  if (search) {
    conditions.push("(t.title LIKE ? OR t.body LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " GROUP BY t.id ORDER BY t.updated_at DESC";

  const threads = db.prepare(sql).all(...params);
  res.json(threads.map(t => {
    const names = t.tag_names ? t.tag_names.split("||") : [];
    const colors = t.tag_colors ? t.tag_colors.split("||") : [];
    const ids = t.tag_ids ? t.tag_ids.split("||") : [];
    return {
      id:t.id, title:t.title, body:t.body, userId:t.user_id,
      username:t.username, displayName:t.display_name, isAdmin:!!t.is_admin,
      replyCount:t.reply_count, createdAt:t.created_at, updatedAt:t.updated_at,
      tags: names.map((n,i) => ({ id:parseInt(ids[i]), name:n, color:colors[i] })),
    };
  }));
});

// Get thread + replies
r.get("/:id", (req, res) => {
  const t = db.prepare("SELECT t.*,u.username,u.display_name,u.is_admin FROM forum_threads t JOIN users u ON t.user_id=u.id WHERE t.id=?").get(req.params.id);
  if (!t) return res.status(404).json({ error:"Not found." });

  const tags = db.prepare(`
    SELECT ft.* FROM forum_tags ft JOIN forum_thread_tags ftt ON ft.id=ftt.tag_id WHERE ftt.thread_id=?
  `).all(t.id);

  const replies = db.prepare(`
    SELECT r.*,u.username,u.display_name,u.is_admin FROM forum_replies r
    JOIN users u ON r.user_id=u.id WHERE r.thread_id=? ORDER BY r.created_at
  `).all(t.id);

  res.json({
    thread: { id:t.id, title:t.title, body:t.body, userId:t.user_id, username:t.username,
      displayName:t.display_name, isAdmin:!!t.is_admin, createdAt:t.created_at, updatedAt:t.updated_at, tags },
    replies: replies.map(r2 => ({
      id:r2.id, parentId:r2.parent_id, userId:r2.user_id, body:r2.body, username:r2.username,
      displayName:r2.display_name, isAdmin:!!r2.is_admin, createdAt:r2.created_at, updatedAt:r2.updated_at,
    })),
  });
});

// Create thread (with tags)
r.post("/", requireAuth, threadLimit, (req, res) => {
  const { title, body, tagIds } = req.body;
  if (!title?.trim()||!body?.trim()) return res.status(400).json({ error:"Title and body required." });
  const result = db.prepare("INSERT INTO forum_threads (user_id,title,body) VALUES (?,?,?)").run(req.user.id, title.trim(), body.trim());
  const threadId = result.lastInsertRowid;
  if (tagIds?.length) {
    const ins = db.prepare("INSERT OR IGNORE INTO forum_thread_tags (thread_id, tag_id) VALUES (?,?)");
    tagIds.forEach(tid => ins.run(threadId, tid));
  }
  submitIndexNow([`/forum/${threadId}`]);
  res.json({ id: threadId });
});

// Edit thread
r.put("/:id", requireAuth, (req, res) => {
  const t = db.prepare("SELECT * FROM forum_threads WHERE id=?").get(req.params.id);
  if (!t) return res.status(404).json({ error:"Not found." });
  if (t.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  const { title, body, tagIds } = req.body;
  if (title) db.prepare("UPDATE forum_threads SET title=?, updated_at=datetime('now') WHERE id=?").run(title.trim(), req.params.id);
  if (body) db.prepare("UPDATE forum_threads SET body=?, updated_at=datetime('now') WHERE id=?").run(body.trim(), req.params.id);
  if (tagIds) {
    db.prepare("DELETE FROM forum_thread_tags WHERE thread_id=?").run(req.params.id);
    const ins = db.prepare("INSERT OR IGNORE INTO forum_thread_tags (thread_id, tag_id) VALUES (?,?)");
    tagIds.forEach(tid => ins.run(req.params.id, tid));
  }
  submitIndexNow([`/forum/${req.params.id}`]);
  res.json({ ok:true });
});

// Reply to thread
r.post("/:id/reply", requireAuth, replyLimit, (req, res) => {
  const { body, parentId } = req.body;
  if (!body?.trim()) return res.status(400).json({ error:"Body required." });
  // Also bump thread updated_at
  db.prepare("UPDATE forum_threads SET updated_at=datetime('now') WHERE id=?").run(req.params.id);
  const result = db.prepare("INSERT INTO forum_replies (thread_id,user_id,parent_id,body) VALUES (?,?,?,?)")
    .run(req.params.id, req.user.id, parentId||null, body.trim());
  const reply = db.prepare("SELECT r.*,u.username,u.display_name,u.is_admin FROM forum_replies r JOIN users u ON r.user_id=u.id WHERE r.id=?").get(result.lastInsertRowid);
  // Notify thread author
  const thread = db.prepare("SELECT user_id,title FROM forum_threads WHERE id=?").get(req.params.id);
  if (thread) notifyReply({ authorId:thread.user_id, replierName:reply.display_name, replyerId:req.user.id, contentType:"forum thread", contentTitle:thread.title, link:`/forum/${req.params.id}` });
  // Notify parent reply author
  if (parentId) {
    const parent = db.prepare("SELECT user_id FROM forum_replies WHERE id=?").get(parentId);
    if (parent && parent.user_id !== thread?.user_id) notifyReply({ authorId:parent.user_id, replierName:reply.display_name, replyerId:req.user.id, contentType:"comment", link:`/forum/${req.params.id}` });
  }
  res.json({ id:reply.id, parentId:reply.parent_id, userId:reply.user_id, body:reply.body,
    username:reply.username, displayName:reply.display_name, isAdmin:!!reply.is_admin,
    createdAt:reply.created_at, updatedAt:reply.updated_at });
});

// Edit reply
r.put("/reply/:id", requireAuth, (req, res) => {
  const reply = db.prepare("SELECT * FROM forum_replies WHERE id=?").get(req.params.id);
  if (!reply) return res.status(404).json({ error:"Not found." });
  if (reply.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error:"Body required." });
  db.prepare("UPDATE forum_replies SET body=?, updated_at=datetime('now') WHERE id=?").run(body.trim(), req.params.id);
  res.json({ ok:true });
});

// Delete thread
r.delete("/thread/:id", requireAuth, (req, res) => {
  const t = db.prepare("SELECT * FROM forum_threads WHERE id=?").get(req.params.id);
  if (!t) return res.status(404).json({ error:"Not found." });
  if (t.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  db.prepare("DELETE FROM forum_threads WHERE id=?").run(req.params.id);
  res.json({ ok:true });
});

// Delete reply
r.delete("/reply/:id", requireAuth, (req, res) => {
  const reply = db.prepare("SELECT * FROM forum_replies WHERE id=?").get(req.params.id);
  if (!reply) return res.status(404).json({ error:"Not found." });
  if (reply.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  db.prepare("DELETE FROM forum_replies WHERE id=?").run(req.params.id);
  res.json({ ok:true });
});

module.exports = r;
