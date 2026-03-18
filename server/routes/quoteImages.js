const express = require("express");
const db = require("../db");
const { normalizeQuoteImageWorkKey } = require("../lib/quoteImageCollections");

const r = express.Router();

function deriveImageLabel(imageUrl = "", pageUrl = "", sortOrder = 0) {
  const raw = pageUrl || imageUrl;
  const tail = String(raw || "").split("/").pop() || `image-${sortOrder + 1}`;
  let decoded = tail;
  try {
    decoded = decodeURIComponent(tail);
  } catch {}
  return decoded
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^File:/i, "")
    .replace(/^Special:FilePath\//i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

r.get("/:slug", (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "Work slug required." });

  const work = db.prepare("SELECT slug, title FROM works WHERE slug=?").get(slug);
  if (!work) return res.status(404).json({ error: "Work not found." });

  const workKey = normalizeQuoteImageWorkKey(work.title);
  const collection = db.prepare(`
    SELECT id, work_key, work_title, category_url, notes, tags_json
    FROM quote_image_collections
    WHERE work_slug=?
       OR work_key=?
  `).get(work.slug, workKey);

  const images = db.prepare(`
    SELECT DISTINCT
      i.id,
      i.title,
      i.source_label,
      i.page_url,
      i.image_url,
      i.local_media_path,
      i.local_media_url,
      i.sort_order,
      i.tags_json
    FROM quote_images i
    LEFT JOIN quote_image_work_links l ON l.image_id=i.id
    WHERE COALESCE(i.managed_source, 'seed') <> 'hidden'
      AND (
        l.work_slug=?
        OR (l.work_slug IS NULL AND i.collection_id=?)
      )
    ORDER BY sort_order, id
  `).all(work.slug, collection?.id || 0).map((row) => ({
    id: row.id,
    title: row.title || "",
    sourceLabel: row.source_label || "",
    pageUrl: row.page_url || "",
    imageUrl: row.local_media_url || row.image_url || "",
    originalImageUrl: row.image_url || "",
    localMediaPath: row.local_media_path || "",
    localMediaUrl: row.local_media_url || "",
    label: row.title || deriveImageLabel(row.image_url || "", row.page_url || "", row.sort_order || 0),
    tags: parseTags(row.tags_json),
    sortOrder: row.sort_order || 0,
  }));

  return res.json({
    workSlug: work.slug,
    workTitle: collection?.work_title || work.title,
    categoryUrl: collection?.category_url || "",
    notes: collection?.notes || "",
    tags: parseTags(collection?.tags_json || "[]"),
    images,
  });
});

module.exports = r;
