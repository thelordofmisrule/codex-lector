const Database = require("better-sqlite3");
const path = require("path");
const { rebuildSearchIndex } = require("../server/lib/workSearchIndex");

const db = new Database(path.join(__dirname, "..", "data", "codex.db"));
db.pragma("journal_mode = WAL");

console.log("Rebuilding text search index...");
const summary = rebuildSearchIndex(db, { logger: console, logEachWork: true });
console.log(`Indexed ${summary.lines} searchable lines across ${summary.works} works.${summary.ftsEnabled ? " FTS enabled." : " FTS unavailable; fallback search only."}`);

db.close();
