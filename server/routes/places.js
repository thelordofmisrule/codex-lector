const express = require("express");
const db = require("../db");

const r = express.Router();
const WORK_CACHE_MS = 10 * 60 * 1000;
let cachedWorks = null;
let cachedWorksAt = 0;

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

function parseAliases(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function escRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function placeTerms(place) {
  const terms = [
    place.name,
    place.modern_name,
    ...parseAliases(place.aliases_json),
  ]
    .map(t => String(t || "").trim())
    .filter(Boolean);
  return [...new Set(terms)];
}

function termRegex(term) {
  return new RegExp(`\\b${escRegExp(term).replace(/\s+/g, "\\s+")}\\b`, "i");
}

function parseWorkCache() {
  const now = Date.now();
  if (cachedWorks && (now - cachedWorksAt) < WORK_CACHE_MS) return cachedWorks;
  cachedWorks = db.prepare("SELECT slug, title, category, content FROM works WHERE content IS NOT NULL").all()
    .map(work => ({
      slug: work.slug,
      title: work.title,
      category: work.category,
      lines: extractLineTexts(work.content || ""),
    }));
  cachedWorksAt = now;
  return cachedWorks;
}

function findPlaceMentions(place, parsedWorks, opts = {}) {
  const maxTotal = opts.maxTotal || 12;
  const maxPerWork = opts.maxPerWork || 2;
  const workSlug = opts.workSlug ? String(opts.workSlug) : "";
  const regexes = placeTerms(place).map(termRegex);
  if (!regexes.length) return [];

  const citations = [];
  for (const work of parsedWorks) {
    if (workSlug && work.slug !== workSlug) continue;
    let hitsForWork = 0;
    for (let i = 0; i < work.lines.length; i++) {
      const lineText = work.lines[i];
      if (!regexes.some(re => re.test(lineText))) continue;
      citations.push({
        workSlug: work.slug,
        workTitle: work.title,
        workCategory: work.category,
        lineNumber: i + 1,
        lineText,
      });
      hitsForWork += 1;
      if (hitsForWork >= maxPerWork || citations.length >= maxTotal) break;
    }
    if (citations.length >= maxTotal) break;
  }
  return citations;
}

function serializePlace(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    modernName: row.modern_name,
    placeType: row.place_type,
    modernCountry: row.modern_country,
    lat: row.lat,
    lng: row.lng,
    description: row.description,
    aliases: parseAliases(row.aliases_json),
    isReal: !!row.is_real,
  };
}

r.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM places WHERE is_real=1 ORDER BY name").all();
  const parsedWorks = parseWorkCache();
  const workSlug = req.query.work ? String(req.query.work) : "";
  const places = rows.map(row => {
    const mentions = findPlaceMentions(row, parsedWorks, { workSlug, maxTotal: 6, maxPerWork: 1 });
    return {
      ...serializePlace(row),
      workCount: new Set(mentions.map(item => item.workSlug)).size,
      mentionCount: mentions.length,
      sampleWorks: mentions.slice(0, 3).map(item => ({
        slug: item.workSlug,
        title: item.workTitle,
        lineNumber: item.lineNumber,
      })),
    };
  }).filter(place => place.workCount > 0);

  res.json({ places });
});

r.get("/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM places WHERE slug=? AND is_real=1").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Place not found." });

  const parsedWorks = parseWorkCache();
  const workSlug = req.query.work ? String(req.query.work) : "";
  const citations = findPlaceMentions(row, parsedWorks, { workSlug, maxTotal: 18, maxPerWork: 3 });
  const workCount = new Set(citations.map(item => item.workSlug)).size;

  res.json({
    place: serializePlace(row),
    workCount,
    citations,
  });
});

module.exports = r;
