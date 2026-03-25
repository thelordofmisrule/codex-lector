const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");

const r = express.Router();

function cleanText(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function cleanInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizePayload(body = {}) {
  const itemType = cleanText(body.itemType || body.type || "item", 40).toLowerCase() || "item";
  const href = cleanText(body.href, 500);
  const title = cleanText(body.title, 240);
  const lineId = cleanText(body.lineId, 120);
  const dedupeKey = cleanText(
    body.dedupeKey || `${itemType}:${href || title || lineId || "item"}`,
    320,
  );

  return {
    itemType,
    title,
    subtitle: cleanText(body.subtitle, 240),
    excerpt: cleanText(body.excerpt, 4000),
    href,
    workSlug: cleanText(body.workSlug, 120),
    workTitle: cleanText(body.workTitle, 200),
    lineId,
    lineNumber: cleanInt(body.lineNumber),
    copyText: cleanText(body.copyText, 8000),
    dedupeKey,
  };
}

const upsertItem = db.prepare(`
  INSERT INTO research_tray_items (
    user_id, item_type, title, subtitle, excerpt, href,
    work_slug, work_title, line_id, line_number, copy_text, dedupe_key,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id, dedupe_key) DO UPDATE SET
    item_type=excluded.item_type,
    title=excluded.title,
    subtitle=excluded.subtitle,
    excerpt=excluded.excerpt,
    href=excluded.href,
    work_slug=excluded.work_slug,
    work_title=excluded.work_title,
    line_id=excluded.line_id,
    line_number=excluded.line_number,
    copy_text=excluded.copy_text,
    updated_at=CURRENT_TIMESTAMP
`);

const selectItemByKey = db.prepare(`
  SELECT
    id,
    item_type AS itemType,
    title,
    subtitle,
    excerpt,
    href,
    work_slug AS workSlug,
    work_title AS workTitle,
    line_id AS lineId,
    line_number AS lineNumber,
    copy_text AS copyText,
    dedupe_key AS dedupeKey,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM research_tray_items
  WHERE user_id=? AND dedupe_key=?
`);

r.get("/", requireAuth, (req, res) => {
  const q = cleanText(req.query.q, 120).toLowerCase();
  const rows = q
    ? db.prepare(`
        SELECT
          id,
          item_type AS itemType,
          title,
          subtitle,
          excerpt,
          href,
          work_slug AS workSlug,
          work_title AS workTitle,
          line_id AS lineId,
          line_number AS lineNumber,
          copy_text AS copyText,
          dedupe_key AS dedupeKey,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM research_tray_items
        WHERE user_id=?
          AND (
            LOWER(title) LIKE ?
            OR LOWER(subtitle) LIKE ?
            OR LOWER(excerpt) LIKE ?
            OR LOWER(work_title) LIKE ?
          )
        ORDER BY updated_at DESC, id DESC
      `).all(req.user.id, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare(`
        SELECT
          id,
          item_type AS itemType,
          title,
          subtitle,
          excerpt,
          href,
          work_slug AS workSlug,
          work_title AS workTitle,
          line_id AS lineId,
          line_number AS lineNumber,
          copy_text AS copyText,
          dedupe_key AS dedupeKey,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM research_tray_items
        WHERE user_id=?
        ORDER BY updated_at DESC, id DESC
      `).all(req.user.id);

  res.json(rows);
});

r.post("/", requireAuth, (req, res) => {
  const payload = normalizePayload(req.body);
  if (!payload.dedupeKey) return res.status(400).json({ error: "dedupeKey required." });
  upsertItem.run(
    req.user.id,
    payload.itemType,
    payload.title,
    payload.subtitle,
    payload.excerpt,
    payload.href,
    payload.workSlug,
    payload.workTitle,
    payload.lineId,
    payload.lineNumber,
    payload.copyText,
    payload.dedupeKey,
  );
  res.json(selectItemByKey.get(req.user.id, payload.dedupeKey));
});

r.post("/import", requireAuth, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const normalizedItems = items.map(normalizePayload).filter((item) => item.dedupeKey);
  const tx = db.transaction((entries) => {
    entries.forEach((payload) => {
      upsertItem.run(
        req.user.id,
        payload.itemType,
        payload.title,
        payload.subtitle,
        payload.excerpt,
        payload.href,
        payload.workSlug,
        payload.workTitle,
        payload.lineId,
        payload.lineNumber,
        payload.copyText,
        payload.dedupeKey,
      );
    });
  });
  tx(normalizedItems);
  const rows = db.prepare(`
    SELECT
      id,
      item_type AS itemType,
      title,
      subtitle,
      excerpt,
      href,
      work_slug AS workSlug,
      work_title AS workTitle,
      line_id AS lineId,
      line_number AS lineNumber,
      copy_text AS copyText,
      dedupe_key AS dedupeKey,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM research_tray_items
    WHERE user_id=?
    ORDER BY updated_at DESC, id DESC
  `).all(req.user.id);
  res.json(rows);
});

r.delete("/:id", requireAuth, (req, res) => {
  db.prepare("DELETE FROM research_tray_items WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ ok: true });
});

r.delete("/", requireAuth, (req, res) => {
  db.prepare("DELETE FROM research_tray_items WHERE user_id=?").run(req.user.id);
  res.json({ ok: true });
});

module.exports = r;
