const express = require("express");
const db = require("../db");
const { requireAuth, optionalAuth } = require("../auth");
const { submitIndexNow } = require("../indexNow");
const r = express.Router();

/* List public layers, optionally include user's own */
r.get("/", optionalAuth, (req, res) => {
  const userId = req.user?.id;
  let layers;
  if (userId) {
    layers = db.prepare(`
      SELECT l.*, u.username, u.display_name, u.avatar_color, u.oauth_avatar,
        (SELECT COUNT(*) FROM annotations WHERE layer_id=l.id) as annotation_count,
        (SELECT COUNT(*) FROM layer_subscriptions WHERE layer_id=l.id) as subscriber_count,
        EXISTS(SELECT 1 FROM layer_subscriptions WHERE user_id=? AND layer_id=l.id) as is_subscribed
      FROM annotation_layers l JOIN users u ON l.user_id=u.id
      WHERE l.is_public=1 OR l.user_id=?
      ORDER BY subscriber_count DESC, l.created_at DESC
    `).all(userId, userId);
  } else {
    layers = db.prepare(`
      SELECT l.*, u.username, u.display_name, u.avatar_color, u.oauth_avatar,
        (SELECT COUNT(*) FROM annotations WHERE layer_id=l.id) as annotation_count,
        (SELECT COUNT(*) FROM layer_subscriptions WHERE layer_id=l.id) as subscriber_count,
        0 as is_subscribed
      FROM annotation_layers l JOIN users u ON l.user_id=u.id
      WHERE l.is_public=1
      ORDER BY subscriber_count DESC, l.created_at DESC
    `).all();
  }
  res.json(layers.map(l => ({
    id:l.id, name:l.name, description:l.description, isPublic:!!l.is_public,
    userId:l.user_id, username:l.username, displayName:l.display_name,
    avatarColor:l.avatar_color, oauthAvatar:l.oauth_avatar,
    annotationCount:l.annotation_count, subscriberCount:l.subscriber_count,
    isSubscribed:!!l.is_subscribed, isOwner:l.user_id===userId,
    createdAt:l.created_at,
  })));
});

/* Get a single layer with its annotations */
r.get("/:id", optionalAuth, (req, res) => {
  const layer = db.prepare(`
    SELECT l.*, u.username, u.display_name FROM annotation_layers l
    JOIN users u ON l.user_id=u.id WHERE l.id=?
  `).get(req.params.id);
  if (!layer) return res.status(404).json({ error:"Layer not found." });
  if (!layer.is_public && layer.user_id !== req.user?.id) return res.status(403).json({ error:"Private layer." });

  const annots = db.prepare(`
    SELECT a.*, w.title as work_title, w.slug as work_slug
    FROM annotations a JOIN works w ON a.work_id=w.id
    WHERE a.layer_id=? ORDER BY w.title, a.line_id
  `).all(layer.id);

  res.json({
    layer:{ id:layer.id, name:layer.name, description:layer.description, isPublic:!!layer.is_public, username:layer.username, displayName:layer.display_name },
    annotations:annots,
  });
});

/* Create a layer */
r.post("/", requireAuth, (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error:"Name required." });
  const result = db.prepare("INSERT INTO annotation_layers (user_id, name, description) VALUES (?,?,?)")
    .run(req.user.id, name.trim().slice(0,80), (description||"").trim().slice(0,300));
  res.json({ id:result.lastInsertRowid });
});

/* Update a layer */
r.put("/:id", requireAuth, (req, res) => {
  const layer = db.prepare("SELECT * FROM annotation_layers WHERE id=?").get(req.params.id);
  if (!layer || layer.user_id !== req.user.id) return res.status(403).json({ error:"Forbidden." });
  const { name, description, isPublic } = req.body;
  if (name !== undefined) db.prepare("UPDATE annotation_layers SET name=? WHERE id=?").run(name.trim().slice(0,80), layer.id);
  if (description !== undefined) db.prepare("UPDATE annotation_layers SET description=? WHERE id=?").run(description.trim().slice(0,300), layer.id);
  if (isPublic !== undefined) db.prepare("UPDATE annotation_layers SET is_public=? WHERE id=?").run(isPublic?1:0, layer.id);
  if (isPublic) submitIndexNow([`/layers/${layer.id}`]);
  res.json({ ok:true });
});

/* Delete a layer (removes annotations from layer but doesn't delete them) */
r.delete("/:id", requireAuth, (req, res) => {
  const layer = db.prepare("SELECT * FROM annotation_layers WHERE id=?").get(req.params.id);
  if (!layer || layer.user_id !== req.user.id) return res.status(403).json({ error:"Forbidden." });
  db.prepare("UPDATE annotations SET layer_id=NULL WHERE layer_id=?").run(layer.id);
  db.prepare("DELETE FROM layer_subscriptions WHERE layer_id=?").run(layer.id);
  db.prepare("DELETE FROM annotation_layers WHERE id=?").run(layer.id);
  res.json({ ok:true });
});

/* Subscribe to a layer */
r.post("/:id/subscribe", requireAuth, (req, res) => {
  const layer = db.prepare("SELECT * FROM annotation_layers WHERE id=? AND is_public=1").get(req.params.id);
  if (!layer) return res.status(404).json({ error:"Layer not found." });
  try {
    db.prepare("INSERT OR IGNORE INTO layer_subscriptions (user_id, layer_id) VALUES (?,?)").run(req.user.id, layer.id);
  } catch {}
  res.json({ ok:true });
});

/* Unsubscribe */
r.delete("/:id/subscribe", requireAuth, (req, res) => {
  db.prepare("DELETE FROM layer_subscriptions WHERE user_id=? AND layer_id=?").run(req.user.id, req.params.id);
  res.json({ ok:true });
});

/* Add annotation to a layer */
r.post("/:id/add-annotation", requireAuth, (req, res) => {
  const layer = db.prepare("SELECT * FROM annotation_layers WHERE id=?").get(req.params.id);
  if (!layer || layer.user_id !== req.user.id) return res.status(403).json({ error:"Not your layer." });
  const { annotationId } = req.body;
  const ann = db.prepare("SELECT * FROM annotations WHERE id=? AND user_id=?").get(annotationId, req.user.id);
  if (!ann) return res.status(404).json({ error:"Annotation not found." });
  db.prepare("UPDATE annotations SET layer_id=? WHERE id=?").run(layer.id, ann.id);
  res.json({ ok:true });
});

/* Remove annotation from layer */
r.post("/:id/remove-annotation", requireAuth, (req, res) => {
  const layer = db.prepare("SELECT * FROM annotation_layers WHERE id=?").get(req.params.id);
  if (!layer || layer.user_id !== req.user.id) return res.status(403).json({ error:"Not your layer." });
  const { annotationId } = req.body;
  db.prepare("UPDATE annotations SET layer_id=NULL WHERE id=? AND layer_id=?").run(annotationId, layer.id);
  res.json({ ok:true });
});

module.exports = r;
