const express = require("express");
const db = require("../db");
const r = express.Router();

// List (no content)
r.get("/", (req, res) => {
  res.json(db.prepare("SELECT id,slug,title,category,variant,authors,(content IS NOT NULL) as has_content FROM works ORDER BY category,title").all());
});

// Full-text search across all works
r.get("/search/text", (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  const query = q.trim();
  const works = db.prepare("SELECT id, slug, title, category, content FROM works WHERE content IS NOT NULL").all();
  const results = [];

  for (const w of works) {
    const text = w.content || "";
    const lower = text.toLowerCase();
    const qLower = query.toLowerCase();
    let idx = 0;
    const matches = [];
    while ((idx = lower.indexOf(qLower, idx)) !== -1 && matches.length < 5) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + query.length + 60);
      let snippet = text.slice(start, end).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (start > 0) snippet = "…" + snippet;
      if (end < text.length) snippet = snippet + "…";
      matches.push({ snippet, position: idx });
      idx += query.length;
    }
    if (matches.length > 0) {
      results.push({ slug: w.slug, title: w.title, category: w.category, matches });
    }
  }

  res.json(results);
});

// Single work with content
r.get("/:slug", (req, res) => {
  const w = db.prepare("SELECT * FROM works WHERE slug=?").get(req.params.slug);
  if (!w) return res.status(404).json({ error:"Not found." });
  res.json(w);
});

module.exports = r;
