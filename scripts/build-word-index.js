/**
 * scripts/build-word-index.js
 * Extracts all words from work content and builds a frequency index.
 * Run: node scripts/build-word-index.js
 */
const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(path.join(__dirname, "..", "data", "codex.db"));

// Strip XML/HTML tags and extract plain text
function stripTags(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");
}

// Tokenize into words (lowercase, letters only, 2+ chars)
function tokenize(text) {
  return text.toLowerCase().match(/[a-z']{2,}/g) || [];
}

console.log("Building word index...");

// Clear existing index
db.exec("DELETE FROM word_index");

const works = db.prepare("SELECT id, title, content FROM works WHERE content IS NOT NULL").all();
const insert = db.prepare("INSERT OR REPLACE INTO word_index (word, work_id, count) VALUES (?,?,?)");

const globalFreq = {};
let totalWorks = 0;

const insertMany = db.transaction((rows) => {
  for (const r of rows) insert.run(r.word, r.workId, r.count);
});

for (const work of works) {
  const text = stripTags(work.content);
  const words = tokenize(text);
  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
    globalFreq[w] = (globalFreq[w] || 0) + 1;
  }

  const rows = Object.entries(freq).map(([word, count]) => ({ word, workId: work.id, count }));
  insertMany(rows);
  totalWorks++;
  console.log(`  ${work.title}: ${words.length} words, ${Object.keys(freq).length} unique`);
}

console.log(`\nIndexed ${totalWorks} works, ${Object.keys(globalFreq).length} unique words.`);
console.log(`Top 20 words across all works:`);
const top = Object.entries(globalFreq).sort((a,b) => b[1]-a[1]).slice(0, 20);
for (const [word, count] of top) console.log(`  ${word}: ${count}`);

db.close();
console.log("\nWord index complete.");
