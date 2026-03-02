/**
 * scripts/import-texts.js
 * Imports PlayShakespeare XML files into the database.
 *
 * Expected:
 *   data/playShakespeare/
 *     playshakespeare_editions/   ← ps variant
 *     first_folio_editions/       ← first-folio variant
 *     apocrypha/                  ← ps-apocrypha variant
 *
 * Run: node scripts/import-texts.js [--force] [--debug]
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "..", "data", "codex.db");
if (!fs.existsSync(DB_PATH)) { console.error("Run `npm run setup` first."); process.exit(1); }
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const FORCE = process.argv.includes("--force");
const DEBUG = process.argv.includes("--debug");

/* ── HTML entity decoder ── */
function decodeEntities(str) {
  if (!str) return "";
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}

/* ── Genre lookup — maps unique slug fragments to category ── */
// Each key is a substring that might appear in the unique= attribute or filename.
// Checked in order; first match wins.
const COMEDY_KEYS = [
  "alls-well","all-s-well","as-you-like","comedy-of-error","cymbeline",
  "loves-labours-lost","loves-labors-lost","loves-labour",
  "measure-for-measure","merchant-of-venice","merry-wives","merry-wive",
  "midsummer","much-ado","pericles","taming-of-the-shrew","taming",
  "tempest","twelfth-night","twelfth","two-gentlemen","two-noble-kinsmen",
  "winters-tale","winter-s-tale",
];
const TRAGEDY_KEYS = [
  "antony-and-cleopatra","antony","coriolanus","hamlet","julius-caesar",
  "julius","king-lear","lear","macbeth","othello","romeo-and-juliet","romeo",
  "timon-of-athens","timon","titus-andronicus","titus","troilus-and-cressida","troilus",
];
const HISTORY_KEYS = [
  "henry-iv","1-henry-iv","2-henry-iv","henry-v","henry-vi","1-henry-vi",
  "2-henry-vi","3-henry-vi","henry-viii","king-john","richard-ii","richard-iii",
  "edward-iii",
];
const POETRY_KEYS = [
  "sonnet","venus-and-adonis","venus","rape-of-lucrece","lucrece",
  "passionate-pilgrim","phoenix-and-turtle","phoenix-turtle","phoenix",
  "lovers-complaint","lover-s-complaint","funeral-elegy",
];

function inferGenre(unique, variant, titleRaw, isPoem) {
  if (isPoem || variant === "ps-poems") return "poetry";

  // For first-folio and apocrypha, always put in their own sections
  if (variant === "first-folio") return "first_folio";
  if (variant === "ps-apocrypha") return "apocrypha";

  const slug = unique.toLowerCase();
  const title = (titleRaw || "").toLowerCase();

  // Check slug against genre key fragments
  for (const k of COMEDY_KEYS) if (slug.includes(k)) return "comedy";
  for (const k of TRAGEDY_KEYS) if (slug.includes(k)) return "tragedy";
  for (const k of HISTORY_KEYS) if (slug.includes(k)) return "history";
  for (const k of POETRY_KEYS) if (slug.includes(k)) return "poetry";

  // Check title keywords
  if (title.includes("comedy") || title.includes("comical")) return "comedy";
  if (title.includes("tragedy") || title.includes("tragical")) return "tragedy";
  if (title.includes("history") || title.includes("king henry") || title.includes("king richard") || title.includes("king john")) return "history";
  if (title.includes("sonnet") || title.includes("poem") || title.includes("venus") || title.includes("lucrece")) return "poetry";

  // Check the play's genre attribute if it exists
  // (Some PS files have <play ... genre="tragedy">)

  console.log(`    ⚠ Could not determine genre for "${unique}" ("${titleRaw}"), defaulting to tragedy`);
  return "tragedy";
}

const upsert = db.prepare(`INSERT INTO works (slug, title, category, variant, authors, content, fetched_at)
  VALUES (@slug, @title, @category, @variant, @authors, @content, datetime('now'))
  ON CONFLICT(slug) DO UPDATE SET title=@title, category=@category, variant=@variant, authors=@authors, content=@content, fetched_at=datetime('now')`);
const check = db.prepare("SELECT content FROM works WHERE slug=?");

function importFile(filePath, defaultVariant) {
  const xml = fs.readFileSync(filePath, "utf8");
  const fname = path.basename(filePath, ".xml");

  const rootMatch = xml.match(/<(play|poem)\s+([^>]+)>/);
  if (!rootMatch) {
    console.log(`  ⚠ ${fname}: no <play> or <poem> root, skipping`);
    return false;
  }

  const isPoem = rootMatch[1] === "poem";
  const variantMatch = rootMatch[2].match(/variant="([^"]*)"/);
  const uniqueMatch = rootMatch[2].match(/unique="([^"]*)"/);
  const genreMatch = rootMatch[2].match(/genre="([^"]*)"/);

  const variant = variantMatch ? variantMatch[1] : defaultVariant;
  const unique = uniqueMatch ? uniqueMatch[1] : fname.replace(/^ps[a]?_/, "").replace(/-F\d+$/, "");

  // ── Extract title ──
  // Try common, then short, then main. Decode HTML entities.
  let title = "";
  const commonM = xml.match(/<title\s+type="common">([^<]*)<\/title>/i);
  const shortM  = xml.match(/<title\s+type="short">([^<]*)<\/title>/i);
  const mainM   = xml.match(/<title\s+type="main">([^<]*)<\/title>/i);
  const rawTitle = commonM?.[1] || shortM?.[1] || mainM?.[1] || "";
  title = decodeEntities(rawTitle);
  if (!title) title = unique.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  if (DEBUG) console.log(`    raw="${rawTitle}" decoded="${title}" unique="${unique}" variant="${variant}"`);

  // ── Authors ──
  const authors = [];
  for (const m of xml.matchAll(/<author>([^<]*)<\/author>/gi)) {
    authors.push(decodeEntities(m[1]));
  }
  const authorStr = authors.length > 0 ? authors.join(", ") : "William Shakespeare";

  // ── Genre/category ──
  let category;
  if (genreMatch) {
    const g = genreMatch[1].toLowerCase();
    category = g === "comedy" ? "comedy" : g === "tragedy" ? "tragedy" : g === "history" ? "history" : null;
  }
  if (!category) {
    category = inferGenre(unique, variant, title, isPoem);
  }

  // ── Slug (variant-prefixed to avoid collisions) ──
  let slug;
  if (variant === "first-folio") {
    slug = "f1-" + unique.replace(/\s+/g, "-").toLowerCase();
  } else if (variant === "ps-apocrypha") {
    slug = "apo-" + unique.replace(/\s+/g, "-").toLowerCase();
  } else {
    slug = unique.replace(/\s+/g, "-").toLowerCase();
  }

  // ── Cache check ──
  const existing = check.get(slug);
  if (existing?.content && !FORCE) {
    console.log(`  ✓ ${title} (cached) [${category}]`);
    return true;
  }

  upsert.run({ slug, title, category, variant, authors: authorStr, content: xml });
  console.log(`  ✓ ${title} [${category}] → ${slug}`);
  return true;
}

function scanDirectory(dirPath, defaultVariant) {
  if (!fs.existsSync(dirPath)) {
    console.log(`  (directory not found: ${path.basename(dirPath)})`);
    return 0;
  }
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith(".xml")).sort();
  console.log(`  Found ${files.length} XML files`);
  let count = 0;
  for (const file of files) {
    try {
      if (importFile(path.join(dirPath, file), defaultVariant)) count++;
    } catch (e) {
      console.log(`  ✗ ${file}: ${e.message}`);
    }
  }
  return count;
}

function main() {
  console.log("Importing PlayShakespeare XML files…\n");

  const baseDir = path.join(__dirname, "..", "data", "playShakespeare");
  if (!fs.existsSync(baseDir)) {
    console.log(`Directory not found: ${baseDir}\n`);
    console.log("Expected structure:");
    console.log("  data/playShakespeare/");
    console.log("    playshakespeare_editions/");
    console.log("    first_folio_editions/");
    console.log("    apocrypha/\n");
    process.exit(1);
  }

  // Show what's actually in the directory
  console.log(`Contents of ${baseDir}:`);
  fs.readdirSync(baseDir).forEach(f => console.log(`  ${f}`));
  console.log();

  let total = 0;

  console.log("PlayShakespeare Editions:");
  total += scanDirectory(path.join(baseDir, "playshakespeare_editions"), "ps");

  console.log("\nFirst Folio Editions:");
  total += scanDirectory(path.join(baseDir, "first_folio_editions"), "first-folio");

  console.log("\nApocrypha:");
  total += scanDirectory(path.join(baseDir, "apocrypha"), "ps-apocrypha");

  console.log(`\n══════════════════════════════`);
  console.log(`Done: ${total} works imported.`);
  console.log(`══════════════════════════════\n`);

  // Summary by category
  const cats = db.prepare("SELECT category, COUNT(*) as n FROM works GROUP BY category ORDER BY category").all();
  console.log("By category:");
  for (const c of cats) console.log(`  ${c.category}: ${c.n}`);
  console.log();

  db.close();
}

main();
