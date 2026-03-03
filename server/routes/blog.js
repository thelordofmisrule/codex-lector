const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { notifyReply } = require("../notify");
const { createRateLimit } = require("../rateLimit");
const { submitIndexNow } = require("../indexNow");
const r = express.Router();
const blogCreateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: "Too many blog posts. Please wait before publishing another.",
  keyFn: (req) => `blog:create:${req.ip}:${req.user?.id || "anon"}`,
});
const blogReplyLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: "Too many responses. Please wait before posting again.",
  keyFn: (req) => `blog:reply:${req.ip}:${req.user?.id || "anon"}`,
});

r.get("/", (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.username, u.display_name,
      (SELECT COUNT(*) FROM blog_replies WHERE post_id=p.id) as reply_count
    FROM blog_posts p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC
  `).all();
  res.json(posts.map(p => ({
    id:p.id, title:p.title, body:p.body, headerImage:p.header_image || "", author:p.display_name,
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
    post: { id:p.id, title:p.title, body:p.body, headerImage:p.header_image || "", author:p.display_name, authorUsername:p.username, createdAt:p.created_at, updatedAt:p.updated_at },
    replies: replies.map(r2 => ({
      id:r2.id, parentId:r2.parent_id, userId:r2.user_id, body:r2.body, username:r2.username,
      displayName:r2.display_name, isAdmin:!!r2.is_admin, createdAt:r2.created_at, updatedAt:r2.updated_at,
    })),
  });
});

r.post("/upload-image", requireAdmin, (req, res) => {
  const { fileName, mimeType, dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return res.status(400).json({ error:"Image data required." });
  }

  const allowed = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const ext = allowed[mimeType];
  if (!ext) return res.status(400).json({ error:"Unsupported image type." });

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error:"Invalid image payload." });

  const buf = Buffer.from(match[2], "base64");
  if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ error:"Image too large (max 5MB)." });

  const dir = path.join(__dirname, "..", "..", "data", "media", "blog");
  fs.mkdirSync(dir, { recursive: true });
  const safeBase = (fileName || "header").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "header";
  const name = `${safeBase}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  res.json({ url:`/media/blog/${name}` });
});

r.post("/", requireAdmin, blogCreateLimit, (req, res) => {
  const { title, body, headerImage } = req.body;
  if (!title?.trim()||!body?.trim()) return res.status(400).json({ error:"Title and body required." });
  const result = db.prepare("INSERT INTO blog_posts (user_id,title,header_image,body) VALUES (?,?,?,?)").run(req.user.id, title.trim(), (headerImage||"").trim(), body.trim());
  submitIndexNow([`/blog/${result.lastInsertRowid}`]);
  res.json({ id:result.lastInsertRowid });
});

r.put("/:id", requireAdmin, (req, res) => {
  const { title, body, headerImage } = req.body;
  db.prepare("UPDATE blog_posts SET title=COALESCE(?,title), header_image=COALESCE(?,header_image), body=COALESCE(?,body), updated_at=datetime('now') WHERE id=?")
    .run(title||null, headerImage ?? null, body||null, req.params.id);
  submitIndexNow([`/blog/${req.params.id}`]);
  res.json({ ok:true });
});

r.post("/:id/reply", requireAuth, blogReplyLimit, (req, res) => {
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
