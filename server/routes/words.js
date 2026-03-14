const express = require("express");
const db = require("../db");
const { getGlossEntry } = require("../lib/shakespeareGlossary");
const r = express.Router();

/* Look up a word: frequency across works, total count, example contexts */
r.get("/:word", (req, res) => {
  const word = req.params.word.toLowerCase().replace(/[^a-z']/g, "");
  if (!word || word.length < 2) return res.status(400).json({ error:"Word too short." });

  // Get frequency per work
  const freq = db.prepare(`
    SELECT wi.count, w.title, w.slug
    FROM word_index wi JOIN works w ON wi.work_id=w.id
    WHERE wi.word=? ORDER BY wi.count DESC
  `).all(word);

  const totalCount = freq.reduce((s, f) => s + f.count, 0);
  const worksAppearingIn = freq.length;

  // Get total unique words in index for relative frequency
  const totalWords = db.prepare("SELECT SUM(count) as n FROM word_index").get()?.n || 1;

  // Find a few example line contexts from the actual content
  const examples = [];
  if (freq.length > 0) {
    // Search up to 3 works for contextual snippets
    const worksToSearch = freq.slice(0, 3);
    for (const f of worksToSearch) {
      const work = db.prepare("SELECT content FROM works WHERE slug=?").get(f.slug);
      if (!work?.content) continue;
      const text = work.content.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      let match;
      let found = 0;
      while ((match = regex.exec(text)) !== null && found < 2) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(text.length, match.index + word.length + 40);
        let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
        if (start > 0) snippet = "…" + snippet;
        if (end < text.length) snippet += "…";
        examples.push({ work:f.title, slug:f.slug, snippet });
        found++;
      }
    }
  }

  // Simple Shakespeare-era glossary (common words that differ from modern English)
  const glossary = getGlossEntry(word);

  res.json({
    word,
    totalCount,
    worksAppearingIn,
    relativeFrequency: totalCount / totalWords,
    frequency: freq.map(f => ({ title:f.title, slug:f.slug, count:f.count })),
    examples: examples.slice(0, 5),
    gloss: glossary,
  });
});

/* Bulk lookup — for autocomplete or batch */
r.get("/", (req, res) => {
  const prefix = (req.query.prefix || "").toLowerCase().replace(/[^a-z']/g, "");
  if (!prefix || prefix.length < 2) return res.json([]);
  const words = db.prepare(`
    SELECT word, SUM(count) as total FROM word_index
    WHERE word LIKE ? GROUP BY word ORDER BY total DESC LIMIT 20
  `).all(`${prefix}%`);
  res.json(words);
});

module.exports = r;
