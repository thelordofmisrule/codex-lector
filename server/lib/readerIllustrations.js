const PLACEMENT_KIND_ALIASES = {
  act_header: "act_start",
};

const ALLOWED_PLACEMENT_KINDS = new Set([
  "dramatis",
  "act_start",
  "act_end",
  "scene_break",
  "line_anchor",
  "featured_plate",
  "supplementary",
]);

function normalizeIllustrationArtistKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePlacementKind(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "featured_plate";
  const aliased = PLACEMENT_KIND_ALIASES[raw] || raw;
  return ALLOWED_PLACEMENT_KINDS.has(aliased) ? aliased : "featured_plate";
}

function ensureReaderIllustrationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reader_illustration_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id INTEGER NOT NULL REFERENCES quote_images(id) ON DELETE CASCADE,
      work_slug TEXT NOT NULL,
      placement_kind TEXT NOT NULL DEFAULT 'featured_plate',
      act_number INTEGER DEFAULT 0,
      scene_label TEXT DEFAULT '',
      line_start INTEGER DEFAULT 0,
      line_end INTEGER DEFAULT 0,
      caption TEXT DEFAULT '',
      artist_key TEXT DEFAULT '',
      managed_source TEXT DEFAULT 'seed',
      manual_override BOOLEAN DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(image_id, work_slug, placement_kind, act_number, scene_label, line_start, line_end)
    );

    CREATE INDEX IF NOT EXISTS idx_reader_illustrations_work
      ON reader_illustration_placements(work_slug, placement_kind, act_number, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_reader_illustrations_artist
      ON reader_illustration_placements(work_slug, artist_key, placement_kind, act_number, sort_order, id);
  `);

  try { db.exec("ALTER TABLE reader_illustration_placements ADD COLUMN managed_source TEXT DEFAULT 'seed'"); } catch {}
  try { db.exec("ALTER TABLE reader_illustration_placements ADD COLUMN manual_override BOOLEAN DEFAULT 0"); } catch {}
  try { db.exec("UPDATE reader_illustration_placements SET managed_source='seed' WHERE COALESCE(managed_source, '')=''"); } catch {}

  try {
    db.exec(`
      UPDATE reader_illustration_placements
      SET artist_key = (
        SELECT LOWER(
          REPLACE(
            REPLACE(
              REPLACE(TRIM(COALESCE(quote_images.artist, '')), '&', ' and '),
              '''',
              ''
            ),
            ' ',
            '-'
          )
        )
        FROM quote_images
        WHERE quote_images.id = reader_illustration_placements.image_id
      )
      WHERE TRIM(COALESCE(artist_key, '')) = ''
    `);
  } catch {
    // Ignore backfill failures on fresh databases.
  }

  try {
    db.exec(`
      UPDATE reader_illustration_placements
      SET placement_kind = CASE LOWER(TRIM(COALESCE(placement_kind, '')))
        WHEN 'act_header' THEN 'act_start'
        ELSE placement_kind
      END
      WHERE LOWER(TRIM(COALESCE(placement_kind, ''))) = 'act_header'
    `);
  } catch {
    // Ignore placement normalization failures on fresh databases.
  }
}

module.exports = {
  ALLOWED_PLACEMENT_KINDS,
  ensureReaderIllustrationSchema,
  normalizeIllustrationArtistKey,
  normalizePlacementKind,
};
