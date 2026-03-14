const express = require("express");
const db = require("../db");
const { requireEditorial } = require("../auth");
const { normalizeGlossaryTerm, getWorkBySlug, serializeEntry } = require("../lib/glossary");

const r = express.Router();

function cleanDefinition(value) {
  return String(value || "").trim().replace(/\s+\n/g, "\n").slice(0, 500);
}

function cleanSourceLabel(value) {
  return String(value || "").trim().slice(0, 120);
}

function parseVariants(values) {
  const items = Array.isArray(values) ? values : String(values || "").split(",");
  const normalized = [];
  const seen = new Set();
  for (const item of items) {
    const value = normalizeGlossaryTerm(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

const saveGlobalEntry = db.transaction((payload, userId) => {
  const headword = normalizeGlossaryTerm(payload.headword);
  const definition = cleanDefinition(payload.definition);
  const sourceLabel = cleanSourceLabel(payload.sourceLabel);
  const variants = parseVariants(payload.variants).filter((variant) => variant !== headword);

  if (!headword) throw new Error("Headword is required.");
  if (!definition) throw new Error("Definition is required.");

  let entryId = Number(payload.entryId) || 0;
  if (entryId) {
    const existing = db.prepare("SELECT id FROM glossary_entries WHERE id=?").get(entryId);
    if (!existing) throw new Error("Glossary entry not found.");
    db.prepare(`
      UPDATE glossary_entries
      SET headword=?, definition=?, source_label=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(headword, definition, sourceLabel, userId, entryId);
  } else {
    const existing = db.prepare("SELECT id FROM glossary_entries WHERE headword=?").get(headword);
    if (existing) {
      entryId = existing.id;
      db.prepare(`
        UPDATE glossary_entries
        SET definition=?, source_label=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(definition, sourceLabel, userId, entryId);
    } else {
      const result = db.prepare(`
        INSERT INTO glossary_entries (headword, definition, source_label, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(headword, definition, sourceLabel, userId, userId);
      entryId = Number(result.lastInsertRowid);
    }
  }

  db.prepare("DELETE FROM glossary_variants WHERE entry_id=?").run(entryId);
  const insertVariant = db.prepare("INSERT OR IGNORE INTO glossary_variants (entry_id, variant) VALUES (?, ?)");
  for (const variant of variants) insertVariant.run(entryId, variant);

  return db.prepare("SELECT * FROM glossary_entries WHERE id=?").get(entryId);
});

const saveOverride = db.transaction((payload, userId) => {
  const scope = payload.scope === "line" ? "line" : "work";
  const work = getWorkBySlug(db, payload.workSlug);
  if (!work) throw new Error("Work not found.");

  const lineId = scope === "line" ? String(payload.lineId || "").trim() : "";
  const normalizedWord = normalizeGlossaryTerm(payload.lookupTerm);
  const definition = cleanDefinition(payload.definition);
  const sourceLabel = cleanSourceLabel(payload.sourceLabel);

  if (scope === "line" && !lineId) throw new Error("Line override requires a line id.");
  if (!normalizedWord) throw new Error("Lookup term is required.");
  if (!definition) throw new Error("Definition is required.");

  let overrideId = Number(payload.overrideId) || 0;
  if (overrideId) {
    const existing = db.prepare("SELECT id FROM glossary_overrides WHERE id=?").get(overrideId);
    if (!existing) throw new Error("Glossary override not found.");
    db.prepare(`
      UPDATE glossary_overrides
      SET work_id=?, line_id=?, normalized_word=?, definition=?, source_label=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(work.id, lineId, normalizedWord, definition, sourceLabel, userId, overrideId);
  } else {
    const existing = db.prepare(`
      SELECT id
      FROM glossary_overrides
      WHERE work_id=? AND line_id=? AND normalized_word=?
    `).get(work.id, lineId, normalizedWord);

    if (existing) {
      overrideId = existing.id;
      db.prepare(`
        UPDATE glossary_overrides
        SET definition=?, source_label=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(definition, sourceLabel, userId, overrideId);
    } else {
      const result = db.prepare(`
        INSERT INTO glossary_overrides (work_id, line_id, normalized_word, definition, source_label, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(work.id, lineId, normalizedWord, definition, sourceLabel, userId, userId);
      overrideId = Number(result.lastInsertRowid);
    }
  }

  return db.prepare("SELECT * FROM glossary_overrides WHERE id=?").get(overrideId);
});

r.put("/", requireEditorial, (req, res) => {
  try {
    const scope = String(req.body?.scope || "").trim().toLowerCase();
    if (scope === "global") {
      const entry = saveGlobalEntry(req.body, req.user.id);
      return res.json({ ok: true, entry: serializeEntry(db, entry) });
    }
    if (scope === "work" || scope === "line") {
      const override = saveOverride(req.body, req.user.id);
      return res.json({
        ok: true,
        override: {
          id: override.id,
          scope,
          workId: override.work_id,
          lineId: override.line_id,
          lookupTerm: override.normalized_word,
          definition: override.definition,
          sourceLabel: override.source_label || "",
        },
      });
    }
    return res.status(400).json({ error: "Scope must be global, work, or line." });
  } catch (e) {
    const message = e?.message || "Could not save glossary definition.";
    const status = /not found/i.test(message) ? 404 : /required/i.test(message) ? 400 : /unique/i.test(message) ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

r.delete("/", requireEditorial, (req, res) => {
  try {
    const scope = String(req.body?.scope || "").trim().toLowerCase();
    if (scope === "global") {
      const entryId = Number(req.body?.entryId) || 0;
      if (!entryId) return res.status(400).json({ error: "Entry id is required." });
      const result = db.prepare("DELETE FROM glossary_entries WHERE id=?").run(entryId);
      if (!result.changes) return res.status(404).json({ error: "Glossary entry not found." });
      return res.json({ ok: true });
    }

    if (scope === "work" || scope === "line") {
      const overrideId = Number(req.body?.overrideId) || 0;
      if (!overrideId) return res.status(400).json({ error: "Override id is required." });
      const result = db.prepare("DELETE FROM glossary_overrides WHERE id=?").run(overrideId);
      if (!result.changes) return res.status(404).json({ error: "Glossary override not found." });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "Scope must be global, work, or line." });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Could not delete glossary definition." });
  }
});

module.exports = r;
