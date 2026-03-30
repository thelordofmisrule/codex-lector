const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../auth");
const { buildWorkLookup, equivalentWorkSlugs } = require("../lib/workCatalog");
const {
  ensureReaderIllustrationSchema,
  normalizeIllustrationArtistKey,
  normalizePlacementKind,
} = require("../lib/readerIllustrations");

const r = express.Router();

ensureReaderIllustrationSchema(db);

const getPlacementById = db.prepare(`
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
    p.managed_source,
    p.manual_override,
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
  WHERE p.id=?
`);

const insertPlacement = db.prepare(`
  INSERT INTO reader_illustration_placements (
    image_id, work_slug, placement_kind, act_number, scene_label, line_start, line_end, caption, artist_key, managed_source, manual_override, sort_order, updated_at
  ) VALUES (
    @image_id, @work_slug, @placement_kind, @act_number, @scene_label, @line_start, @line_end, @caption, @artist_key, 'manual', 1, @sort_order, CURRENT_TIMESTAMP
  )
`);

const updatePlacement = db.prepare(`
  UPDATE reader_illustration_placements
  SET
    placement_kind=@placement_kind,
    act_number=@act_number,
    scene_label=@scene_label,
    line_start=@line_start,
    line_end=@line_end,
    caption=@caption,
    artist_key=@artist_key,
    managed_source='manual',
    manual_override=1,
    sort_order=@sort_order,
    updated_at=CURRENT_TIMESTAMP
  WHERE id=@id
`);

const imageExists = db.prepare("SELECT id, artist FROM quote_images WHERE id=?");
const workExists = db.prepare("SELECT slug FROM works WHERE slug=?");

function serializePlacement(row) {
  if (!row) return null;
  const artistKey = row.artist_key || normalizeIllustrationArtistKey(row.artist || "");
  const artistLabel = row.artist || artistKey || "Unknown";
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
    manualOverride: !!row.manual_override,
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
}

function parsePlacementPayload(body = {}, existing = null) {
  const imageId = Number(body.imageId ?? existing?.image_id ?? 0);
  if (!Number.isFinite(imageId) || imageId <= 0 || !imageExists.get(imageId)) {
    throw new Error("Valid image required.");
  }

  const workSlug = String(body.workSlug ?? existing?.work_slug ?? "").trim();
  if (!workSlug || !workExists.get(workSlug)) throw new Error("Valid work required.");

  const placementKind = normalizePlacementKind(body.placementKind ?? existing?.placement_kind ?? "featured_plate");
  const actNumber = Math.max(0, Number(body.actNumber ?? existing?.act_number ?? 0) || 0);
  const lineStart = Math.max(0, Number(body.lineStart ?? existing?.line_start ?? 0) || 0);
  const lineEnd = Math.max(0, Number(body.lineEnd ?? existing?.line_end ?? 0) || 0);

  return {
    image_id: imageId,
    work_slug: workSlug,
    placement_kind: placementKind,
    act_number: placementKind === "dramatis" || placementKind === "featured_plate" || placementKind === "supplementary"
      ? actNumber
      : Math.max(1, actNumber || 1),
    scene_label: String(body.sceneLabel ?? existing?.scene_label ?? "").trim(),
    line_start: placementKind === "line_anchor" ? Math.max(1, lineStart || 1) : 0,
    line_end: placementKind === "line_anchor" ? Math.max(0, lineEnd) : 0,
    caption: String(body.caption ?? existing?.caption ?? "").trim(),
    artist_key: normalizeIllustrationArtistKey(body.artistKey ?? existing?.artist_key ?? imageExists.get(imageId)?.artist ?? ""),
    sort_order: Number(body.sortOrder ?? existing?.sort_order ?? 0) || 0,
  };
}

r.get("/:slug", (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "Work slug required." });

  const work = db.prepare("SELECT slug, title FROM works WHERE slug=?").get(slug);
  if (!work) return res.status(404).json({ error: "Work not found." });

  const workLookup = buildWorkLookup();
  const familySlugs = equivalentWorkSlugs(work.slug, workLookup);
  const familySlug = familySlugs[0] || work.slug;
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
    p.managed_source,
    p.manual_override,
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
    ORDER BY p.act_number, p.line_start, p.sort_order, p.id
  `).all(...familySlugs);

  const artists = new Map();
  const placements = rows.map((row) => {
    const serialized = serializePlacement(row);
    const artistKey = serialized.artistKey;
    const artistLabel = serialized.artistLabel;
    if (artistKey) {
      const existing = artists.get(artistKey) || { key: artistKey, label: artistLabel, count: 0 };
      existing.count += 1;
      artists.set(artistKey, existing);
    }
    return serialized;
  });

  return res.json({
    workSlug: work.slug,
    workTitle: work.title,
    familySlug,
    placements,
    artists: [...artists.values()].sort((a, b) => a.label.localeCompare(b.label)),
  });
});

r.post("/", requireAdmin, (req, res) => {
  try {
    const payload = parsePlacementPayload(req.body || null, null);
    const inserted = insertPlacement.run(payload);
    const placement = serializePlacement(getPlacementById.get(inserted.lastInsertRowid));
    return res.status(201).json({ placement });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Could not create illustration placement." });
  }
});

r.put("/:id", requireAdmin, (req, res) => {
  const existing = getPlacementById.get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: "Illustration placement not found." });

  try {
    const payload = parsePlacementPayload(req.body || {}, existing);
    updatePlacement.run({ ...payload, id: existing.id });
    const placement = serializePlacement(getPlacementById.get(existing.id));
    return res.json({ placement });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Could not update illustration placement." });
  }
});

module.exports = r;
