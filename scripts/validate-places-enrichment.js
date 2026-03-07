/**
 * Validate a places enrichment JSON batch before import.
 *
 * Usage:
 *   node scripts/validate-places-enrichment.js /abs/path/places_enrichment.json
 */
const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", "data", "places_enrichment.json");

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

function cleanText(v) {
  return String(v ?? "").trim();
}

function slugify(v) {
  return cleanText(v)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isStringArray(v) {
  return Array.isArray(v) && v.every(item => typeof item === "string");
}

function isBoolLike(v) {
  if (typeof v === "boolean") return true;
  if (typeof v === "number") return v === 0 || v === 1;
  if (typeof v === "string") {
    const s = cleanText(v).toLowerCase();
    return ["1", "0", "true", "false", "yes", "no"].includes(s);
  }
  return false;
}

let json;
try {
  json = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (e) {
  console.error(`Invalid JSON: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(json)) {
  console.error("Top-level JSON must be an array.");
  process.exit(1);
}

const errors = [];
const warnings = [];
const seenSlugs = new Set();

json.forEach((row, index) => {
  const at = `row ${index}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    errors.push(`${at}: must be an object`);
    return;
  }

  const slug = cleanText(row.slug);
  const name = cleanText(row.name);
  if (!slug && !name) {
    errors.push(`${at}: must include at least slug or name`);
  }

  if (slug) {
    const normalized = slugify(slug);
    if (slug !== normalized) warnings.push(`${at}: slug "${slug}" is not canonical; importer will normalize to "${normalized}"`);
    const key = normalized || slug;
    if (seenSlugs.has(key)) errors.push(`${at}: duplicate slug "${key}" in batch`);
    seenSlugs.add(key);
  }

  if (row.name !== undefined && typeof row.name !== "string") errors.push(`${at}: name must be string`);
  if (row.modernName !== undefined && typeof row.modernName !== "string") errors.push(`${at}: modernName must be string`);
  if (row.placeType !== undefined && typeof row.placeType !== "string") errors.push(`${at}: placeType must be string`);
  if (row.modernCountry !== undefined && typeof row.modernCountry !== "string") errors.push(`${at}: modernCountry must be string`);
  if (row.description !== undefined && typeof row.description !== "string") errors.push(`${at}: description must be string`);
  if (row.historicalNote !== undefined && typeof row.historicalNote !== "string") errors.push(`${at}: historicalNote must be string`);
  if (row.imageUrl !== undefined && typeof row.imageUrl !== "string") errors.push(`${at}: imageUrl must be string`);

  if (row.lat !== undefined && row.lat !== null && typeof row.lat !== "number") errors.push(`${at}: lat must be number or null`);
  if (row.lng !== undefined && row.lng !== null && typeof row.lng !== "number") errors.push(`${at}: lng must be number or null`);
  if ((row.lat === null) !== (row.lng === null)) warnings.push(`${at}: only one of lat/lng is null`);

  if (row.aliases !== undefined && !isStringArray(row.aliases) && typeof row.aliases !== "string") {
    errors.push(`${at}: aliases must be string[] or comma-separated string`);
  }
  if (row.sourcePlays !== undefined && !isStringArray(row.sourcePlays) && typeof row.sourcePlays !== "string") {
    errors.push(`${at}: sourcePlays must be string[] or comma-separated string`);
  }
  if (row.isReal !== undefined && !isBoolLike(row.isReal)) {
    errors.push(`${at}: isReal must be boolean/0/1/yes/no`);
  }

  if (row.citationExclusions !== undefined) {
    if (!Array.isArray(row.citationExclusions)) {
      errors.push(`${at}: citationExclusions must be array`);
    } else {
      row.citationExclusions.forEach((ex, exIndex) => {
        const atEx = `${at} citationExclusions[${exIndex}]`;
        if (!ex || typeof ex !== "object" || Array.isArray(ex)) {
          errors.push(`${atEx}: must be object`);
          return;
        }
        if (!cleanText(ex.workSlug)) errors.push(`${atEx}: workSlug is required`);
        if (!Number.isInteger(ex.lineNumber) || ex.lineNumber <= 0) errors.push(`${atEx}: lineNumber must be positive integer`);
        if (ex.lineText !== undefined && typeof ex.lineText !== "string") errors.push(`${atEx}: lineText must be string`);
      });
    }
  }
});

console.log(`Validated: ${inputPath}`);
console.log(`Rows: ${json.length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);

if (warnings.length) {
  console.log("\nWarnings:");
  warnings.slice(0, 50).forEach(w => console.log(`- ${w}`));
  if (warnings.length > 50) console.log(`- ... ${warnings.length - 50} more`);
}

if (errors.length) {
  console.log("\nErrors:");
  errors.slice(0, 80).forEach(e => console.log(`- ${e}`));
  if (errors.length > 80) console.log(`- ... ${errors.length - 80} more`);
  process.exit(1);
}

console.log("\nBatch format is valid.");
