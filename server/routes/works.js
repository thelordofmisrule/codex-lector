const express = require("express");
const db = require("../db");
const r = express.Router();

function decodeEntities(text) {
  return String(text || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanInlineXml(text) {
  return decodeEntities(String(text || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLineTexts(xml) {
  const lines = [];
  const re = /<(l|line)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const text = cleanInlineXml(match[2]);
    if (text) lines.push(text);
  }
  return lines;
}

function makeSnippet(lineText, query) {
  const lower = lineText.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return lineText;
  const start = Math.max(0, idx - 60);
  const end = Math.min(lineText.length, idx + query.length + 60);
  let snippet = lineText.slice(start, end).trim();
  if (start > 0) snippet = "…" + snippet;
  if (end < lineText.length) snippet += "…";
  return snippet;
}

// List (no content)
r.get("/", (req, res) => {
  res.json(db.prepare("SELECT id,slug,title,category,variant,authors,(content IS NOT NULL) as has_content FROM works ORDER BY category,title").all());
});

// Full-text search across all works
r.get("/search/text", (req, res) => {
  const { q, work: workSlug } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  const query = q.trim();
  let works;
  if (workSlug) {
    works = db.prepare("SELECT id, slug, title, category, content FROM works WHERE content IS NOT NULL AND slug=?").all(String(workSlug));
  } else {
    works = db.prepare("SELECT id, slug, title, category, content FROM works WHERE content IS NOT NULL").all();
  }
  const results = [];
  const normalizedQuery = normalizeSearchText(query);

  for (const w of works) {
    const lines = extractLineTexts(w.content || "");
    const matches = [];

    for (let i = 0; i < lines.length && matches.length < 5; i++) {
      const lineText = lines[i];
      const normalizedLine = normalizeSearchText(lineText);
      if (!normalizedLine.includes(normalizedQuery)) continue;
      matches.push({
        snippet: makeSnippet(lineText, query),
        lineNumber: i + 1,
        lineText,
      });
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
