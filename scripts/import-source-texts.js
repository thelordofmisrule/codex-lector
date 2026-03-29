const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { SOURCE_TEXT_TCP_MAP } = require("../server/data/sourceTextCatalog");
const { buildSourceTextSlug, ensureSourceTextSchema, extractSourceTextMetadata } = require("../server/lib/sourceTexts");

const DB_PATH = path.join(__dirname, "..", "data", "codex.db");
const SOURCE_DIR = path.join(__dirname, "..", "data", "eebo-tcp");
const FORCE = process.argv.includes("--force");

if (!fs.existsSync(DB_PATH)) {
  console.error("Run `npm run setup` first.");
  process.exit(1);
}

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`Source directory not found: ${SOURCE_DIR}`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
ensureSourceTextSchema(db);

const selectExisting = db.prepare("SELECT xml FROM source_texts WHERE tcp_id=?");
const upsert = db.prepare(`
  INSERT INTO source_texts (
    source_id, tcp_id, slug, title, author, date_label, publication, language, xml, imported_at, updated_at
  ) VALUES (
    @source_id, @tcp_id, @slug, @title, @author, @date_label, @publication, @language, @xml, datetime('now'), datetime('now')
  )
  ON CONFLICT(tcp_id) DO UPDATE SET
    source_id=excluded.source_id,
    slug=excluded.slug,
    title=excluded.title,
    author=excluded.author,
    date_label=excluded.date_label,
    publication=excluded.publication,
    language=excluded.language,
    xml=excluded.xml,
    updated_at=datetime('now')
`);

function main() {
  const files = fs.readdirSync(SOURCE_DIR)
    .filter((file) => file.toLowerCase().endsWith(".xml"))
    .sort();

  if (!files.length) {
    console.log("No EEBO-TCP XML files found.");
    return;
  }

  let imported = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(SOURCE_DIR, file);
    const xml = fs.readFileSync(filePath, "utf8");
    const tcpId = path.basename(file, ".xml").toUpperCase();
    const existing = selectExisting.get(tcpId);

    if (!FORCE && existing?.xml === xml) {
      skipped += 1;
      console.log(`  ✓ ${tcpId} (cached)`);
      continue;
    }

    const meta = extractSourceTextMetadata(xml, tcpId);
    upsert.run({
      source_id: SOURCE_TEXT_TCP_MAP[tcpId] || "",
      tcp_id: meta.tcpId || tcpId,
      slug: buildSourceTextSlug(meta.tcpId || tcpId),
      title: meta.title || tcpId,
      author: meta.author || "",
      date_label: meta.dateLabel || "",
      publication: meta.publication || "",
      language: meta.language || "",
      xml,
    });

    imported += 1;
    console.log(`  ✓ ${tcpId} → ${meta.title}`);
  }

  const total = db.prepare("SELECT COUNT(*) AS count FROM source_texts").get()?.count || 0;
  console.log(`\nSource texts ready: ${total} rows. Imported ${imported}, skipped ${skipped}.`);
}

main();
