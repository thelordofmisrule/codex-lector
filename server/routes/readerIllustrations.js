const express = require("express");
const db = require("../db");
const { buildWorkLookup, equivalentWorkSlugs } = require("../lib/workCatalog");
const {
  ensureReaderIllustrationSchema,
  normalizeIllustrationArtistKey,
} = require("../lib/readerIllustrations");

const r = express.Router();

ensureReaderIllustrationSchema(db);

function normalizePlacementKind(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "featured_plate";
  if (raw === "dramatis" || raw === "act_header" || raw === "scene_break" || raw === "featured_plate") {
    return raw;
  }
  return "featured_plate";
}

r.get("/:slug", (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "Work slug required." });

  const work = db.prepare("SELECT slug, title, family_slug FROM works WHERE slug=?").get(slug);
  if (!work) return res.status(404).json({ error: "Work not found." });

  const workLookup = buildWorkLookup();
  const familySlugs = equivalentWorkSlugs(work.slug, workLookup);
  const placeholders = familySlugs.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT
      p.id,
      p.image_id,
      p.work_slug,
      p.placement_kind,
      p.act_number,
      p.scene_label,
      p.line_start,
      p.line_end,
      p.caption,
      p.artist_key,
      p.sort_order,
      i.title,
      i.artist,
      i.year,
      i.source_label,
      i.page_url,
      i.image_url,
      i.local_media_path,
      i.local_media_url,
      i.thumb_x,
      i.thumb_y
    FROM reader_illustration_placements p
    JOIN quote_images i ON i.id = p.image_id
    WHERE p.work_slug IN (${placeholders})
      AND COALESCE(i.managed_source, 'seed') <> 'hidden'
    ORDER BY p.act_number, p.sort_order, p.id
  `).all(...familySlugs);

  const artists = new Map();
  const placements = rows.map((row) => {
    const artistKey = row.artist_key || normalizeIllustrationArtistKey(row.artist || "");
    const artistLabel = row.artist || artistKey || "Unknown";
    if (artistKey) {
      const existing = artists.get(artistKey) || { key: artistKey, label: artistLabel, count: 0 };
      existing.count += 1;
      artists.set(artistKey, existing);
    }
    return {
      id: row.id,
      imageId: row.image_id,
      workSlug: row.work_slug,
      placementKind: normalizePlacementKind(row.placement_kind),
      actNumber: Number(row.act_number) || 0,
      sceneLabel: row.scene_label || "",
      lineStart: Number(row.line_start) || 0,
      lineEnd: Number(row.line_end) || 0,
      caption: row.caption || "",
      sortOrder: Number(row.sort_order) || 0,
      artistKey,
      artistLabel,
      image: {
        id: row.image_id,
        title: row.title || "",
        artist: row.artist || "",
        year: row.year || "",
        sourceLabel: row.source_label || "",
        pageUrl: row.page_url || "",
        imageUrl: row.local_media_url || row.image_url || "",
        originalImageUrl: row.image_url || "",
        localMediaPath: row.local_media_path || "",
        localMediaUrl: row.local_media_url || "",
        thumbX: Number.isFinite(Number(row.thumb_x)) ? Number(row.thumb_x) : 50,
        thumbY: Number.isFinite(Number(row.thumb_y)) ? Number(row.thumb_y) : 50,
      },
    };
  });

  return res.json({
    workSlug: work.slug,
    workTitle: work.title,
    familySlug: work.family_slug || "",
    placements,
    artists: [...artists.values()].sort((a, b) => a.label.localeCompare(b.label)),
  });
});

module.exports = r;
