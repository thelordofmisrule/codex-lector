/**
 * server/notify.js
 * Creates in-app notifications for users.
 */
const db = require("./db");

function notify(userId, type, message, link) {
  if (!userId) return;
  try {
    db.prepare("INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)")
      .run(userId, type, message, link || null);
  } catch (e) {
    console.error("Notification error:", e.message);
  }
}

/** Notify all admins about something */
function notifyAdmins(type, message, link) {
  const admins = db.prepare("SELECT id FROM users WHERE is_admin=1").all();
  for (const a of admins) {
    notify(a.id, type, message, link);
  }
}

/** Notify the author of a post/comment that someone replied */
function notifyReply({ authorId, replierName, replyerId, contentType, contentTitle, link }) {
  // Don't notify yourself
  if (authorId === replyerId) return;
  notify(authorId, "reply", `${replierName} replied to your ${contentType}${contentTitle ? ': "'+contentTitle.slice(0,40)+'"' : ''}`, link);
}

module.exports = { notify, notifyAdmins, notifyReply };
