const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { notify, notifyAdmins } = require("../notify");
const { createRateLimit } = require("../rateLimit");

const r = express.Router();
const WORK_CACHE_MS = 10 * 60 * 1000;
let cachedWorks = null;
let cachedWorksAt = 0;
const suggestionLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many place edit suggestions. Please wait before submitting again.",
  keyFn: (req) => `place:suggest:${req.ip}:${req.user?.id || "anon"}`,
});

function decodeEntities(text) {
  return String(text || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanInlineXml(text) {
  return decodeEntities(String(text || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractLineTexts(xml) {
  const lines = [];
  const re = /<(l|line)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const text = cleanInlineXml(match[2]);
    if (text) lines.push(text);
  }
  return lines;
}

function parseAliases(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function parseStringList(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(v => String(v || "").trim()).filter(Boolean))];
  }
  if (typeof raw === "string") {
    return [...new Set(raw.split(/[,\n;]+/).map(v => v.trim()).filter(Boolean))];
  }
  return [];
}

function parseNullableNumber(value, fieldName) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const n = Number(str);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${fieldName}.`);
  return n;
}

function parseBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value || "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function sanitizePlacePatch(body = {}) {
  const patch = {};
  const setText = (key, value) => { patch[key] = String(value ?? "").trim(); };
  if (body.name !== undefined) setText("name", body.name);
  if (body.modernName !== undefined) setText("modern_name", body.modernName);
  if (body.placeType !== undefined) setText("place_type", body.placeType);
  if (body.modernCountry !== undefined) setText("modern_country", body.modernCountry);
  if (body.description !== undefined) setText("description", body.description);
  if (body.historicalNote !== undefined) setText("historical_note", body.historicalNote);
  if (body.imageUrl !== undefined) setText("image_url", body.imageUrl);
  if (body.aliases !== undefined) patch.aliases_json = JSON.stringify(parseStringList(body.aliases));
  if (body.sourcePlays !== undefined) patch.source_plays_json = JSON.stringify(parseStringList(body.sourcePlays));
  if (body.lat !== undefined) patch.lat = parseNullableNumber(body.lat, "latitude");
  if (body.lng !== undefined) patch.lng = parseNullableNumber(body.lng, "longitude");
  if (body.isReal !== undefined) patch.is_real = parseBool(body.isReal) ? 1 : 0;
  return patch;
}

function patchToSql(patch) {
  const entries = Object.entries(patch);
  return {
    updates: entries.map(([k]) => `${k}=?`),
    values: entries.map(([, v]) => v),
  };
}

function parseJsonObject(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(raw || "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function escRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function placeTerms(place) {
  const terms = [
    place.name,
    place.modern_name,
    ...parseAliases(place.aliases_json),
  ]
    .map(t => String(t || "").trim())
    .filter(Boolean);
  return [...new Set(terms)];
}

function termRegex(term) {
  return new RegExp(`\\b${escRegExp(term).replace(/\s+/g, "\\s+")}\\b`, "i");
}

function parseWorkCache() {
  const now = Date.now();
  if (cachedWorks && (now - cachedWorksAt) < WORK_CACHE_MS) return cachedWorks;
  cachedWorks = db.prepare("SELECT slug, title, category, content FROM works WHERE content IS NOT NULL").all()
    .map(work => ({
      slug: work.slug,
      title: work.title,
      category: work.category,
      lines: extractLineTexts(work.content || ""),
    }));
  cachedWorksAt = now;
  return cachedWorks;
}

function findPlaceMentions(place, parsedWorks, opts = {}) {
  const maxTotal = opts.maxTotal || 12;
  const maxPerWork = opts.maxPerWork || 2;
  const workSlug = opts.workSlug ? String(opts.workSlug) : "";
  const regexes = placeTerms(place).map(termRegex);
  if (!regexes.length) return [];

  const citations = [];
  for (const work of parsedWorks) {
    if (workSlug && work.slug !== workSlug) continue;
    let hitsForWork = 0;
    for (let i = 0; i < work.lines.length; i++) {
      const lineText = work.lines[i];
      if (!regexes.some(re => re.test(lineText))) continue;
      citations.push({
        workSlug: work.slug,
        workTitle: work.title,
        workCategory: work.category,
        lineNumber: i + 1,
        lineText,
      });
      hitsForWork += 1;
      if (hitsForWork >= maxPerWork || citations.length >= maxTotal) break;
    }
    if (citations.length >= maxTotal) break;
  }
  return citations;
}

function serializePlace(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    modernName: row.modern_name,
    placeType: row.place_type,
    modernCountry: row.modern_country,
    lat: row.lat,
    lng: row.lng,
    description: row.description,
    historicalNote: row.historical_note || "",
    imageUrl: row.image_url || "",
    aliases: parseAliases(row.aliases_json),
    isReal: !!row.is_real,
    sourcePlays: parseAliases(row.source_plays_json),
  };
}

r.get("/", (req, res) => {
  const includeAll = String(req.query.all || "") === "1";
  const realOnly = String(req.query.real || "") === "1";
  const rows = db.prepare(`SELECT * FROM places ${realOnly ? "WHERE is_real=1" : ""} ORDER BY name`).all();
  if (includeAll) {
    return res.json({ places: rows.map(serializePlace) });
  }

  const parsedWorks = parseWorkCache();
  const workSlug = req.query.work ? String(req.query.work) : "";
  const places = rows.map(row => {
    const mentions = findPlaceMentions(row, parsedWorks, { workSlug, maxTotal: 6, maxPerWork: 1 });
    return {
      ...serializePlace(row),
      workCount: new Set(mentions.map(item => item.workSlug)).size,
      mentionCount: mentions.length,
      sampleWorks: mentions.slice(0, 3).map(item => ({
        slug: item.workSlug,
        title: item.workTitle,
        lineNumber: item.lineNumber,
      })),
    };
  }).filter(place => place.workCount > 0);

  res.json({ places });
});

r.post("/upload-image", requireAdmin, (req, res) => {
  const { fileName, mimeType, dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return res.status(400).json({ error: "Image data required." });
  }

  const allowed = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const ext = allowed[mimeType];
  if (!ext) return res.status(400).json({ error: "Unsupported image type." });

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: "Invalid image payload." });

  const buf = Buffer.from(match[2], "base64");
  if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ error: "Image too large (max 5MB)." });

  const dir = path.join(__dirname, "..", "..", "data", "media", "places");
  fs.mkdirSync(dir, { recursive: true });
  const safeBase = (fileName || "place").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "place";
  const name = `${safeBase}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  res.json({ url: `/media/places/${name}` });
});

r.put("/:slug", requireAdmin, (req, res) => {
  const row = db.prepare("SELECT id FROM places WHERE slug=?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Place not found." });

  let patch = {};
  try {
    patch = sanitizePlacePatch(req.body || {});
  } catch (e) {
    return res.status(400).json({ error: e.message || "Invalid place payload." });
  }

  const { updates, values } = patchToSql(patch);
  if (updates.length > 0) {
    values.push(row.id);
    db.prepare(`UPDATE places SET ${updates.join(", ")} WHERE id=?`).run(...values);
  }

  const updated = db.prepare("SELECT * FROM places WHERE id=?").get(row.id);
  res.json({ place: serializePlace(updated) });
});

r.get("/:slug/suggestions", requireAuth, (req, res) => {
  const place = db.prepare("SELECT id FROM places WHERE slug=?").get(req.params.slug);
  if (!place) return res.status(404).json({ error: "Place not found." });

  const rows = req.user.isAdmin
    ? db.prepare(`
      SELECT s.*, u.username, u.display_name, ru.display_name AS resolver_name
      FROM place_edit_suggestions s
      JOIN users u ON u.id=s.user_id
      LEFT JOIN users ru ON ru.id=s.resolved_by
      WHERE s.place_id=?
      ORDER BY s.created_at DESC
    `).all(place.id)
    : db.prepare(`
      SELECT s.*, u.username, u.display_name, ru.display_name AS resolver_name
      FROM place_edit_suggestions s
      JOIN users u ON u.id=s.user_id
      LEFT JOIN users ru ON ru.id=s.resolved_by
      WHERE s.place_id=? AND s.user_id=?
      ORDER BY s.created_at DESC
    `).all(place.id, req.user.id);

  const suggestions = rows.map(row => ({
    id: row.id,
    placeId: row.place_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    payload: parseJsonObject(row.payload_json, {}),
    reason: row.reason || "",
    status: row.status,
    resolverName: row.resolver_name || "",
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));

  res.json({ suggestions });
});

r.post("/:slug/suggestions", requireAuth, suggestionLimit, (req, res) => {
  const place = db.prepare("SELECT id, name, slug FROM places WHERE slug=?").get(req.params.slug);
  if (!place) return res.status(404).json({ error: "Place not found." });

  const body = req.body || {};
  const reason = String(body.reason || "").trim();
  const rawChanges = body.changes && typeof body.changes === "object" ? body.changes : body;

  let patch = {};
  try {
    patch = sanitizePlacePatch(rawChanges);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Invalid place suggestion." });
  }
  if (!Object.keys(patch).length) {
    return res.status(400).json({ error: "No place changes provided." });
  }

  const result = db.prepare(`
    INSERT INTO place_edit_suggestions (place_id, user_id, payload_json, reason)
    VALUES (?, ?, ?, ?)
  `).run(place.id, req.user.id, JSON.stringify(patch), reason);

  const created = db.prepare(`
    SELECT s.*, u.username, u.display_name
    FROM place_edit_suggestions s
    JOIN users u ON u.id=s.user_id
    WHERE s.id=?
  `).get(result.lastInsertRowid);

  notifyAdmins("place_suggestion", `${created.display_name} suggested edits for ${place.name}.`, `/places`);

  res.json({
    suggestion: {
      id: created.id,
      placeId: created.place_id,
      userId: created.user_id,
      username: created.username,
      displayName: created.display_name,
      payload: parseJsonObject(created.payload_json, {}),
      reason: created.reason || "",
      status: created.status,
      createdAt: created.created_at,
    },
  });
});

r.post("/suggestions/:id/accept", requireAdmin, (req, res) => {
  const suggestion = db.prepare("SELECT * FROM place_edit_suggestions WHERE id=?").get(req.params.id);
  if (!suggestion) return res.status(404).json({ error: "Suggestion not found." });
  if (suggestion.status !== "pending") return res.status(400).json({ error: "Suggestion already resolved." });

  const patch = parseJsonObject(suggestion.payload_json, {});
  const { updates, values } = patchToSql(patch);
  if (updates.length > 0) {
    values.push(suggestion.place_id);
    db.prepare(`UPDATE places SET ${updates.join(", ")} WHERE id=?`).run(...values);
  }

  db.prepare("UPDATE place_edit_suggestions SET status='accepted', resolved_by=?, resolved_at=datetime('now') WHERE id=?")
    .run(req.user.id, req.params.id);

  const place = db.prepare("SELECT slug, name FROM places WHERE id=?").get(suggestion.place_id);
  notify(suggestion.user_id, "place_suggestion_accepted", `Your suggested edits for ${place?.name || "a place"} were accepted.`, "/places");
  res.json({ ok: true, placeSlug: place?.slug || "" });
});

r.post("/suggestions/:id/reject", requireAdmin, (req, res) => {
  const suggestion = db.prepare("SELECT * FROM place_edit_suggestions WHERE id=?").get(req.params.id);
  if (!suggestion) return res.status(404).json({ error: "Suggestion not found." });
  if (suggestion.status !== "pending") return res.status(400).json({ error: "Suggestion already resolved." });

  db.prepare("UPDATE place_edit_suggestions SET status='rejected', resolved_by=?, resolved_at=datetime('now') WHERE id=?")
    .run(req.user.id, req.params.id);

  const place = db.prepare("SELECT name FROM places WHERE id=?").get(suggestion.place_id);
  notify(suggestion.user_id, "place_suggestion_rejected", `Your suggested edits for ${place?.name || "a place"} were not accepted.`, "/places");
  res.json({ ok: true });
});

r.get("/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM places WHERE slug=?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Place not found." });

  const parsedWorks = parseWorkCache();
  const workSlug = req.query.work ? String(req.query.work) : "";
  const citations = findPlaceMentions(row, parsedWorks, { workSlug, maxTotal: 18, maxPerWork: 3 });
  const workCount = new Set(citations.map(item => item.workSlug)).size;

  res.json({
    place: serializePlace(row),
    workCount,
    citations,
  });
});

module.exports = r;
