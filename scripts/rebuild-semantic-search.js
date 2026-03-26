const path = require("path");
const Database = require("better-sqlite3");
const { rebuildSemanticSearchIndex } = require("../server/lib/semanticSearchIndex");

async function main() {
  const db = new Database(path.join(__dirname, "..", "data", "codex.db"));
  db.pragma("journal_mode = WAL");
  try {
    const summary = await rebuildSemanticSearchIndex(db, { logger: console });
    if (summary.skipped) {
      console.log(summary.reason || "Semantic search rebuild skipped.");
      return;
    }
    console.log(`Semantic search ready: ${summary.chunks} chunks across ${summary.works} works (${summary.model}, ${summary.dimensions}d).`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
