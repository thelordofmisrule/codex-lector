/**
 * Import/merge curated place enrichments from a strict JSON schema.
 *
 * Usage:
 *   node scripts/import-places-enrichment.js /abs/path/places_enrichment.json
 *
 * JSON format:
 * [
 *   {
 *     "slug": "flushing",
 *     "name": "Flushing",
 *     "modernName": "Vlissingen",
 *     "placeType": "port",
 *     "modernCountry": "Netherlands",
 *     "lat": 51.4426,
 *     "lng": 3.5736,
 *     "description": "...",
 *     "historicalNote": "...",
 *     "imageUrl": "https://...",
 *     "aliases": ["Vlissingen"],
 *     "sourcePlays": ["Henry V"],
 *     "isReal": true,
 *     "citationExclusions": [
 *       { "workSlug": "alls-well-that-ends-well-ps", "lineNumber": 123, "lineText": "..." }
 *     ]
 *   }
 * ]
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "data", "codex.db");
if (!fs.existsSync(DB_PATH)) {
  console.error("Database not found. Run `npm run setup` first.");
  process.exit(1);
}

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", "data", "places_enrichment.json");

if (!fs.existsSync(inputPath)) {
  console.error(`JSON file not found: ${inputPath}`);
  console.error("Usage: node scripts/import-places-enrichment.js /abs/path/places_enrichment.json");
  process.exit(1);
}

function cleanText(v) {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(v) {
  return cleanText(v)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function titleFromSlug(slug) {
  return cleanText(slug)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseList(raw) {
  if (raw === undefined) return null;
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(cleanText).filter(Boolean))];
  }
  const text = cleanText(raw);
  if (!text) return [];
  return [...new Set(text.split(/[,\n;|]/).map(cleanText).filter(Boolean))];
}

function parseNullableNumber(raw, fieldName) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${fieldName}: ${raw}`);
  return n;
}

function parseBool(raw, fieldName) {
  if (raw === undefined) return undefined;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw === "number") return raw ? 1 : 0;
  const text = cleanText(raw).toLowerCase();
  if (["1", "true", "yes"].includes(text)) return 1;
  if (["0", "false", "no"].includes(text)) return 0;
  throw new Error(`Invalid ${fieldName}: ${raw}`);
}

function parseJsonList(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(cleanText).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function mergeUnique(existing, incoming) {
  return [...new Set([...(existing || []), ...(incoming || [])].map(cleanText).filter(Boolean))];
}

function normalizePlaceType(raw) {
  const value = cleanText(raw).toLowerCase();
  return value || "";
}

let inputJson;
try {
  inputJson = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (e) {
  console.error(`Invalid JSON: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(inputJson)) {
  console.error("Expected top-level JSON array.");
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const findPlace = db.prepare("SELECT * FROM places WHERE slug=?");
const insertPlace = db.prepare(`
  INSERT INTO places
    (slug, name, modern_name, place_type, modern_country, lat, lng, description, historical_note, image_url, aliases_json, is_real, source_plays_json)
  VALUES
    (@slug, @name, @modern_name, @place_type, @modern_country, @lat, @lng, @description, @historical_note, @image_url, @aliases_json, @is_real, @source_plays_json)
`);
const updatePlace = db.prepare(`
  UPDATE places SET
    name=@name,
    modern_name=@modern_name,
    place_type=@place_type,
    modern_country=@modern_country,
    lat=@lat,
    lng=@lng,
    description=@description,
    historical_note=@historical_note,
    image_url=@image_url,
    aliases_json=@aliases_json,
    is_real=@is_real,
    source_plays_json=@source_plays_json
  WHERE slug=@slug
`);
const insertExclusion = db.prepare(`
  INSERT OR IGNORE INTO place_citation_exclusions (place_id, work_slug, line_number, line_text, created_by)
  VALUES (?, ?, ?, ?, NULL)
`);

let inserted = 0;
let updated = 0;
let skipped = 0;
let exclusionsInserted = 0;

const tx = db.transaction(() => {
  for (const rawRow of inputJson) {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
      skipped += 1;
      continue;
    }
    const inferredSlug = slugify(rawRow.slug || rawRow.name || rawRow.modernName || "");
    if (!inferredSlug) {
      skipped += 1;
      continue;
    }

    const existing = findPlace.get(inferredSlug);
    const existingAliases = existing ? parseJsonList(existing.aliases_json) : [];
    const existingPlays = existing ? parseJsonList(existing.source_plays_json) : [];

    const incomingAliases = parseList(rawRow.aliases);
    const incomingPlays = parseList(rawRow.sourcePlays);

    const lat = parseNullableNumber(rawRow.lat, "lat");
    const lng = parseNullableNumber(rawRow.lng, "lng");
    const isReal = parseBool(rawRow.isReal, "isReal");

    const next = {
      slug: inferredSlug,
      name: cleanText(rawRow.name) || cleanText(existing?.name) || titleFromSlug(inferredSlug),
      modern_name: cleanText(rawRow.modernName) || cleanText(existing?.modern_name) || "",
      place_type: normalizePlaceType(rawRow.placeType) || cleanText(existing?.place_type) || "site",
      modern_country: cleanText(rawRow.modernCountry) || cleanText(existing?.modern_country) || "",
      lat: lat !== undefined ? lat : (existing?.lat ?? null),
      lng: lng !== undefined ? lng : (existing?.lng ?? null),
      description: rawRow.description !== undefined ? cleanText(rawRow.description) : cleanText(existing?.description),
      historical_note: rawRow.historicalNote !== undefined ? cleanText(rawRow.historicalNote) : cleanText(existing?.historical_note),
      image_url: rawRow.imageUrl !== undefined ? cleanText(rawRow.imageUrl) : cleanText(existing?.image_url),
      aliases_json: JSON.stringify(incomingAliases === null ? existingAliases : mergeUnique(existingAliases, incomingAliases)),
      is_real: isReal !== undefined ? isReal : (existing?.is_real ?? 1),
      source_plays_json: JSON.stringify(incomingPlays === null ? existingPlays : mergeUnique(existingPlays, incomingPlays)),
    };

    if (existing) {
      updatePlace.run(next);
      updated += 1;
    } else {
      insertPlace.run(next);
      inserted += 1;
    }

    const place = findPlace.get(inferredSlug);
    const exclusions = Array.isArray(rawRow.citationExclusions) ? rawRow.citationExclusions : [];
    for (const ex of exclusions) {
      if (!ex || typeof ex !== "object") continue;
      const workSlug = cleanText(ex.workSlug);
      const lineNumber = Number(ex.lineNumber);
      if (!workSlug || !Number.isInteger(lineNumber) || lineNumber <= 0) continue;
      const lineText = cleanText(ex.lineText);
      const result = insertExclusion.run(place.id, workSlug, lineNumber, lineText);
      if (result.changes > 0) exclusionsInserted += 1;
    }
  }
});

try {
  tx();
} catch (e) {
  console.error(`Import failed: ${e.message}`);
  process.exit(1);
} finally {
  db.close();
}

console.log(`Imported enrichment JSON: ${inputPath}`);
console.log(`Rows processed: ${inputJson.length}`);
console.log(`Inserted places: ${inserted}`);
console.log(`Updated places: ${updated}`);
console.log(`Skipped rows: ${skipped}`);
console.log(`Inserted citation exclusions: ${exclusionsInserted}`);
