#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { normalizeQuoteImageWorkKey } = require("../server/lib/quoteImageCollections");

const DEFAULT_OUTPUT = path.join(__dirname, "..", "server", "data", "shakespeare_commons_images.json");
const DEFAULT_LIMIT = 40;
const DEFAULT_THUMB_WIDTH = 1600;

function usage() {
  console.log(`Usage:
  node scripts/import-commons-gallery.js --work "Julius Caesar"
  node scripts/import-commons-gallery.js --work "Julius Caesar" --category-url "https://commons.wikimedia.org/wiki/Category:Julius_Caesar_(play)_in_art" --limit 30

Options:
  --work <title>          Work title in the seed file to update or create
  --category-url <url>    Wikimedia Commons category URL
  --limit <n>             Number of images to import (default: ${DEFAULT_LIMIT})
  --thumb-width <n>       Preferred Commons thumbnail width for remote image URLs (default: ${DEFAULT_THUMB_WIDTH})
  --download              Cache imported images to data/media/gallery/<work-slug>/
  --output <path>         Output JSON path (default: server/data/shakespeare_commons_images.json)
  --dry-run               Print summary without writing the JSON file
`);
}

function parseArgs(argv) {
  const args = {
    work: "",
    categoryUrl: "",
    limit: DEFAULT_LIMIT,
    thumbWidth: DEFAULT_THUMB_WIDTH,
    download: false,
    dryRun: false,
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--work") args.work = String(argv[index + 1] || "").trim(), index += 1;
    else if (token === "--category-url") args.categoryUrl = String(argv[index + 1] || "").trim(), index += 1;
    else if (token === "--limit") args.limit = Math.max(1, parseInt(argv[index + 1] || `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT), index += 1;
    else if (token === "--thumb-width") args.thumbWidth = Math.max(400, parseInt(argv[index + 1] || `${DEFAULT_THUMB_WIDTH}`, 10) || DEFAULT_THUMB_WIDTH), index += 1;
    else if (token === "--output") args.output = path.resolve(process.cwd(), String(argv[index + 1] || DEFAULT_OUTPUT)), index += 1;
    else if (token === "--download") args.download = true;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function loadSeed(filePath) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.works || typeof parsed.works !== "object") parsed.works = {};
  return { resolved, parsed };
}

function sortObjectKeys(obj) {
  return Object.fromEntries(
    Object.entries(obj).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function slugify(value) {
  return normalizeQuoteImageWorkKey(value).replace(/\s+/g, "-");
}

function cleanTagList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((tag) => String(tag || "").trim()).filter(Boolean))];
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value || "");
  }
}

function parseCategoryTitle(categoryUrl) {
  if (!categoryUrl) return "";
  try {
    const url = new URL(categoryUrl);
    const titleParam = url.searchParams.get("title");
    if (titleParam) {
      return titleParam.startsWith("Category:") ? titleParam : `Category:${titleParam}`;
    }
    const marker = "/wiki/";
    const index = url.pathname.indexOf(marker);
    if (index >= 0) {
      const tail = safeDecode(url.pathname.slice(index + marker.length));
      return tail.startsWith("Category:") ? tail : `Category:${tail}`;
    }
  } catch {}
  const fallback = String(categoryUrl || "").trim();
  if (fallback.startsWith("Category:")) return fallback;
  return fallback.includes("Category:")
    ? fallback.slice(fallback.indexOf("Category:"))
    : "";
}

function canonicalCategoryUrl(categoryTitle) {
  return `https://commons.wikimedia.org/wiki/${String(categoryTitle || "").replace(/\s+/g, "_")}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Codex Lector Commons gallery importer/1.0",
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Commons request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function fetchCategoryMembers(categoryTitle, limit) {
  const fileTitles = [];
  let continuation = "";

  while (fileTitles.length < limit) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmtype: "file",
      cmlimit: String(Math.min(50, limit - fileTitles.length)),
    });
    if (continuation) params.set("cmcontinue", continuation);

    const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
    const members = Array.isArray(data?.query?.categorymembers) ? data.query.categorymembers : [];
    members.forEach((member) => {
      if (member?.title) fileTitles.push(String(member.title));
    });

    continuation = String(data?.continue?.cmcontinue || "");
    if (!continuation || members.length === 0) break;
  }

  return fileTitles.slice(0, limit);
}

function chunk(list, size) {
  const groups = [];
  for (let index = 0; index < list.length; index += size) groups.push(list.slice(index, index + size));
  return groups;
}

function humanizeTitle(rawTitle = "") {
  return safeDecode(String(rawTitle || ""))
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchImageDetails(fileTitles, thumbWidth) {
  const details = [];

  for (const group of chunk(fileTitles, 25)) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: String(thumbWidth),
      titles: group.join("|"),
    });
    const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
    const pages = Object.values(data?.query?.pages || {});
    pages.forEach((page) => {
      const imageInfo = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
      if (!page?.title || !imageInfo?.descriptionurl) return;
      details.push({
        title: humanizeTitle(page.title),
        sourceLabel: "Wikimedia Commons",
        pageUrl: String(imageInfo.descriptionurl || "").trim(),
        imageUrl: String(imageInfo.thumburl || imageInfo.url || "").trim(),
      });
    });
  }

  return details;
}

function guessExtension(url, fallback = ".jpg") {
  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname);
    return extension || fallback;
  } catch {
    return fallback;
  }
}

function sanitizeFilename(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "image";
}

async function downloadImage(imageUrl, destinationPath) {
  const response = await fetch(imageUrl, {
    headers: { "user-agent": "Codex Lector Commons gallery importer/1.0" },
  });
  if (!response.ok) throw new Error(`Image download failed (${response.status}) for ${imageUrl}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, buffer);
}

function mergeImage(existingImage, importedImage) {
  return {
    title: importedImage.title || existingImage?.title || "",
    sourceLabel: importedImage.sourceLabel || existingImage?.sourceLabel || "Wikimedia Commons",
    page: importedImage.pageUrl,
    download: importedImage.imageUrl,
    localMediaPath: importedImage.localMediaPath || existingImage?.localMediaPath || "",
    localMediaUrl: importedImage.localMediaUrl || existingImage?.localMediaUrl || "",
    tags: cleanTagList(existingImage?.tags),
  };
}

async function maybeCacheImages(images, workTitle) {
  const workSlug = slugify(workTitle);
  const mediaDir = path.join(__dirname, "..", "data", "media", "gallery", workSlug);
  fs.mkdirSync(mediaDir, { recursive: true });

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const extension = guessExtension(image.imageUrl);
    const filename = `${String(index + 1).padStart(3, "0")}-${sanitizeFilename(image.title)}${extension}`;
    const targetPath = path.join(mediaDir, filename);
    await downloadImage(image.imageUrl, targetPath);
    image.localMediaPath = `gallery/${workSlug}/${filename}`;
    image.localMediaUrl = `/media/gallery/${workSlug}/${filename}`;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { resolved, parsed } = loadSeed(args.output);

  const existingWorkTitle = args.work
    || Object.keys(parsed.works).find((title) => parsed.works?.[title]?.category === args.categoryUrl)
    || "";

  if (!existingWorkTitle && !args.work) {
    throw new Error("Provide --work so the importer knows which seed entry to update.");
  }

  const workTitle = args.work || existingWorkTitle;
  const existingEntry = parsed.works[workTitle] || {};
  const categoryTitle = parseCategoryTitle(args.categoryUrl || existingEntry.category);
  if (!categoryTitle) {
    throw new Error(`Could not determine a Commons category for "${workTitle}".`);
  }

  const canonicalUrl = canonicalCategoryUrl(categoryTitle);
  const fileTitles = await fetchCategoryMembers(categoryTitle, args.limit);
  if (!fileTitles.length) {
    throw new Error(`No image files found in ${categoryTitle}.`);
  }

  const importedImages = await fetchImageDetails(fileTitles, args.thumbWidth);
  if (!importedImages.length) {
    throw new Error(`Commons returned file titles for ${categoryTitle}, but no usable image URLs were found.`);
  }

  if (args.download && !args.dryRun) {
    await maybeCacheImages(importedImages, workTitle);
  }

  const existingByPage = new Map(
    (Array.isArray(existingEntry.images) ? existingEntry.images : [])
      .map((image) => [String(image?.page || "").trim(), image]),
  );

  const nextEntry = {
    category: canonicalUrl,
    notes: String(existingEntry.notes || `Imported from Wikimedia Commons category ${categoryTitle}. Review and tag the images before broad site use.`).trim(),
    tags: cleanTagList(existingEntry.tags),
    images: importedImages.map((image) => mergeImage(existingByPage.get(image.pageUrl), image)),
  };

  parsed.works[workTitle] = nextEntry;
  parsed.works = sortObjectKeys(parsed.works);

  console.log(`Imported ${nextEntry.images.length} Commons images for ${workTitle}.`);
  console.log(`Category: ${canonicalUrl}`);
  if (args.download && !args.dryRun) console.log("Local media cache refreshed under data/media/gallery/.");

  if (args.dryRun) return;

  fs.writeFileSync(resolved, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(`Updated ${resolved}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
