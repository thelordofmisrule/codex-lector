const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");
const { notify } = require("../notify");
const { createRateLimit } = require("../rateLimit");

const r = express.Router();
const MAX_MESSAGE_LENGTH = 500;
const MAX_FETCH_LIMIT = 120;
const streamClients = new Set();

const messageLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: "You are sending messages too quickly. Please slow down.",
  keyFn: (req) => `chat:message:${req.ip}:${req.user?.id || "anon"}`,
});

const SPECIAL_ROOMS = {
  lobby: {
    key: "lobby",
    label: "Lobby",
    kind: "global",
    description: "General conversation across Codex Lector.",
  },
  "year-2026-2027": {
    key: "year-2026-2027",
    label: "Year of Shakespeare",
    kind: "program",
    description: "Shared reading room for March 11, 2026 through March 10, 2027.",
  },
};

function specialRoom(roomKey) {
  return SPECIAL_ROOMS[roomKey] || null;
}

function resolveRoom(roomKeyRaw, workSlugRaw) {
  const roomKey = String(roomKeyRaw || "").trim();
  const explicitWorkSlug = String(workSlugRaw || "").trim();

  if (explicitWorkSlug) {
    const work = db.prepare("SELECT slug, title FROM works WHERE slug=?").get(explicitWorkSlug);
    if (!work) throw new Error("Work room not found.");
    return {
      roomKey: `work:${work.slug}`,
      workSlug: work.slug,
      label: work.title,
      kind: "work",
      description: `Live chat for ${work.title}.`,
    };
  }

  if (!roomKey || roomKey === "lobby") {
    return { roomKey: "lobby", workSlug: "", ...SPECIAL_ROOMS.lobby };
  }

  const special = specialRoom(roomKey);
  if (special) return { roomKey: special.key, workSlug: "", ...special };

  if (roomKey.startsWith("work:")) {
    const workSlug = roomKey.slice(5).trim();
    const work = db.prepare("SELECT slug, title FROM works WHERE slug=?").get(workSlug);
    if (!work) throw new Error("Work room not found.");
    return {
      roomKey: `work:${work.slug}`,
      workSlug: work.slug,
      label: work.title,
      kind: "work",
      description: `Live chat for ${work.title}.`,
    };
  }

  throw new Error("Unknown chat room.");
}

function normalizeStats(row) {
  return {
    messageCount: Number(row?.message_count) || 0,
    lastMessageAt: row?.last_message_at || null,
    lastMessageId: Number(row?.last_message_id) || 0,
  };
}

function roomStats(roomKey) {
  return normalizeStats(db.prepare(`
    SELECT COUNT(*) AS message_count, MAX(created_at) AS last_message_at, MAX(id) AS last_message_id
    FROM chat_messages
    WHERE room_key=?
  `).get(roomKey));
}

function loadMembership(userId, roomKey) {
  return db.prepare(`
    SELECT room_key, work_slug, is_subscribed, last_seen_message_id, last_seen_at
    FROM chat_room_memberships
    WHERE user_id=? AND room_key=?
  `).get(userId, roomKey) || null;
}

function membershipState(row, stats = {}) {
  const isSubscribed = !!row?.is_subscribed;
  const lastSeenMessageId = Number(row?.last_seen_message_id) || 0;
  return {
    isSubscribed,
    lastSeenMessageId,
    hasUnread: isSubscribed && (Number(stats.lastMessageId) || 0) > lastSeenMessageId,
  };
}

function serializeRoom(room, stats = {}, membership = null) {
  const state = membershipState(membership, stats);
  return {
    key: room.roomKey,
    label: room.label,
    kind: room.kind,
    description: room.description,
    workSlug: room.workSlug || "",
    messageCount: Number(stats.messageCount) || 0,
    lastMessageAt: stats.lastMessageAt || null,
    lastMessageId: Number(stats.lastMessageId) || 0,
    isSubscribed: state.isSubscribed,
    hasUnread: state.hasUnread,
    lastSeenMessageId: state.lastSeenMessageId,
  };
}

function serializeMessage(row) {
  return {
    id: row.id,
    roomKey: row.room_key,
    workSlug: row.work_slug || "",
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarColor: row.avatar_color || "#7A1E2E",
    oauthAvatar: row.oauth_avatar || "",
    isAdmin: !!row.is_admin,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadMessage(id) {
  return db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar_color, u.oauth_avatar, u.is_admin
    FROM chat_messages m
    JOIN users u ON u.id=m.user_id
    WHERE m.id=?
  `).get(id);
}

function broadcast(eventName, payload) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...streamClients]) {
    try {
      client.write(frame);
    } catch {
      streamClients.delete(client);
    }
  }
}

function markRoomSeen(userId, room, lastSeenMessageId) {
  const seenId = Math.max(0, Number(lastSeenMessageId) || 0);
  db.prepare(`
    INSERT INTO chat_room_memberships (
      user_id, room_key, work_slug, is_subscribed, last_seen_message_id, last_seen_at, created_at, updated_at
    )
    VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, room_key) DO UPDATE SET
      work_slug=excluded.work_slug,
      last_seen_message_id=CASE
        WHEN excluded.last_seen_message_id > COALESCE(chat_room_memberships.last_seen_message_id, 0)
          THEN excluded.last_seen_message_id
        ELSE COALESCE(chat_room_memberships.last_seen_message_id, 0)
      END,
      last_seen_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP
  `).run(userId, room.roomKey, room.workSlug || null, seenId);
}

function setRoomSubscription(userId, room, subscribed, stats) {
  if (subscribed) {
    const seenId = Math.max(0, Number(stats?.lastMessageId) || 0);
    db.prepare(`
      INSERT INTO chat_room_memberships (
        user_id, room_key, work_slug, is_subscribed, last_seen_message_id, last_seen_at, created_at, updated_at
      )
      VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, room_key) DO UPDATE SET
        work_slug=excluded.work_slug,
        is_subscribed=1,
        last_seen_message_id=CASE
          WHEN excluded.last_seen_message_id > COALESCE(chat_room_memberships.last_seen_message_id, 0)
            THEN excluded.last_seen_message_id
          ELSE COALESCE(chat_room_memberships.last_seen_message_id, 0)
        END,
        last_seen_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
    `).run(userId, room.roomKey, room.workSlug || null, seenId);
    return;
  }

  db.prepare(`
    INSERT INTO chat_room_memberships (
      user_id, room_key, work_slug, is_subscribed, created_at, updated_at
    )
    VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, room_key) DO UPDATE SET
      work_slug=excluded.work_slug,
      is_subscribed=0,
      updated_at=CURRENT_TIMESTAMP
  `).run(userId, room.roomKey, room.workSlug || null);
}

function messageLink(room, messageId) {
  const params = new URLSearchParams();
  if (room.workSlug) params.set("work", room.workSlug);
  else if (room.roomKey && room.roomKey !== "lobby") params.set("room", room.roomKey);
  const suffix = messageId ? `#chat-message-${messageId}` : "";
  return `/chat${params.toString() ? `?${params.toString()}` : ""}${suffix}`;
}

function extractMentionedUsernames(body) {
  const matches = new Set();
  const regex = /(^|[^a-z0-9_])@([a-z0-9_]{3,24})(?=$|[^a-z0-9_])/gi;
  let match = regex.exec(body);
  while (match) {
    matches.add(String(match[2] || "").toLowerCase());
    match = regex.exec(body);
  }
  return [...matches];
}

function notifyMentionedUsers(author, room, message) {
  const usernames = extractMentionedUsernames(message.body)
    .filter((username) => username && username !== String(author.username || "").toLowerCase());
  if (!usernames.length) return;

  const placeholders = usernames.map(() => "?").join(",");
  const users = db.prepare(`
    SELECT id, username
    FROM users
    WHERE username IN (${placeholders})
  `).all(...usernames);

  const authorName = author.displayName || author.display_name || author.username || "Someone";
  for (const user of users) {
    notify(
      user.id,
      "chat_mention",
      `${authorName} mentioned you in ${room.label}.`,
      messageLink(room, message.id),
    );
  }
}

function loadMembershipMap(userId) {
  const rows = db.prepare(`
    SELECT room_key, work_slug, is_subscribed, last_seen_message_id, last_seen_at
    FROM chat_room_memberships
    WHERE user_id=?
  `).all(userId);
  return new Map(rows.map((row) => [row.room_key, row]));
}

r.get("/summary", requireAuth, (req, res) => {
  const mentionCount = Number(db.prepare(`
    SELECT COUNT(*) AS n
    FROM notifications
    WHERE user_id=? AND type='chat_mention' AND read=0
  `).get(req.user.id)?.n) || 0;

  const unreadRoomRows = db.prepare(`
    SELECT m.room_key
    FROM chat_room_memberships m
    JOIN (
      SELECT room_key, MAX(id) AS last_message_id
      FROM chat_messages
      GROUP BY room_key
    ) stats ON stats.room_key = m.room_key
    WHERE m.user_id=?
      AND m.is_subscribed=1
      AND COALESCE(stats.last_message_id, 0) > COALESCE(m.last_seen_message_id, 0)
  `).all(req.user.id);

  const unreadRoomKeys = unreadRoomRows.map((row) => row.room_key);
  res.json({
    unreadMentionCount: mentionCount,
    unreadRoomCount: unreadRoomKeys.length,
    unreadRoomKeys,
    hasUnread: mentionCount > 0 || unreadRoomKeys.length > 0,
  });
});

r.get("/rooms", requireAuth, (req, res) => {
  const statsRows = db.prepare(`
    SELECT room_key, work_slug, COUNT(*) AS message_count, MAX(created_at) AS last_message_at, MAX(id) AS last_message_id
    FROM chat_messages
    GROUP BY room_key, work_slug
  `).all();
  const roomStats = new Map(statsRows.map((row) => [
    row.room_key,
    normalizeStats(row),
  ]));
  const membershipMap = loadMembershipMap(req.user.id);

  const specialRooms = Object.values(SPECIAL_ROOMS).map((room) => (
    serializeRoom(
      { roomKey: room.key, workSlug: "", label: room.label, kind: room.kind, description: room.description },
      roomStats.get(room.key) || {},
      membershipMap.get(room.key) || null,
    )
  ));

  const activeWorkRooms = db.prepare(`
    SELECT m.work_slug, w.title, COUNT(*) AS message_count, MAX(m.created_at) AS last_message_at, MAX(m.id) AS last_message_id
    FROM chat_messages m
    JOIN works w ON w.slug=m.work_slug
    WHERE m.work_slug IS NOT NULL AND m.work_slug<>''
    GROUP BY m.work_slug, w.title
    ORDER BY last_message_at DESC
    LIMIT 24
  `).all().map((row) => serializeRoom({
    roomKey: `work:${row.work_slug}`,
    workSlug: row.work_slug,
    label: row.title,
    kind: "work",
    description: `Live chat for ${row.title}.`,
  }, normalizeStats(row), membershipMap.get(`work:${row.work_slug}`) || null));

  res.json({ specialRooms, activeWorkRooms });
});

r.get("/messages", requireAuth, (req, res) => {
  let room;
  try {
    room = resolveRoom(req.query.room, req.query.work);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Unknown chat room." });
  }

  const requestedLimit = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_FETCH_LIMIT, requestedLimit))
    : 80;

  const rows = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar_color, u.oauth_avatar, u.is_admin
    FROM chat_messages m
    JOIN users u ON u.id=m.user_id
    WHERE m.room_key=?
    ORDER BY m.id DESC
    LIMIT ?
  `).all(room.roomKey, limit);

  const stats = roomStats(room.roomKey);
  const membership = loadMembership(req.user.id, room.roomKey);

  res.json({
    room: serializeRoom(room, stats, membership),
    messages: rows.reverse().map(serializeMessage),
  });
});

r.post("/rooms/subscribe", requireAuth, (req, res) => {
  let room;
  try {
    room = resolveRoom(req.body?.roomKey, req.body?.workSlug);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Unknown chat room." });
  }

  const subscribed = !!req.body?.subscribed;
  const stats = roomStats(room.roomKey);
  setRoomSubscription(req.user.id, room, subscribed, stats);
  const membership = loadMembership(req.user.id, room.roomKey);
  res.json({ room: serializeRoom(room, stats, membership) });
});

r.post("/rooms/seen", requireAuth, (req, res) => {
  let room;
  try {
    room = resolveRoom(req.body?.roomKey, req.body?.workSlug);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Unknown chat room." });
  }

  const requestedSeenId = Math.max(0, parseInt(req.body?.lastSeenMessageId, 10) || 0);
  const stats = roomStats(room.roomKey);
  const seenId = Math.min(requestedSeenId || stats.lastMessageId, stats.lastMessageId || requestedSeenId);
  markRoomSeen(req.user.id, room, seenId);
  const membership = loadMembership(req.user.id, room.roomKey);
  res.json({ room: serializeRoom(room, stats, membership) });
});

r.get("/stream", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  streamClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: ping\ndata: {}\n\n`);
    } catch {
      clearInterval(heartbeat);
      streamClients.delete(res);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    streamClients.delete(res);
  });
});

r.post("/messages", requireAuth, messageLimit, (req, res) => {
  let room;
  try {
    room = resolveRoom(req.body?.roomKey, req.body?.workSlug);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Unknown chat room." });
  }

  const body = String(req.body?.body || "").replace(/\r\n/g, "\n").trim();
  if (!body) return res.status(400).json({ error: "Message body is required." });
  if (body.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.` });
  }

  const result = db.prepare(`
    INSERT INTO chat_messages (room_key, work_slug, user_id, body)
    VALUES (?, ?, ?, ?)
  `).run(room.roomKey, room.workSlug || null, req.user.id, body);

  const created = loadMessage(result.lastInsertRowid);
  const stats = roomStats(room.roomKey);
  markRoomSeen(req.user.id, room, created.id);
  notifyMentionedUsers(created, room, created);

  const publicRoom = serializeRoom(room, stats, null);
  const senderMembership = loadMembership(req.user.id, room.roomKey);
  const senderRoom = serializeRoom(room, stats, senderMembership);
  const serializedMessage = serializeMessage(created);

  broadcast("message", {
    room: publicRoom,
    message: serializedMessage,
  });

  res.status(201).json({
    room: senderRoom,
    message: serializedMessage,
  });
});

r.delete("/messages/:id", requireAuth, (req, res) => {
  const message = db.prepare("SELECT id, room_key, work_slug, user_id FROM chat_messages WHERE id=?").get(req.params.id);
  if (!message) return res.status(404).json({ error: "Message not found." });
  if (message.user_id !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: "You do not have permission to delete this message." });
  }

  db.prepare("DELETE FROM chat_messages WHERE id=?").run(message.id);

  let room = null;
  let stats = { messageCount: 0, lastMessageAt: null, lastMessageId: 0 };
  try {
    room = resolveRoom(message.room_key, message.work_slug);
    stats = roomStats(message.room_key);
  } catch {}

  broadcast("delete", {
    id: message.id,
    roomKey: message.room_key,
    workSlug: message.work_slug || "",
    room: room ? serializeRoom(room, stats, null) : null,
  });

  res.json({ ok: true });
});

module.exports = r;
