/**
 * scripts/build-word-index.js
 * Rebuilds the word_index vocabulary table (used for autocomplete) from
 * work_search_lines.normalized_text, so its tokenization matches the search
 * index and the concordance exactly ("lov'd" -> "lovd").
 *
 * Run after rebuild-search-index: node scripts/build-word-index.js
 */
const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(path.join(__dirname, "..", "data", "codex.db"));
db.pragma("journal_mode = WAL");

console.log("Building word index from work_search_lines...");

const lineCount = db.prepare("SELECT count(*) AS n FROM work_search_lines").get().n;
if (!lineCount) {
  console.error("work_search_lines is empty — run `npm run build-search` first.");
  process.exit(1);
}

const works = db.prepare(`
  SELECT DISTINCT work_id AS workId, work_title AS title FROM work_search_lines
`).all();

const readLines = db.prepare(`
  SELECT normalized_text AS text FROM work_search_lines
  WHERE work_id = ? AND normalized_text != ''
`);
const insert = db.prepare("INSERT INTO word_index (word, work_id, count) VALUES (?,?,?)");

const globalFreq = new Map();

const rebuild = db.transaction(() => {
  db.exec("DELETE FROM word_index");
  for (const work of works) {
    const freq = new Map();
    for (const { text } of readLines.iterate(work.workId)) {
      for (const token of text.split(" ")) {
        if (token.length < 2) continue;
        freq.set(token, (freq.get(token) || 0) + 1);
        globalFreq.set(token, (globalFreq.get(token) || 0) + 1);
      }
    }
    for (const [word, count] of freq) insert.run(word, work.workId, count);
    console.log(`  ${work.title}: ${freq.size} unique words`);
  }
});
rebuild();

console.log(`\nIndexed ${works.length} works, ${globalFreq.size} unique words.`);
const top = [...globalFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log("Top 10:", top.map(([word, count]) => `${word}:${count}`).join(" "));

db.close();
console.log("Word index complete.");
