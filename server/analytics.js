const db = require("./db");

function logEvent({ eventType, userId = null, visitorId = null, path = "", meta = null }) {
  try {
    db.prepare("INSERT INTO analytics_events (event_type, user_id, visitor_id, path, meta_json) VALUES (?,?,?,?,?)")
      .run(eventType, userId, visitorId, path || "", meta ? JSON.stringify(meta) : "");
  } catch (e) {
    console.error("Analytics log error:", e.message);
  }
}

module.exports = { logEvent };

