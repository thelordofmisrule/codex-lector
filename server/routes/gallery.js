const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const { requireAdmin } = require("../auth");
const { buildWorkLookup, resolveWorkSlugs } = require("../lib/workCatalog");
const { normalizeQuoteImageWorkKey } = require("../lib/quoteImageCollections");

const r = express.Router();

function parseTags(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((tag) => String(tag || "").trim()).filter(Boolean))];
  }
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.map((tag) => String(tag || "").trim()).filter(Boolean))] : [];
  } catch {
    if (typeof raw === "string") {
      return [...new Set(raw.split(/[,\n;]+/).map((tag) => tag.trim()).filter(Boolean))];
    }
    return [];
  }
}

function prettyLabel(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPublicTag(tag) {
  return !!tag
    && !tag.startsWith("slug:")
    && !tag.startsWith("source:")
    && !tag.startsWith("work:");
}

function tagLabel(tag) {
  if (String(tag || "").startsWith("category:")) {
    return prettyLabel(String(tag).slice("category:".length));
  }
  return String(tag || "");
}

function aggregateTags(items) {
  const counts = new Map();
  items.forEach((item) => {
    (item.tags || []).forEach((tag) => {
      if (!isPublicTag(tag)) return;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, label: tagLabel(tag), count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 80);
}

function ensureHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed.");
  }
  return parsed.toString();
}

function safeBaseName(value, fallback = "gallery") {
  return (String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || fallback);
}

function galleryUploadsDir() {
  const dir = path.join(__dirname, "..", "..", "data", "media", "gallery", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extensionFromMime(mimeType) {
  return {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  }[mimeType] || "";
}

function extensionFromUrl(urlString) {
  try {
    const ext = path.extname(new URL(urlString).pathname || "");
    return ext || "";
  } catch {
    return "";
  }
}

function saveGalleryImageBuffer(buffer, fileName, extension) {
  const dir = galleryUploadsDir();
  const safeBase = safeBaseName(fileName || "gallery");
  const ext = extension || ".jpg";
  const name = `${safeBase}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return {
    localMediaPath: `gallery/uploads/${name}`,
    localMediaUrl: `/media/gallery/uploads/${name}`,
  };
}

function uploadFromDataUrl({ fileName, mimeType, dataUrl }) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("Image data required.");
  }
  const ext = extensionFromMime(mimeType);
  if (!ext) throw new Error("Unsupported image type.");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image payload.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 8 * 1024 * 1024) throw new Error("Image too large (max 8MB).");
  return saveGalleryImageBuffer(buffer, fileName, ext);
}

async function uploadFromRemoteUrl(remoteUrl, fileName = "gallery") {
  const url = ensureHttpUrl(remoteUrl);
  const response = await fetch(url, {
    headers: { "user-agent": "Codex Lector gallery importer/1.0" },
  });
  if (!response.ok) throw new Error(`Remote image download failed (${response.status}).`);
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) throw new Error("Remote URL did not return an image.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) throw new Error("Image too large (max 8MB).");
  const ext = extensionFromMime(contentType) || extensionFromUrl(url) || ".jpg";
  return saveGalleryImageBuffer(buffer, fileName, ext);
}

function ensureCollectionForWork(workSlug) {
  const work = db.prepare("SELECT slug, title FROM works WHERE slug=?").get(workSlug);
  if (!work) throw new Error("Valid work association required.");

  const existing = db.prepare("SELECT id FROM quote_image_collections WHERE work_slug=?").get(work.slug);
  if (existing) return existing.id;

  const workKey = normalizeQuoteImageWorkKey(work.title);
  const byKey = db.prepare("SELECT id FROM quote_image_collections WHERE work_key=?").get(workKey);
  if (byKey) {
    db.prepare("UPDATE quote_image_collections SET work_slug=?, work_title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(work.slug, work.title, byKey.id);
    return byKey.id;
  }

  const inserted = db.prepare(`
    INSERT INTO quote_image_collections (work_key, work_title, work_slug, category_url, notes, tags_json, updated_at)
    VALUES (?, ?, ?, '', '', '[]', CURRENT_TIMESTAMP)
  `).run(workKey, work.title, work.slug);
  return inserted.lastInsertRowid;
}

function getImageWorkSlugs(imageId) {
  return db.prepare("SELECT work_slug FROM quote_image_work_links WHERE image_id=? ORDER BY work_slug").all(imageId).map((row) => row.work_slug);
}

function replaceImageWorkLinks(imageId, workSlugs) {
  const clear = db.prepare("DELETE FROM quote_image_work_links WHERE image_id=?");
  const insert = db.prepare("INSERT OR IGNORE INTO quote_image_work_links (image_id, work_slug) VALUES (?, ?)");
  clear.run(imageId);
  workSlugs.forEach((slug) => insert.run(imageId, slug));
}

function listGalleryItems() {
  const rows = db.prepare(`
    SELECT
      i.id,
      i.collection_id,
      i.title,
      i.source_label,
      i.page_url,
      i.image_url,
      i.local_media_path,
      i.local_media_url,
      i.external_ref,
      i.managed_source,
      i.manual_override,
      i.sort_order,
      i.tags_json,
      c.work_slug AS collection_work_slug,
      c.work_title AS collection_work_title,
      c.category_url,
      c.notes,
      l.work_slug AS linked_work_slug,
      w.title AS linked_work_title
    FROM quote_images i
    LEFT JOIN quote_image_collections c ON c.id = i.collection_id
    LEFT JOIN quote_image_work_links l ON l.image_id = i.id
    LEFT JOIN works w ON w.slug = l.work_slug
    WHERE COALESCE(i.managed_source, 'seed') <> 'hidden'
    ORDER BY COALESCE(c.work_title, ''), i.sort_order, i.id
  `).all();

  const itemsById = new Map();
  rows.forEach((row) => {
    if (!itemsById.has(row.id)) {
      itemsById.set(row.id, {
        id: row.id,
        collectionId: row.collection_id,
        title: row.title || "",
        sourceLabel: row.source_label || "",
        pageUrl: row.page_url || "",
        imageUrl: row.local_media_url || row.image_url || "",
        originalImageUrl: row.image_url || "",
        localMediaPath: row.local_media_path || "",
        localMediaUrl: row.local_media_url || "",
        externalRef: row.external_ref || "",
        managedSource: row.managed_source || "seed",
        manualOverride: !!row.manual_override,
        categoryUrl: row.category_url || "",
        notes: row.notes || "",
        sortOrder: row.sort_order || 0,
        tags: parseTags(row.tags_json),
        works: [],
        workSlugs: [],
        primaryWorkSlug: row.collection_work_slug || "",
        workTitle: row.collection_work_title || "",
      });
    }
    const item = itemsById.get(row.id);
    if (row.linked_work_slug && !item.workSlugs.includes(row.linked_work_slug)) {
      item.workSlugs.push(row.linked_work_slug);
      item.works.push({
        slug: row.linked_work_slug,
        title: row.linked_work_title || row.linked_work_slug,
      });
    }
  });

  const items = [...itemsById.values()];
  items.forEach((item) => {
    if (!item.workSlugs.length && item.primaryWorkSlug) {
      item.workSlugs = [item.primaryWorkSlug];
      item.works = [{ slug: item.primaryWorkSlug, title: item.workTitle || item.primaryWorkSlug }];
    }
    if (!item.workTitle && item.works[0]) item.workTitle = item.works[0].title;
    if (!item.primaryWorkSlug && item.workSlugs[0]) item.primaryWorkSlug = item.workSlugs[0];
  });
  return items;
}

r.get("/", (req, res) => {
  const workSlug = String(req.query.work || "").trim();
  const tagFilter = String(req.query.tag || "").trim().toLowerCase();
  const query = String(req.query.q || "").trim().toLowerCase();
  const limit = Math.min(400, Math.max(1, parseInt(req.query.limit || "120", 10) || 120));
  const items = listGalleryItems();

  const works = [...new Map(
    items.flatMap((item) => item.works.map((work) => [work.slug, { workSlug: work.slug, workTitle: work.title }])),
  ).values()].sort((a, b) => a.workTitle.localeCompare(b.workTitle));

  const facetedItems = items.filter((item) => {
    if (workSlug && !item.workSlugs.includes(workSlug)) return false;
    if (query) {
      const haystack = `${item.title} ${item.workTitle} ${item.works.map((work) => work.title).join(" ")} ${(item.tags || []).join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const filtered = facetedItems.filter((item) => {
    if (tagFilter && !(item.tags || []).some((tag) => tag.toLowerCase() === tagFilter)) return false;
    return true;
  });

  res.json({
    works,
    tags: aggregateTags(facetedItems),
    total: filtered.length,
    items: filtered.slice(0, limit),
  });
});

r.post("/upload-image", requireAdmin, (req, res) => {
  try {
    const uploaded = uploadFromDataUrl(req.body || {});
    res.json(uploaded);
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not upload gallery image." });
  }
});

r.post("/import-remote", requireAdmin, async (req, res) => {
  try {
    const remoteUrl = String(req.body?.remoteUrl || "").trim();
    if (!remoteUrl) return res.status(400).json({ error: "Remote URL required." });
    const uploaded = await uploadFromRemoteUrl(remoteUrl, req.body?.fileName || "gallery");
    res.json(uploaded);
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not import remote image." });
  }
});

function validateImagePayload(body = {}, existing = null) {
  const workLookup = buildWorkLookup();
  const requestedWorkSlugs = body.workSlugs !== undefined
    ? resolveWorkSlugs(body.workSlugs, workLookup)
    : (existing ? getImageWorkSlugs(existing.id) : []);
  const primaryWorkSlug = resolveWorkSlugs([body.primaryWorkSlug], workLookup)[0] || requestedWorkSlugs[0] || existing?.primaryWorkSlug || "";
  if (!primaryWorkSlug) throw new Error("Select at least one associated work.");

  const pageUrl = body.pageUrl === undefined && existing ? existing.pageUrl : (body.pageUrl ? ensureHttpUrl(body.pageUrl) : "");
  const imageUrl = body.imageUrl === undefined && existing ? existing.originalImageUrl : (body.imageUrl ? ensureHttpUrl(body.imageUrl) : "");
  const localMediaPath = body.localMediaPath === undefined && existing ? existing.localMediaPath : String(body.localMediaPath || "").trim();
  const localMediaUrl = body.localMediaUrl === undefined && existing ? existing.localMediaUrl : String(body.localMediaUrl || "").trim();
  const resolvedImageUrl = imageUrl || localMediaUrl || existing?.originalImageUrl || existing?.localMediaUrl || "";
  if (!resolvedImageUrl) throw new Error("Image URL or uploaded media required.");

  return {
    collectionId: ensureCollectionForWork(primaryWorkSlug),
    title: String(body.title !== undefined ? body.title : existing?.title || "").trim(),
    sourceLabel: String(body.sourceLabel !== undefined ? body.sourceLabel : existing?.sourceLabel || "").trim(),
    pageUrl,
    imageUrl: resolvedImageUrl,
    localMediaPath,
    localMediaUrl,
    tags: parseTags(body.tags !== undefined ? body.tags : existing?.tags || []),
    workSlugs: [...new Set([primaryWorkSlug, ...requestedWorkSlugs])],
    primaryWorkSlug,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : (existing?.sortOrder || 0),
  };
}

r.post("/images", requireAdmin, (req, res) => {
  try {
    const payload = validateImagePayload(req.body || null, null);
    const inserted = db.prepare(`
      INSERT INTO quote_images (
        collection_id, title, source_label, page_url, image_url, local_media_path, local_media_url,
        external_ref, managed_source, manual_override, sort_order, tags_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'manual', 1, ?, ?)
    `).run(
      payload.collectionId,
      payload.title,
      payload.sourceLabel,
      payload.pageUrl,
      payload.imageUrl,
      payload.localMediaPath,
      payload.localMediaUrl,
      payload.sortOrder,
      JSON.stringify(payload.tags),
    );
    replaceImageWorkLinks(inserted.lastInsertRowid, payload.workSlugs);
    const item = listGalleryItems().find((entry) => entry.id === inserted.lastInsertRowid);
    res.status(201).json({ image: item || null });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not create gallery image." });
  }
});

r.put("/images/:id", requireAdmin, (req, res) => {
  const existing = listGalleryItems().find((item) => item.id === Number(req.params.id));
  if (!existing) return res.status(404).json({ error: "Gallery image not found." });

  try {
    const payload = validateImagePayload(req.body || {}, existing);
    db.prepare(`
      UPDATE quote_images
      SET
        collection_id=?,
        title=?,
        source_label=?,
        page_url=?,
        image_url=?,
        local_media_path=?,
        local_media_url=?,
        sort_order=?,
        tags_json=?,
        manual_override=1
      WHERE id=?
    `).run(
      payload.collectionId,
      payload.title,
      payload.sourceLabel,
      payload.pageUrl,
      payload.imageUrl,
      payload.localMediaPath,
      payload.localMediaUrl,
      payload.sortOrder,
      JSON.stringify(payload.tags),
      existing.id,
    );
    replaceImageWorkLinks(existing.id, payload.workSlugs);
    const item = listGalleryItems().find((entry) => entry.id === existing.id);
    res.json({ image: item || null });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not update gallery image." });
  }
});

r.delete("/images/:id", requireAdmin, (req, res) => {
  const row = db.prepare("SELECT id, managed_source, external_ref FROM quote_images WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Gallery image not found." });

  if (row.managed_source === "seed" && row.external_ref) {
    db.prepare(`
      UPDATE quote_images
      SET managed_source='hidden', manual_override=1
      WHERE id=?
    `).run(row.id);
  } else {
    db.prepare("DELETE FROM quote_images WHERE id=?").run(row.id);
  }

  res.json({ ok: true });
});

module.exports = r;
