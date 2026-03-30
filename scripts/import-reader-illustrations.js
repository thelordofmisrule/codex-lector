const fs = require("fs");
const path = require("path");
try { require("dotenv").config({ path: path.join(__dirname, "..", ".env") }); } catch {}
const db = require("../server/db");
const { ensureReaderIllustrationSchema, normalizeIllustrationArtistKey } = require("../server/lib/readerIllustrations");

ensureReaderIllustrationSchema(db);

const manifestPath = path.join(__dirname, "..", "server", "data", "readerIllustrations.json");

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.placements)) return parsed.placements;
  return [];
}

function normalizePlacementKind(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "featured_plate";
  if (raw === "dramatis" || raw === "act_header" || raw === "scene_break" || raw === "featured_plate") {
    return raw;
  }
  return "featured_plate";
}

function findImageId(entry) {
  if (Number.isFinite(Number(entry.imageId)) && Number(entry.imageId) > 0) {
    const row = db.prepare("SELECT id FROM quote_images WHERE id=?").get(Number(entry.imageId));
    if (row?.id) return row.id;
  }

  const refs = [
    entry.externalRef,
    entry.pageUrl,
    entry.imageRef,
  ].map((value) => String(value || "").trim()).filter(Boolean);

  for (const ref of refs) {
    const row = db.prepare(`
      SELECT id
      FROM quote_images
      WHERE external_ref = ?
         OR page_url = ?
         OR image_url = ?
         OR local_media_path = ?
      LIMIT 1
    `).get(ref, ref, ref, ref);
    if (row?.id) return row.id;
  }

  if (entry.title) {
    const row = db.prepare("SELECT id FROM quote_images WHERE title = ? LIMIT 1").get(String(entry.title));
    if (row?.id) return row.id;
  }

  return 0;
}

const workExists = db.prepare("SELECT slug FROM works WHERE slug=?");
const upsertPlacement = db.prepare(`
  INSERT INTO reader_illustration_placements (
    image_id, work_slug, placement_kind, act_number, scene_label, line_start, line_end, caption, artist_key, sort_order, updated_at
  ) VALUES (
    @image_id, @work_slug, @placement_kind, @act_number, @scene_label, @line_start, @line_end, @caption, @artist_key, @sort_order, CURRENT_TIMESTAMP
  )
  ON CONFLICT(image_id, work_slug, placement_kind, act_number, scene_label, line_start, line_end)
  DO UPDATE SET
    caption=excluded.caption,
    artist_key=excluded.artist_key,
    sort_order=excluded.sort_order,
    updated_at=CURRENT_TIMESTAMP
`);

function main() {
  const placements = loadManifest();
  let imported = 0;

  const tx = db.transaction(() => {
    for (const entry of placements) {
      const workSlug = String(entry.workSlug || "").trim();
      if (!workSlug) throw new Error("Each placement must include workSlug.");
      if (!workExists.get(workSlug)) throw new Error(`Unknown work slug: ${workSlug}`);

      const imageId = findImageId(entry);
      if (!imageId) {
        throw new Error(`Could not resolve image for placement in ${workSlug}: ${JSON.stringify(entry)}`);
      }

      upsertPlacement.run({
        image_id: imageId,
        work_slug: workSlug,
        placement_kind: normalizePlacementKind(entry.placementKind),
        act_number: Number(entry.actNumber) || 0,
        scene_label: String(entry.sceneLabel || "").trim(),
        line_start: Number(entry.lineStart) || 0,
        line_end: Number(entry.lineEnd) || 0,
        caption: String(entry.caption || "").trim(),
        artist_key: normalizeIllustrationArtistKey(entry.artistKey || entry.artist || ""),
        sort_order: Number(entry.sortOrder) || 0,
      });
      imported += 1;
    }
  });

  tx();
  console.log(`Imported reader illustration placements: ${imported}.`);
}

main();
