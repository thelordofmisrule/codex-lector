const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { notifyReply } = require("../notify");
const r = express.Router();

r.get("/", (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.username, u.display_name,
      (SELECT COUNT(*) FROM blog_replies WHERE post_id=p.id) as reply_count
    FROM blog_posts p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC
  `).all();
  res.json(posts.map(p => ({
    id:p.id, title:p.title, body:p.body, author:p.display_name,
    authorUsername:p.username, replyCount:p.reply_count,
    createdAt:p.created_at, updatedAt:p.updated_at,
  })));
});

r.get("/:id", (req, res) => {
  const p = db.prepare("SELECT p.*,u.username,u.display_name FROM blog_posts p JOIN users u ON p.user_id=u.id WHERE p.id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error:"Not found." });
  const replies = db.prepare(`
    SELECT r.*,u.username,u.display_name,u.is_admin FROM blog_replies r
    JOIN users u ON r.user_id=u.id WHERE r.post_id=? ORDER BY r.created_at
  `).all(p.id);
  res.json({
    post: { id:p.id, title:p.title, body:p.body, author:p.display_name, authorUsername:p.username, createdAt:p.created_at, updatedAt:p.updated_at },
    replies: replies.map(r2 => ({
      id:r2.id, parentId:r2.parent_id, userId:r2.user_id, body:r2.body, username:r2.username,
      displayName:r2.display_name, isAdmin:!!r2.is_admin, createdAt:r2.created_at, updatedAt:r2.updated_at,
    })),
  });
});

r.post("/", requireAdmin, (req, res) => {
  const { title, body } = req.body;
  if (!title?.trim()||!body?.trim()) return res.status(400).json({ error:"Title and body required." });
  const result = db.prepare("INSERT INTO blog_posts (user_id,title,body) VALUES (?,?,?)").run(req.user.id, title.trim(), body.trim());
  res.json({ id:result.lastInsertRowid });
});

r.put("/:id", requireAdmin, (req, res) => {
  const { title, body } = req.body;
  db.prepare("UPDATE blog_posts SET title=COALESCE(?,title), body=COALESCE(?,body), updated_at=datetime('now') WHERE id=?")
    .run(title||null, body||null, req.params.id);
  res.json({ ok:true });
});

r.post("/:id/reply", requireAuth, (req, res) => {
  const { body, parentId } = req.body;
  if (!body?.trim()) return res.status(400).json({ error:"Body required." });
  const result = db.prepare("INSERT INTO blog_replies (post_id,user_id,parent_id,body) VALUES (?,?,?,?)")
    .run(req.params.id, req.user.id, parentId||null, body.trim());
  const reply = db.prepare("SELECT r.*,u.username,u.display_name,u.is_admin FROM blog_replies r JOIN users u ON r.user_id=u.id WHERE r.id=?").get(result.lastInsertRowid);
  // Notify post author
  const post = db.prepare("SELECT user_id,title FROM blog_posts WHERE id=?").get(req.params.id);
  if (post) notifyReply({ authorId:post.user_id, replierName:reply.display_name, replyerId:req.user.id, contentType:"blog post", contentTitle:post.title, link:`/blog/${req.params.id}` });
  // Notify parent reply author
  if (parentId) {
    const parent = db.prepare("SELECT user_id FROM blog_replies WHERE id=?").get(parentId);
    if (parent && parent.user_id !== post?.user_id) notifyReply({ authorId:parent.user_id, replierName:reply.display_name, replyerId:req.user.id, contentType:"comment", link:`/blog/${req.params.id}` });
  }
  res.json({ id:reply.id, parentId:reply.parent_id, userId:reply.user_id, body:reply.body, username:reply.username,
    displayName:reply.display_name, isAdmin:!!reply.is_admin, createdAt:reply.created_at, updatedAt:reply.updated_at });
});

r.put("/reply/:id", requireAuth, (req, res) => {
  const reply = db.prepare("SELECT * FROM blog_replies WHERE id=?").get(req.params.id);
  if (!reply) return res.status(404).json({ error:"Not found." });
  if (reply.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  const { body } = req.body;
  db.prepare("UPDATE blog_replies SET body=?, updated_at=datetime('now') WHERE id=?").run(body.trim(), req.params.id);
  res.json({ ok:true });
});

r.delete("/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM blog_posts WHERE id=?").run(req.params.id);
  res.json({ ok:true });
});

r.delete("/reply/:id", requireAuth, (req, res) => {
  const reply = db.prepare("SELECT * FROM blog_replies WHERE id=?").get(req.params.id);
  if (!reply) return res.status(404).json({ error:"Not found." });
  if (reply.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error:"Forbidden." });
  db.prepare("DELETE FROM blog_replies WHERE id=?").run(req.params.id);
  res.json({ ok:true });
});

module.exports = r;
