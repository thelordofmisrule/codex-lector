/**
 * Import a large place catalog JSON into places.
 *
 * Usage:
 *   node scripts/import-places-json.js /path/to/shakespeare_places_complete.json
 *
 * Notes:
 * - Preserves existing curated lat/lng and card text when already present.
 * - Stores source play references in places.source_plays_json.
 * - Merges aliases from existing + imported records.
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
  : path.join(__dirname, "..", "data", "shakespeare_places_complete.json");

if (!fs.existsSync(inputPath)) {
  console.error(`JSON file not found: ${inputPath}`);
  console.error("Pass a path explicitly: node scripts/import-places-json.js /abs/path/file.json");
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

function cleanText(v) {
  return String(v || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripParens(v) {
  return cleanText(v).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function toTitleCase(v) {
  const s = cleanText(v);
  if (!s) return "";
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bIi\b/g, "II")
    .replace(/\bIii\b/g, "III")
    .replace(/\bIv\b/g, "IV");
}

function slugify(v) {
  return cleanText(v)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function parseList(raw) {
  if (Array.isArray(raw)) return [...new Set(raw.map(cleanText).filter(Boolean))];
  return [...new Set(cleanText(raw).split(/[;,|]/).map(cleanText).filter(Boolean))];
}

function parseAliases(row) {
  const aliases = new Set();
  parseList(row.alternate_name).forEach(a => aliases.add(a));

  const full = cleanText(row.place_name_full);
  for (const m of full.matchAll(/\(([^)]+)\)/g)) {
    const part = cleanText(m[1]).replace(/^i\.e\.\s*/i, "");
    parseList(part).forEach(a => aliases.add(a));
  }

  const shortName = cleanText(row.place_name);
  const fullNoParens = stripParens(full);
  if (fullNoParens && fullNoParens.toLowerCase() !== shortName.toLowerCase()) aliases.add(fullNoParens);

  return [...aliases]
    .map(v => v.replace(/^for which .*$/i, "").trim())
    .map(cleanText)
    .filter(v => v && v.length <= 120);
}

function inferType(row) {
  const text = cleanText([
    row.place_name,
    row.place_name_full,
    row.description,
    row.full_entry,
  ].join(" ")).toLowerCase();
  if (/\b(river|brook|stream|mere|water)\b/.test(text)) return "river";
  if (/\b(forest|wood)\b/.test(text)) return "forest";
  if (/\b(castle|tower|abbey|palace|house|church|cathedral|temple)\b/.test(text)) return "site";
  if (/\b(street|lane|road|way|gate|bridge|alley|close)\b/.test(text)) return "street";
  if (/\b(battle|battlefield|field)\b/.test(text)) return "battlefield";
  if (/\b(port|harbour|haven)\b/.test(text)) return "port";
  if (/\b(island|isle)\b/.test(text)) return "island";
  if (/\b(county|kingdom|duchy|province|region|country)\b/.test(text)) return "region";
  if (/\b(city|town|village|market town)\b/.test(text)) return "city";
  if (/\b(sea|ocean|bay|gulf|strait)\b/.test(text)) return "sea";
  return "site";
}

function inferCountry(row) {
  const text = cleanText([
    row.place_name_full,
    row.description,
    row.full_entry,
  ].join(" ")).toLowerCase();
  const checks = [
    ["england", "United Kingdom"],
    ["scotland", "United Kingdom"],
    ["wales", "United Kingdom"],
    ["ireland", "Ireland"],
    ["france", "France"],
    ["italy", "Italy"],
    ["spain", "Spain"],
    ["greece", "Greece"],
    ["egypt", "Egypt"],
    ["denmark", "Denmark"],
    ["turkey", "Turkey"],
    ["austria", "Austria"],
    ["netherlands", "Netherlands"],
    ["germany", "Germany"],
    ["lebanon", "Lebanon"],
    ["cyprus", "Cyprus"],
  ];
  for (const [token, country] of checks) {
    if (text.includes(token)) return country;
  }
  return "";
}

function inferIsReal(row) {
  const text = cleanText([
    row.place_name,
    row.place_name_full,
    row.description,
    row.full_entry,
  ].join(" ")).toLowerCase();
  if (/\b(fictitious|fictional|imaginary|mythical|legendary|symbolic|allegorical)\b/.test(text)) return 0;
  return 1;
}

function firstSentence(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";
  const match = cleaned.match(/^(.{20,300}?[.!?])(?:\s|$)/);
  return cleanText(match ? match[1] : cleaned.slice(0, 300));
}

function parseSourcePlays(row) {
  return parseList(row.plays_referenced);
}

function mergeUnique(...arrays) {
  const out = new Set();
  arrays.flat().forEach(v => {
    const s = cleanText(v);
    if (s) out.add(s);
  });
  return [...out];
}

const raw = fs.readFileSync(inputPath, "utf8");
let json;
try {
  json = JSON.parse(raw);
} catch (e) {
  console.error(`Invalid JSON: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(json)) {
  console.error("Expected top-level JSON array.");
  process.exit(1);
}

const collapsed = new Map();
for (const row of json) {
  const rawName = cleanText(row.place_name) || stripParens(row.place_name_full);
  if (!rawName) continue;
  const slug = slugify(rawName);
  if (!slug) continue;

  const name = toTitleCase(rawName);
  const modernName = toTitleCase(parseList(row.alternate_name)[0] || "");
  const description = cleanText(row.description) || firstSentence(row.full_entry);
  const note = cleanText(row.shakespeare_context);
  const aliases = parseAliases(row);
  const plays = parseSourcePlays(row);
  const placeType = inferType(row);
  const modernCountry = inferCountry(row);
  const isReal = inferIsReal(row);

  const existing = collapsed.get(slug);
  if (!existing) {
    collapsed.set(slug, {
      slug,
      name,
      modern_name: modernName,
      place_type: placeType,
      modern_country: modernCountry,
      lat: null,
      lng: null,
      description,
      historical_note: note,
      image_url: "",
      aliases,
      sourcePlays: plays,
      is_real: isReal,
    });
    continue;
  }

  existing.aliases = mergeUnique(existing.aliases, aliases);
  existing.sourcePlays = mergeUnique(existing.sourcePlays, plays);
  if (!existing.modern_name && modernName) existing.modern_name = modernName;
  if (!existing.description && description) existing.description = description;
  if (!existing.historical_note && note) existing.historical_note = note;
  if (!existing.modern_country && modernCountry) existing.modern_country = modernCountry;
  if ((existing.place_type === "site" || !existing.place_type) && placeType !== "site") existing.place_type = placeType;
  if (!existing.is_real && isReal) existing.is_real = 1;
}

const getExisting = db.prepare("SELECT * FROM places WHERE slug=?");
const upsert = db.prepare(`
  INSERT INTO places
    (slug, name, modern_name, place_type, modern_country, lat, lng, description, historical_note, image_url, aliases_json, is_real, source_plays_json)
  VALUES
    (@slug, @name, @modern_name, @place_type, @modern_country, @lat, @lng, @description, @historical_note, @image_url, @aliases_json, @is_real, @source_plays_json)
  ON CONFLICT(slug) DO UPDATE SET
    name=excluded.name,
    modern_name=excluded.modern_name,
    place_type=excluded.place_type,
    modern_country=excluded.modern_country,
    lat=COALESCE(places.lat, excluded.lat),
    lng=COALESCE(places.lng, excluded.lng),
    description=CASE WHEN places.description IS NULL OR places.description='' THEN excluded.description ELSE places.description END,
    historical_note=CASE WHEN places.historical_note IS NULL OR places.historical_note='' THEN excluded.historical_note ELSE places.historical_note END,
    image_url=CASE WHEN places.image_url IS NULL THEN excluded.image_url ELSE places.image_url END,
    aliases_json=excluded.aliases_json,
    is_real=COALESCE(places.is_real, excluded.is_real),
    source_plays_json=excluded.source_plays_json
`);

let inserted = 0;
let updated = 0;
const rows = [...collapsed.values()];

const tx = db.transaction(() => {
  for (const row of rows) {
    const existing = getExisting.get(row.slug);
    const existingAliases = existing ? (() => {
      try { return JSON.parse(existing.aliases_json || "[]"); } catch { return []; }
    })() : [];
    const existingPlays = existing ? (() => {
      try { return JSON.parse(existing.source_plays_json || "[]"); } catch { return []; }
    })() : [];

    const mergedAliases = mergeUnique(existingAliases, row.aliases).slice(0, 120);
    const mergedPlays = mergeUnique(existingPlays, row.sourcePlays).slice(0, 200);

    const record = {
      slug: row.slug,
      name: cleanText(existing?.name) || row.name || toTitleCase(row.slug.replace(/-/g, " ")),
      modern_name: cleanText(existing?.modern_name) || row.modern_name || "",
      place_type: cleanText(existing?.place_type) || row.place_type || "site",
      modern_country: cleanText(existing?.modern_country) || row.modern_country || "",
      lat: (existing && existing.lat !== null && existing.lat !== undefined) ? existing.lat : row.lat,
      lng: (existing && existing.lng !== null && existing.lng !== undefined) ? existing.lng : row.lng,
      description: cleanText(existing?.description) || row.description || "",
      historical_note: cleanText(existing?.historical_note) || row.historical_note || "",
      image_url: cleanText(existing?.image_url) || "",
      aliases_json: JSON.stringify(mergedAliases),
      is_real: existing?.is_real !== undefined && existing?.is_real !== null ? existing.is_real : row.is_real,
      source_plays_json: JSON.stringify(mergedPlays),
    };

    upsert.run(record);
    if (existing) updated += 1;
    else inserted += 1;
  }
});

tx();
console.log(`Imported place catalog from ${inputPath}`);
console.log(`Rows parsed: ${json.length}`);
console.log(`Unique slugs: ${rows.length}`);
console.log(`Inserted: ${inserted}`);
console.log(`Updated: ${updated}`);

db.close();
