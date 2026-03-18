const express = require("express");
const db = require("../db");
const { normalizeQuoteImageWorkKey } = require("../lib/quoteImageCollections");

const r = express.Router();

function deriveImageLabel(imageUrl = "", pageUrl = "", sortOrder = 0) {
  const raw = pageUrl || imageUrl;
  const tail = String(raw || "").split("/").pop() || `image-${sortOrder + 1}`;
  return decodeURIComponent(tail)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^File:/i, "")
    .replace(/^Special:FilePath\//i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

r.get("/:slug", (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "Work slug required." });

  const work = db.prepare("SELECT slug, title FROM works WHERE slug=?").get(slug);
  if (!work) return res.status(404).json({ error: "Work not found." });

  const workKey = normalizeQuoteImageWorkKey(work.title);
  const collection = db.prepare(`
    SELECT id, work_key, work_title, category_url, notes
    FROM quote_image_collections
    WHERE work_key=?
  `).get(workKey);

  if (!collection) {
    return res.json({
      workSlug: work.slug,
      workTitle: work.title,
      categoryUrl: "",
      notes: "",
      images: [],
    });
  }

  const images = db.prepare(`
    SELECT id, page_url, image_url, sort_order
    FROM quote_images
    WHERE collection_id=?
    ORDER BY sort_order, id
  `).all(collection.id).map((row) => ({
    id: row.id,
    pageUrl: row.page_url || "",
    imageUrl: row.image_url || "",
    label: deriveImageLabel(row.image_url || "", row.page_url || "", row.sort_order || 0),
    sortOrder: row.sort_order || 0,
  }));

  return res.json({
    workSlug: work.slug,
    workTitle: collection.work_title || work.title,
    categoryUrl: collection.category_url || "",
    notes: collection.notes || "",
    images,
  });
});

module.exports = r;
