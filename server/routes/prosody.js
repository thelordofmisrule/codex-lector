const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../auth");

const r = express.Router();

function getWork(slug) {
  return db.prepare("SELECT id, slug, title FROM works WHERE slug=?").get(String(slug || ""));
}

function serializeOverride(row) {
  return {
    id: row.id,
    lineKey: row.line_key,
    lineText: row.line_text || "",
    scanText: row.scan_text,
    stressPattern: row.stress_pattern,
    noteTitle: row.note_title || "",
    noteBody: row.note_body || "",
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseSegments(scanText) {
  return String(scanText || "")
    .split("|")
    .map((part) => String(part || ""))
    .filter((part) => part.length > 0);
}

function normalizeStressPattern(pattern, segmentCount) {
  const value = String(pattern || "").trim().toLowerCase();
  if (!value) throw new Error("Stress pattern is required.");
  if (!/^[ws]+$/.test(value)) throw new Error("Stress pattern must contain only 'w' and 's'.");
  if (value.length !== segmentCount) throw new Error("Stress pattern length must match the number of syllables.");
  return value;
}

r.get("/:workSlug", (req, res) => {
  const work = getWork(req.params.workSlug);
  if (!work) return res.status(404).json({ error: "Work not found." });
  const rows = db.prepare(`
    SELECT *
    FROM prosody_overrides
    WHERE work_id=?
    ORDER BY line_key
  `).all(work.id);
  res.json({ overrides: rows.map(serializeOverride) });
});

r.put("/:workSlug/:lineKey", requireAdmin, (req, res) => {
  const work = getWork(req.params.workSlug);
  if (!work) return res.status(404).json({ error: "Work not found." });

  const lineKey = String(req.params.lineKey || "").trim();
  const lineText = String(req.body?.lineText || "").trim();
  const scanText = String(req.body?.scanText || "");
  const noteTitle = String(req.body?.noteTitle || "").trim().slice(0, 120);
  const noteBody = String(req.body?.noteBody || "").trim().slice(0, 600);
  if (!lineKey) return res.status(400).json({ error: "Line key is required." });

  const segments = parseSegments(scanText);
  if (!segments.length) return res.status(400).json({ error: "Scan text must contain at least one syllable." });
  if (!segments.some((segment) => /[A-Za-z]/.test(segment))) {
    return res.status(400).json({ error: "Scan text must contain readable text." });
  }

  let stressPattern;
  try {
    stressPattern = normalizeStressPattern(req.body?.stressPattern, segments.length);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Invalid stress pattern." });
  }

  db.prepare(`
    INSERT INTO prosody_overrides (
      work_id, line_key, line_text, scan_text, stress_pattern, note_title, note_body, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(work_id, line_key) DO UPDATE SET
      line_text=excluded.line_text,
      scan_text=excluded.scan_text,
      stress_pattern=excluded.stress_pattern,
      note_title=excluded.note_title,
      note_body=excluded.note_body,
      updated_by=excluded.updated_by,
      updated_at=CURRENT_TIMESTAMP
  `).run(work.id, lineKey, lineText, scanText, stressPattern, noteTitle, noteBody, req.user.id, req.user.id);

  const row = db.prepare("SELECT * FROM prosody_overrides WHERE work_id=? AND line_key=?").get(work.id, lineKey);
  res.json({ override: serializeOverride(row) });
});

r.delete("/:workSlug/:lineKey", requireAdmin, (req, res) => {
  const work = getWork(req.params.workSlug);
  if (!work) return res.status(404).json({ error: "Work not found." });
  const lineKey = String(req.params.lineKey || "").trim();
  if (!lineKey) return res.status(400).json({ error: "Line key is required." });
  db.prepare("DELETE FROM prosody_overrides WHERE work_id=? AND line_key=?").run(work.id, lineKey);
  res.json({ ok: true });
});

module.exports = r;
