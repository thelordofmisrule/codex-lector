const QUOTE_IMAGE_SEED = require("../data/shakespeare_commons_images.json");

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

function quoteImageSeedCollections() {
  const works = QUOTE_IMAGE_SEED?.works && typeof QUOTE_IMAGE_SEED.works === "object"
    ? QUOTE_IMAGE_SEED.works
    : {};

  return Object.entries(works).map(([workTitle, entry]) => ({
    workKey: normalizeQuoteImageWorkKey(workTitle),
    workTitle: String(workTitle || "").trim(),
    categoryUrl: String(entry?.category || "").trim(),
    notes: String(entry?.notes || "").trim(),
    images: Array.isArray(entry?.images)
      ? entry.images.map((image, index) => ({
        pageUrl: String(image?.page || "").trim(),
        imageUrl: String(image?.download || "").trim(),
        sortOrder: index,
      })).filter((image) => image.pageUrl || image.imageUrl)
      : [],
  })).filter((entry) => entry.workKey);
}

module.exports = {
  normalizeQuoteImageWorkKey,
  quoteImageSeedCollections,
};
