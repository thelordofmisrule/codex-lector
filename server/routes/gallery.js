const express = require("express");
const db = require("../db");

const r = express.Router();

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function aggregateTags(items) {
  const counts = new Map();
  items.forEach((item) => {
    (item.tags || []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 80);
}

r.get("/", (req, res) => {
  const workSlug = String(req.query.work || "").trim();
  const tagFilter = String(req.query.tag || "").trim().toLowerCase();
  const query = String(req.query.q || "").trim().toLowerCase();
  const limit = Math.min(400, Math.max(1, parseInt(req.query.limit || "120", 10) || 120));

  const rows = db.prepare(`
    SELECT
      i.id,
      i.title,
      i.source_label,
      i.page_url,
      i.image_url,
      i.local_media_path,
      i.local_media_url,
      i.sort_order,
      i.tags_json,
      c.work_slug,
      c.work_title,
      c.category_url,
      c.notes
    FROM quote_images i
    JOIN quote_image_collections c ON c.id = i.collection_id
    ORDER BY c.work_title, i.sort_order, i.id
  `).all();

  const items = rows.map((row) => ({
    id: row.id,
    title: row.title || "",
    sourceLabel: row.source_label || "",
    pageUrl: row.page_url || "",
    imageUrl: row.local_media_url || row.image_url || "",
    originalImageUrl: row.image_url || "",
    localMediaPath: row.local_media_path || "",
    localMediaUrl: row.local_media_url || "",
    workSlug: row.work_slug || "",
    workTitle: row.work_title || "",
    categoryUrl: row.category_url || "",
    notes: row.notes || "",
    sortOrder: row.sort_order || 0,
    tags: parseTags(row.tags_json),
  }));

  const works = [...new Map(
    items.map((item) => [item.workSlug || item.workTitle, { workSlug: item.workSlug, workTitle: item.workTitle }]),
  ).values()].sort((a, b) => a.workTitle.localeCompare(b.workTitle));

  const facetedItems = items.filter((item) => {
    if (workSlug && item.workSlug !== workSlug) return false;
    if (query) {
      const haystack = `${item.title} ${item.workTitle} ${(item.tags || []).join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const filtered = facetedItems.filter((item) => {
    if (tagFilter && !(item.tags || []).some((tag) => tag.toLowerCase() === tagFilter)) return false;
    return true;
  });

  res.json({
    works,
    tags: aggregateTags(facetedItems),
    total: filtered.length,
    items: filtered.slice(0, limit),
  });
});

module.exports = r;
