#!/usr/bin/env node
const path = require("path");
const Database = require("better-sqlite3");

const args = process.argv.slice(2);
const rawSlug = args[0];
if (!rawSlug) {
  console.error("Usage: node scripts/set-place-meta.js <slug> [--image <url>] [--history <text>] [--description <text>]");
  process.exit(1);
}

function readFlag(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx === args.length - 1) return null;
  return args[idx + 1];
}

const slug = String(rawSlug).trim().toLowerCase();
const imageUrl = readFlag("--image");
const historicalNote = readFlag("--history");
const description = readFlag("--description");

if (imageUrl === null && historicalNote === null && description === null) {
  console.error("Provide at least one of: --image, --history, --description");
  process.exit(1);
}

const dbPath = path.join(__dirname, "..", "data", "codex.db");
const db = new Database(dbPath, { fileMustExist: true });

const place = db.prepare("SELECT id, slug, name, image_url, historical_note, description FROM places WHERE slug=?").get(slug);
if (!place) {
  console.error(`Place not found: ${slug}`);
  process.exit(1);
}

if (imageUrl !== null) db.prepare("UPDATE places SET image_url=? WHERE id=?").run(String(imageUrl).trim(), place.id);
if (historicalNote !== null) db.prepare("UPDATE places SET historical_note=? WHERE id=?").run(String(historicalNote).trim(), place.id);
if (description !== null) db.prepare("UPDATE places SET description=? WHERE id=?").run(String(description).trim(), place.id);

const updated = db.prepare("SELECT slug, name, image_url, historical_note, description FROM places WHERE id=?").get(place.id);
console.log(JSON.stringify({
  slug: updated.slug,
  name: updated.name,
  imageUrl: updated.image_url || "",
  historicalNote: updated.historical_note || "",
  description: updated.description || "",
}, null, 2));
