const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");
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

function serializeRoom(room, stats = {}) {
  return {
    key: room.roomKey,
    label: room.label,
    kind: room.kind,
    description: room.description,
    workSlug: room.workSlug || "",
    messageCount: stats.messageCount || 0,
    lastMessageAt: stats.lastMessageAt || null,
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

r.get("/rooms", (req, res) => {
  const statsRows = db.prepare(`
    SELECT room_key, COUNT(*) AS message_count, MAX(created_at) AS last_message_at
    FROM chat_messages
    GROUP BY room_key
  `).all();
  const roomStats = new Map(statsRows.map((row) => [
    row.room_key,
    { messageCount: Number(row.message_count) || 0, lastMessageAt: row.last_message_at || null },
  ]));

  const specialRooms = Object.values(SPECIAL_ROOMS).map((room) => (
    serializeRoom(
      { roomKey: room.key, workSlug: "", label: room.label, kind: room.kind, description: room.description },
      roomStats.get(room.key) || {},
    )
  ));

  const activeWorkRooms = db.prepare(`
    SELECT m.work_slug, w.title, COUNT(*) AS message_count, MAX(m.created_at) AS last_message_at
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
  }, {
    messageCount: Number(row.message_count) || 0,
    lastMessageAt: row.last_message_at || null,
  }));

  res.json({ specialRooms, activeWorkRooms });
});

r.get("/messages", (req, res) => {
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

  const stats = db.prepare(`
    SELECT COUNT(*) AS message_count, MAX(created_at) AS last_message_at
    FROM chat_messages
    WHERE room_key=?
  `).get(room.roomKey);

  res.json({
    room: serializeRoom(room, {
      messageCount: Number(stats?.message_count) || 0,
      lastMessageAt: stats?.last_message_at || null,
    }),
    messages: rows.reverse().map(serializeMessage),
  });
});

r.get("/stream", (req, res) => {
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
  const stats = db.prepare(`
    SELECT COUNT(*) AS message_count, MAX(created_at) AS last_message_at
    FROM chat_messages
    WHERE room_key=?
  `).get(room.roomKey);
  const payload = {
    room: serializeRoom(room, {
      messageCount: Number(stats?.message_count) || 0,
      lastMessageAt: stats?.last_message_at || null,
    }),
    message: serializeMessage(created),
  };

  broadcast("message", payload);
  res.status(201).json(payload);
});

r.delete("/messages/:id", requireAuth, (req, res) => {
  const message = db.prepare("SELECT id, room_key, work_slug, user_id FROM chat_messages WHERE id=?").get(req.params.id);
  if (!message) return res.status(404).json({ error: "Message not found." });
  if (message.user_id !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: "You do not have permission to delete this message." });
  }

  db.prepare("DELETE FROM chat_messages WHERE id=?").run(message.id);

  let room = null;
  let stats = { messageCount: 0, lastMessageAt: null };
  try {
    room = resolveRoom(message.room_key, message.work_slug);
    const row = db.prepare(`
      SELECT COUNT(*) AS message_count, MAX(created_at) AS last_message_at
      FROM chat_messages
      WHERE room_key=?
    `).get(message.room_key);
    stats = {
      messageCount: Number(row?.message_count) || 0,
      lastMessageAt: row?.last_message_at || null,
    };
  } catch {}

  broadcast("delete", {
    id: message.id,
    roomKey: message.room_key,
    workSlug: message.work_slug || "",
    room: room ? serializeRoom(room, stats) : null,
  });

  res.json({ ok: true });
});

module.exports = r;
