const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const notes = require("./data/lucrece-global-annotations");

const DB_PATH = path.join(__dirname, "..", "data", "codex.db");

if (!fs.existsSync(DB_PATH)) {
  console.error("Database not found. Run `npm run setup` first.");
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

function decodeEntities(str) {
  return String(str || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function cleanText(xmlFragment) {
  return decodeEntities(
    String(xmlFragment || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  ).replace(/[\uE000-\uF8FF]/g, "");
}

function readAttr(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? match[1] : "";
}

function extractPoemLines(xmlString) {
  const xml = String(xmlString || "");
  const stanzaMatches = Array.from(xml.matchAll(/<(?:stanza|stanzasmall)\b[^>]*>([\s\S]*?)<\/(?:stanza|stanzasmall)>/gi));
  if (!stanzaMatches.length) {
    throw new Error("Could not find stanza-based poem lines.");
  }

  const linesByNumber = new Map();
  let runningNumber = 0;

  stanzaMatches.forEach((match, stanzaIndex) => {
    const stanzaXml = match[1] || "";
    const lineMatches = Array.from(stanzaXml.matchAll(/<(?:l|line)\b([^>]*)>([\s\S]*?)<\/(?:l|line)>/gi));

    lineMatches.forEach((lineMatch, lineIndex) => {
      const attrs = lineMatch[1] || "";
      const text = cleanText(lineMatch[2]);
      if (!text) return;

      const rawId = readAttr(attrs, "xml:id") || readAttr(attrs, "id");
      const rawN = readAttr(attrs, "gn") || readAttr(attrs, "n");
      const parsedN = parseInt(rawN, 10);
      const lineNumber = Number.isFinite(parsedN) ? parsedN : (runningNumber + 1);
      runningNumber = lineNumber;

      linesByNumber.set(lineNumber, {
        lineNumber,
        lineKey: rawId || `p-${stanzaIndex}-${lineIndex}`,
        text,
      });
    });
  });

  return linesByNumber;
}

function findWork() {
  return db.prepare(`
    SELECT id, slug, title, variant, content
    FROM works
    WHERE lower(slug)=?
       OR lower(title) LIKE ?
       OR lower(slug) LIKE ?
    ORDER BY
      CASE
        WHEN lower(slug)=? THEN 0
        WHEN variant='ps' THEN 1
        ELSE 2
      END,
      id ASC
    LIMIT 1
  `).get("rape-of-lucrece", "%lucrece%", "%lucrece%", "rape-of-lucrece");
}

function findEditorialUser() {
  const preferred = db.prepare("SELECT id, username FROM users WHERE username=? LIMIT 1").get("petruch10");
  if (preferred) return preferred;

  return db.prepare(`
    SELECT id, username
    FROM users
    WHERE can_publish_global=1
    ORDER BY is_admin DESC, id ASC
    LIMIT 1
  `).get();
}

function buildSelectedText(linesByNumber, lineStart, lineEnd) {
  const selected = [];
  for (let line = lineStart; line <= lineEnd; line += 1) {
    const item = linesByNumber.get(line);
    if (!item) {
      throw new Error(`Missing poem line ${line}.`);
    }
    selected.push(item.text);
  }
  return selected.join("\n");
}

function main() {
  const user = findEditorialUser();
  if (!user) {
    console.error("No editorial user found. Make sure @petruch10 exists and can publish global annotations.");
    process.exit(1);
  }

  const work = findWork();
  if (!work) {
    console.error("Could not find The Rape of Lucrece in works. Run `npm run import` first.");
    process.exit(1);
  }
  if (!work.content) {
    console.error(`Work ${work.slug} has no stored XML content.`);
    process.exit(1);
  }

  const linesByNumber = extractPoemLines(work.content);
  const existingByLine = new Set(
    db.prepare(`
      SELECT line_id
      FROM annotations
      WHERE work_id=? AND user_id=? AND is_global=1
    `).all(work.id, user.id).map((row) => row.line_id)
  );

  const insert = db.prepare(`
    INSERT INTO annotations (work_id, user_id, line_id, note, color, selected_text, is_global)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  let inserted = 0;
  let skipped = 0;
  const missing = [];
  const resolvedSpecs = notes.map((spec) => {
    const startLine = spec.lineStart;
    const endLine = spec.lineEnd || spec.lineStart;
    const firstLine = linesByNumber.get(startLine);

    if (!firstLine) {
      missing.push(startLine);
      return null;
    }

    return {
      ...spec,
      lineKey: firstLine.lineKey,
      selectedText: buildSelectedText(linesByNumber, startLine, endLine),
    };
  }).filter(Boolean);

  if (missing.length) {
    console.error(`Could not resolve Lucrece line numbers: ${missing.join(", ")}`);
    process.exit(1);
  }

  const run = db.transaction(() => {
    resolvedSpecs.forEach((spec) => {
      if (existingByLine.has(spec.lineKey)) {
        skipped += 1;
        return;
      }

      insert.run(
        work.id,
        user.id,
        spec.lineKey,
        spec.note.trim(),
        Number.isFinite(spec.color) ? spec.color : 2,
        spec.selectedText
      );
      inserted += 1;
    });
  });

  run();

  console.log(`Imported Lucrece annotations for ${user.username}.`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped existing line keys: ${skipped}`);
}

main();
