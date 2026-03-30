const COMMONS_QUOTE_IMAGE_SEED = require("../data/shakespeare_commons_images.json");

let VISA_QUOTE_IMAGE_SEED = { works: {} };
try {
  VISA_QUOTE_IMAGE_SEED = require("../data/shakespeare_visa_images.json");
} catch {
  VISA_QUOTE_IMAGE_SEED = { works: {} };
}

function normalizeQuoteImageWorkKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/^a\s+/, "")
    .replace(/^an\s+/, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSeedTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => String(tag || "").trim())
    .filter(Boolean);
}

function collectionsFromSeed(seed) {
  const works = seed?.works && typeof seed.works === "object"
    ? seed.works
    : {};

  return Object.entries(works).map(([workTitle, entry]) => ({
    workKey: normalizeQuoteImageWorkKey(workTitle),
    workTitle: String(workTitle || "").trim(),
    categoryUrl: String(entry?.category || "").trim(),
    notes: String(entry?.notes || "").trim(),
    tags: normalizeSeedTags(entry?.tags),
    images: Array.isArray(entry?.images)
      ? entry.images.map((image, index) => ({
        title: String(image?.title || "").trim(),
        artist: String(image?.artist || "").trim(),
        year: String(image?.year || "").trim(),
        sourceLabel: String(image?.sourceLabel || image?.source || "").trim(),
        pageUrl: String(image?.page || "").trim(),
        imageUrl: String(image?.download || "").trim(),
        localMediaPath: String(image?.localMediaPath || "").trim(),
        localMediaUrl: String(image?.localMediaUrl || "").trim(),
        tags: normalizeSeedTags(image?.tags),
        sortOrder: index,
      })).filter((image) => image.pageUrl || image.imageUrl)
      : [],
  })).filter((entry) => entry.workKey);
}

function mergeCollections(collections) {
  const merged = new Map();

  collections.forEach((collection) => {
    const existing = merged.get(collection.workKey);
    if (!existing) {
      merged.set(collection.workKey, {
        ...collection,
        tags: [...collection.tags],
        images: [...collection.images],
      });
      return;
    }

    const imageRefs = new Set(
      existing.images.map((image) => image.pageUrl || image.imageUrl).filter(Boolean),
    );

    existing.tags = [...new Set([...existing.tags, ...collection.tags])];
    existing.notes = [existing.notes, collection.notes].filter(Boolean).join("\n\n");
    if (!existing.categoryUrl && collection.categoryUrl) existing.categoryUrl = collection.categoryUrl;

    collection.images.forEach((image) => {
      const ref = image.pageUrl || image.imageUrl;
      if (ref && imageRefs.has(ref)) return;
      if (ref) imageRefs.add(ref);
      existing.images.push({ ...image });
    });
  });

  return [...merged.values()].map((collection) => ({
    ...collection,
    images: collection.images.map((image, index) => ({
      ...image,
      sortOrder: index,
    })),
  }));
}

function quoteImageSeedCollections() {
  return mergeCollections([
    ...collectionsFromSeed(COMMONS_QUOTE_IMAGE_SEED),
    ...collectionsFromSeed(VISA_QUOTE_IMAGE_SEED),
  ]);
}

module.exports = {
  normalizeQuoteImageWorkKey,
  quoteImageSeedCollections,
};
