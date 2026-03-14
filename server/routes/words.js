const express = require("express");
const db = require("../db");
const { resolveGlossary } = require("../lib/glossary");

const r = express.Router();

function sanitizeWord(value) {
  return String(value || "").toLowerCase().replace(/[^a-z']/g, "");
}

function orderWorksForExamples(freq, preferredSlug = "") {
  if (!preferredSlug) return freq.slice(0, 3);
  const preferred = freq.find((item) => item.slug === preferredSlug);
  const rest = freq.filter((item) => item.slug !== preferredSlug);
  return [preferred, ...rest].filter(Boolean).slice(0, 3);
}

/* Look up a word: editorial glossary first, then corpus frequency and examples. */
r.get("/:word", (req, res) => {
  const word = sanitizeWord(req.params.word);
  if (!word || word.length < 2) return res.status(400).json({ error:"Word too short." });

  const workSlug = String(req.query.work || "").trim();
  const lineId = String(req.query.lineId || "").trim();

  const freq = db.prepare(`
    SELECT wi.count, w.title, w.slug
    FROM word_index wi
    JOIN works w ON wi.work_id=w.id
    WHERE wi.word=?
    ORDER BY wi.count DESC
  `).all(word);

  const totalCount = freq.reduce((sum, item) => sum + item.count, 0);
  const worksAppearingIn = freq.length;
  const totalWords = db.prepare("SELECT SUM(count) as n FROM word_index").get()?.n || 1;

  const examples = [];
  if (freq.length > 0) {
    const worksToSearch = orderWorksForExamples(freq, workSlug);
    for (const item of worksToSearch) {
      const work = db.prepare("SELECT content FROM works WHERE slug=?").get(item.slug);
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
        examples.push({ work:item.title, slug:item.slug, snippet });
        found += 1;
      }
    }
  }

  const glossary = resolveGlossary(db, {
    word,
    workSlug,
    lineId,
    includeEditorial: !!req.user?.canPublishGlobal,
  });

  res.json({
    word,
    totalCount,
    worksAppearingIn,
    relativeFrequency: totalCount / totalWords,
    frequency: freq.map((item) => ({ title:item.title, slug:item.slug, count:item.count })),
    examples: examples.slice(0, 5),
    gloss: glossary.gloss,
    editorial: glossary.editorial,
    normalizedWord: glossary.normalizedWord,
  });
});

/* Bulk lookup — for autocomplete or batch */
r.get("/", (req, res) => {
  const prefix = sanitizeWord(req.query.prefix || "");
  if (!prefix || prefix.length < 2) return res.json([]);
  const words = db.prepare(`
    SELECT word, SUM(count) as total FROM word_index
    WHERE word LIKE ? GROUP BY word ORDER BY total DESC LIMIT 20
  `).all(`${prefix}%`);
  res.json(words);
});

module.exports = r;
