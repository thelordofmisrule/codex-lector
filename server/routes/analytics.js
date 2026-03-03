const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../auth");
const { createRateLimit } = require("../rateLimit");
const { logEvent } = require("../analytics");

const r = express.Router();

const eventLimit = createRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  message: "Too many analytics events. Please slow down.",
  keyFn: (req) => `analytics:${req.ip}:${req.user?.id || req.body?.visitorId || "anon"}`,
});

r.post("/event", eventLimit, (req, res) => {
  const { eventType, visitorId, path, meta } = req.body || {};
  const allowed = new Set(["work_view"]);
  if (!allowed.has(eventType)) return res.status(400).json({ error:"Unsupported event type." });

  logEvent({
    eventType,
    userId: req.user?.id || null,
    visitorId: typeof visitorId === "string" ? visitorId.slice(0, 80) : null,
    path: typeof path === "string" ? path.slice(0, 200) : "",
    meta: meta && typeof meta === "object" ? meta : null,
  });
  res.json({ ok:true });
});

r.get("/summary", requireAdmin, (req, res) => {
  const last7 = db.prepare(`
    SELECT
      COUNT(*) AS views,
      COUNT(DISTINCT CASE
        WHEN user_id IS NOT NULL THEN 'u:' || user_id
        WHEN visitor_id IS NOT NULL AND visitor_id != '' THEN 'v:' || visitor_id
        ELSE NULL
      END) AS uniques
    FROM analytics_events
    WHERE event_type='work_view' AND created_at >= datetime('now', '-7 days')
  `).get();

  const accounts = db.prepare(`
    SELECT COUNT(*) AS n
    FROM analytics_events
    WHERE event_type='account_created' AND created_at >= datetime('now', '-30 days')
  `).get();

  const firstAnnotations = db.prepare(`
    SELECT COUNT(*) AS n
    FROM analytics_events
    WHERE event_type='first_annotation' AND created_at >= datetime('now', '-30 days')
  `).get();

  const returning = db.prepare(`
    SELECT COUNT(*) AS n
    FROM (
      SELECT
        CASE
          WHEN user_id IS NOT NULL THEN 'u:' || user_id
          WHEN visitor_id IS NOT NULL AND visitor_id != '' THEN 'v:' || visitor_id
          ELSE NULL
        END AS ident
      FROM analytics_events
      WHERE event_type='work_view'
        AND created_at >= datetime('now', '-7 days')
        AND (user_id IS NOT NULL OR (visitor_id IS NOT NULL AND visitor_id != ''))
      GROUP BY ident
      HAVING EXISTS (
        SELECT 1
        FROM analytics_events older
        WHERE older.event_type='work_view'
          AND older.created_at < datetime('now', '-7 days')
          AND (
            (older.user_id IS NOT NULL AND 'u:' || older.user_id = ident) OR
            (older.user_id IS NULL AND older.visitor_id IS NOT NULL AND older.visitor_id != '' AND 'v:' || older.visitor_id = ident)
          )
      )
    )
  `).get();

  res.json({
    workViews7d: last7?.views || 0,
    uniqueReaders7d: last7?.uniques || 0,
    accounts30d: accounts?.n || 0,
    firstAnnotations30d: firstAnnotations?.n || 0,
    returningReaders7d: returning?.n || 0,
  });
});

module.exports = r;
