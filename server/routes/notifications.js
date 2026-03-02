const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");
const r = express.Router();

r.get("/", requireAuth, (req, res) => {
  const notifs = db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(req.user.id);
  const unread = db.prepare("SELECT COUNT(*) as n FROM notifications WHERE user_id=? AND read=0").get(req.user.id)?.n || 0;
  res.json({ notifications: notifs, unreadCount: unread });
});

r.post("/:id/read", requireAuth, (req, res) => {
  db.prepare("UPDATE notifications SET read=1 WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ ok:true });
});

r.post("/read-all", requireAuth, (req, res) => {
  db.prepare("UPDATE notifications SET read=1 WHERE user_id=?").run(req.user.id);
  res.json({ ok:true });
});

module.exports = r;
