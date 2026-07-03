// Load environment variables before anything else
try { require("dotenv").config(); } catch {}
require("./logger").initLogger();

const express = require("express");
const compression = require("compression");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const { optionalAuth } = require("./auth");
const { passport } = require("./passport");
const db = require("./db");
const { initBackupScheduler } = require("./backupScheduler");
const { INDEXNOW_KEY } = require("./indexNow");
const { ensureSourceTextSchema } = require("./lib/sourceTexts");
const { ensureReaderIllustrationSchema } = require("./lib/readerIllustrations");

const app = express();
const PORT = process.env.PORT || 3001;
const SITE_URL = process.env.SITE_URL || process.env.BASE_URL || "http://localhost:3001";
const SITE_NAME = "Codex Lector";
const SITE_DESC = "Annotated Shakespeare — read, discuss, and explore the works with scholarly annotations.";
const GOOGLE_VERIFICATION = (process.env.GOOGLE_SITE_VERIFICATION || "").replace(/^google-site-verification=/, "");
const BING_VERIFICATION = (process.env.BING_SITE_VERIFICATION || "").replace(/^msvalidate\.01=/, "");
const STATIC_SOCIAL_IMAGE = process.env.SOCIAL_IMAGE_URL || process.env.OG_IMAGE_URL || "";
const DEFAULT_SOCIAL_IMAGE = "/social-card.png";
ensureSourceTextSchema(db);
ensureReaderIllustrationSchema(db);

if (process.env.NODE_ENV === "production") {
  // Required so secure session cookies survive TLS termination at the reverse proxy.
  app.set("trust proxy", 1);
}

/* ── Middleware ── */
app.use(compression());
// Only the image-upload routes accept base64 payloads; everything else is small JSON.
app.use(["/api/gallery", "/api/blog", "/api/places"], express.json({ limit: "50mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(cors({
  origin: process.env.NODE_ENV==="production" ? false : ["http://localhost:5173","http://127.0.0.1:5173"],
  credentials: true,
}));

app.use(session({
  secret: process.env.JWT_SECRET || "codex-lector-session-secret",
  proxy: process.env.NODE_ENV === "production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 600000,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(optionalAuth);

/* ── API Routes ── */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/works", require("./routes/works"));
app.use("/api/annotations", require("./routes/annotations"));
app.use("/api/annotation-detail", require("./routes/annotationDetail"));
app.use("/api/discussions", require("./routes/discussions"));
app.use("/api/forum", require("./routes/forum"));
app.use("/api/blog", require("./routes/blog"));
app.use("/api/bookmarks", require("./routes/bookmarks"));
app.use("/api/research-tray", require("./routes/researchTray"));
app.use("/api/layers", require("./routes/layers"));
app.use("/api/progress", require("./routes/progress"));
app.use("/api/words", require("./routes/words"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/places", require("./routes/places"));
app.use("/api/prosody", require("./routes/prosody"));
app.use("/api/glossary", require("./routes/glossary"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/gallery", require("./routes/gallery"));
app.use("/api/quote-images", require("./routes/quoteImages"));
app.use("/api/source-texts", require("./routes/sourceTexts"));
app.use("/api/reader-illustrations", require("./routes/readerIllustrations"));
app.use("/api/concordance", require("./routes/concordance"));
app.get("/api/health", (req,res) => res.json({ status:"ok" }));
app.use("/media", express.static(path.join(__dirname, "..", "data", "media"), {
  etag: true,
  maxAge: "1d",
}));

/* ── RSS Feed ── */
function esc(str) { return (str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function xmlDate(value) {
  if (!value) return "";
  const normalized = String(value).includes("T")
    ? String(value)
    : String(value).replace(" ", "T") + "Z";
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}
function verificationMeta() {
  return `
    ${GOOGLE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(GOOGLE_VERIFICATION)}" />` : ""}
    ${BING_VERIFICATION ? `<meta name="msvalidate.01" content="${esc(BING_VERIFICATION)}" />` : ""}
  `;
}
function socialCardUrl(title = SITE_NAME, subtitle = SITE_DESC) {
  const params = new URLSearchParams();
  if (title) params.set("title", String(title).slice(0, 90));
  if (subtitle) params.set("subtitle", String(subtitle).slice(0, 180));
  return `${SITE_URL}/social-card.svg?${params.toString()}`;
}
function absoluteSocialImage(raw) {
  if (!raw) return "";
  return raw.startsWith("http") ? raw : `${SITE_URL}${raw}`;
}
function isSvgImage(raw) {
  return /\.svg(?:[?#].*)?$/i.test(String(raw || "").trim());
}
function socialImageUrl(preferred = "", title = SITE_NAME, subtitle = SITE_DESC) {
  const configured = preferred || STATIC_SOCIAL_IMAGE;
  const safeConfigured = configured && !isSvgImage(configured) ? configured : "";
  return absoluteSocialImage(safeConfigured || DEFAULT_SOCIAL_IMAGE) || socialCardUrl(title, subtitle);
}
function socialImageMeta(imageUrl, alt = SITE_NAME) {
  return `
    <meta property="og:image" content="${esc(imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(alt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${esc(imageUrl)}" />
    <meta name="twitter:image:alt" content="${esc(alt)}" />
  `;
}
function defaultMeta(url = SITE_URL) {
  const imageUrl = socialImageUrl("", SITE_NAME, SITE_DESC);
  return `
    <meta name="description" content="${esc(SITE_DESC)}" />
    <link rel="canonical" href="${esc(url)}" />
    ${verificationMeta()}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${SITE_NAME}" />
    <meta property="og:description" content="${esc(SITE_DESC)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    ${socialImageMeta(imageUrl, `${SITE_NAME} share card`)}
    <meta name="twitter:title" content="${SITE_NAME}" />
    <meta name="twitter:description" content="${esc(SITE_DESC)}" />
    <title>${SITE_NAME} — Shakespeare Annotated</title>
  `;
}

app.get("/rss.xml", (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.display_name FROM blog_posts p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC LIMIT 20
  `).all();

  const items = posts.map(p => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE_URL}/blog/${p.id}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.id}</guid>
      <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
      <dc:creator>${esc(p.display_name)}</dc:creator>
      <description>${esc(p.body.slice(0, 500))}${p.body.length > 500 ? "…" : ""}</description>
    </item>`).join("");

  res.type("application/rss+xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME}</title>
    <link>${SITE_URL}</link>
    <description>${esc(SITE_DESC)}</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`);
});

/* ── robots.txt ── */
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *
Allow: /
Sitemap: ${SITE_URL}/sitemap.xml
`);
});

/* ── Sitemap ── */
app.get("/sitemap.xml", (req, res) => {
  const works = db.prepare("SELECT slug FROM works").all();
  const posts = db.prepare("SELECT id,created_at FROM blog_posts ORDER BY created_at DESC").all();
  const threads = db.prepare("SELECT id FROM forum_threads ORDER BY created_at DESC LIMIT 100").all();
  const layers = db.prepare("SELECT id,created_at FROM annotation_layers WHERE is_public=1 ORDER BY created_at DESC").all();
  const annots = db.prepare("SELECT id,created_at FROM annotations WHERE is_global=1 ORDER BY created_at DESC LIMIT 500").all();
  const sourceTexts = db.prepare("SELECT slug, updated_at FROM source_texts ORDER BY updated_at DESC").all();

  const urls = [
    `<url><loc>${SITE_URL}/</loc><priority>1.0</priority></url>`,
    `<url><loc>${SITE_URL}/how-to</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/forum</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/blog</loc><priority>0.8</priority></url>`,
    `<url><loc>${SITE_URL}/layers</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/chat</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/genealogy</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/people</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/places</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/gallery</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/bookshelf</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/sources/lucrece</loc><priority>0.6</priority></url>`,
    ...sourceTexts.map((item) => `<url><loc>${SITE_URL}/source-texts/${item.slug}</loc>${xmlDate(item.updated_at) ? `<lastmod>${xmlDate(item.updated_at)}</lastmod>` : ""}<priority>0.5</priority></url>`),
    ...works.map(w => `<url><loc>${SITE_URL}/read/${w.slug}</loc><priority>0.9</priority></url>`),
    ...posts.map(p => `<url><loc>${SITE_URL}/blog/${p.id}</loc>${xmlDate(p.created_at) ? `<lastmod>${xmlDate(p.created_at)}</lastmod>` : ""}<priority>0.6</priority></url>`),
    ...threads.map(t => `<url><loc>${SITE_URL}/forum/${t.id}</loc><priority>0.5</priority></url>`),
    ...layers.map(l => `<url><loc>${SITE_URL}/layers/${l.id}</loc>${xmlDate(l.created_at) ? `<lastmod>${xmlDate(l.created_at)}</lastmod>` : ""}<priority>0.5</priority></url>`),
    ...annots.map(a => `<url><loc>${SITE_URL}/annotation/${a.id}</loc>${xmlDate(a.created_at) ? `<lastmod>${xmlDate(a.created_at)}</lastmod>` : ""}<priority>0.4</priority></url>`),
  ];

  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`);
});

app.get("/social-card.svg", (req, res) => {
  const title = String(req.query.title || SITE_NAME).slice(0, 90);
  const subtitle = String(req.query.subtitle || SITE_DESC).slice(0, 180);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("image/svg+xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f4eddd" />
      <stop offset="100%" stop-color="#e6d9b7" />
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7A1E2E" />
      <stop offset="100%" stop-color="#C9A84C" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="46" y="46" width="1108" height="538" rx="26" fill="rgba(255,248,240,0.72)" stroke="#c5b28a" stroke-width="2" />
  <rect x="86" y="88" width="12" height="454" rx="6" fill="url(#accent)" />
  <text x="130" y="156" font-family="Georgia, serif" font-size="30" letter-spacing="6" fill="#8a6e32">CODEX LECTOR</text>
  <text x="130" y="276" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#7A1E2E">${esc(title)}</text>
  <text x="130" y="352" font-family="Georgia, serif" font-size="28" fill="#4e433a">${esc(subtitle)}</text>
  <text x="130" y="500" font-family="Georgia, serif" font-size="26" fill="#6b5b4b">Read Shakespeare with line-by-line annotation, discussion, and shared layers.</text>
  <text x="1010" y="548" text-anchor="end" font-family="Georgia, serif" font-size="26" fill="#8a6e32">codexlector.com</text>
</svg>`);
});

/* ── Production static serving with OG meta injection ── */
if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "client", "dist");
  const indexHtml = fs.readFileSync(path.join(dist, "index.html"), "utf-8");
  const renderHtml = (meta = "") => indexHtml.replace("</head>", `${meta}\n</head>`);
  app.use(express.static(dist, {
    index:false,
    etag:true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        return;
      }
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }));

  if (INDEXNOW_KEY) {
    app.get(`/${INDEXNOW_KEY}.txt`, (req, res) => {
      res.type("text/plain").send(INDEXNOW_KEY);
    });
  }

  /* One renderer for every social/OG meta page; pages are declared as data.
     Dynamic resolvers return { title, desc, ... } or null for the default meta. */
  function sendMetaPage(res, url, page) {
    const { title, desc, ogType = "website", author = "", image = "" } = page;
    const fullTitle = `${title} — ${SITE_NAME}`;
    const imageUrl = socialImageUrl(image, title, desc);
    const meta = `
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${esc(url)}" />
    ${verificationMeta()}
    <meta property="og:type" content="${esc(ogType)}" />
    <meta property="og:title" content="${esc(fullTitle)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    ${socialImageMeta(imageUrl, `${title} on ${SITE_NAME}`)}
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    ${author ? `<meta name="author" content="${esc(author)}" />` : ""}
    <title>${esc(fullTitle)}</title>`;
    res.send(renderHtml(meta));
  }

  function stripMarkdown(text, length) {
    return String(text || "").replace(/[#*_`\[\]]/g, "").slice(0, length);
  }

  const STATIC_META_PAGES = {
    "/places": { title: "Places in the Works", desc: "Explore a curated geography of real places mentioned across Shakespeare's works, with line-level citations." },
    "/people": { title: "People in the Plays", desc: "Trace characters, scene-by-scene presence, and dialogue exchanges across Shakespeare's plays." },
    "/words": { title: "Word Explorer", desc: "A full concordance of Shakespeare's works: trace any word by play, speaker, and line, with collocates and word forms." },
    "/genealogy": { title: "Genealogy of the English Kings", desc: "Follow the dynastic relationships behind Shakespeare's English histories, from King John to Henry VIII." },
    "/chat": { title: "Live Chat", desc: "Join live conversation in the lobby, the Year of Shakespeare room, or work-specific reading rooms." },
    "/gallery": { title: "Shakespeare Art Gallery", desc: "Browse open-source Shakespeare artwork organized by work, with reusable tags for gallery, quote cards, and future sitewide image features." },
    "/bookshelf": { title: "Shakespeare's Bookshelf", desc: "Browse the books, chronicles, poems, and source texts Shakespeare likely read or adapted, organized by the work they influenced." },
    "/sources/lucrece": { title: "Sources of Lucrece", desc: "Primary and later source texts for Shakespeare's The Rape of Lucrece, including Ovid, Livy, Chaucer, and Painter.", ogType: "article" },
  };

  const DYNAMIC_META_PAGES = [
    {
      path: "/blog/:id",
      resolve(req) {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return null;
        const post = db.prepare("SELECT p.title,p.body,p.header_image,u.display_name FROM blog_posts p JOIN users u ON p.user_id=u.id WHERE p.id=?").get(id);
        if (!post) return null;
        return {
          title: post.title,
          desc: stripMarkdown(post.body, 200),
          author: post.display_name,
          image: post.header_image || "",
          ogType: "article",
        };
      },
    },
    {
      path: "/read/:slug",
      resolve(req) {
        const work = db.prepare("SELECT title,authors FROM works WHERE slug=?").get(req.params.slug);
        if (!work) return null;
        return {
          title: work.title,
          desc: `Read ${work.title} by ${work.authors || "William Shakespeare"} with scholarly annotations.`,
          ogType: "book",
        };
      },
    },
    {
      path: "/forum/:id",
      resolve(req) {
        const thread = db.prepare("SELECT t.title,t.body,u.display_name FROM forum_threads t JOIN users u ON u.id=t.user_id WHERE t.id=?").get(req.params.id);
        if (!thread) return null;
        return {
          title: thread.title,
          desc: stripMarkdown(thread.body, 200),
          author: thread.display_name,
          ogType: "article",
        };
      },
    },
    {
      path: "/annotation/:id",
      resolve(req) {
        const ann = db.prepare(`
          SELECT a.note,a.selected_text,w.title AS work_title,u.display_name
          FROM annotations a
          JOIN works w ON w.id=a.work_id
          JOIN users u ON u.id=a.user_id
          WHERE a.id=?
        `).get(req.params.id);
        if (!ann) return null;
        const head = ann.selected_text ? `${ann.selected_text} — ${ann.work_title}` : `Annotation on ${ann.work_title}`;
        return {
          title: head.slice(0, 120),
          desc: stripMarkdown(ann.note, 200),
          author: ann.display_name,
          ogType: "article",
        };
      },
    },
    {
      path: "/layers/:id",
      resolve(req) {
        const layer = db.prepare(`
          SELECT l.name,l.description,l.is_public,u.display_name
          FROM annotation_layers l
          JOIN users u ON u.id=l.user_id
          WHERE l.id=?
        `).get(req.params.id);
        if (!layer || !layer.is_public) return null;
        return {
          title: layer.name,
          desc: (layer.description || `Annotation layer by ${layer.display_name}`).slice(0, 200),
          author: layer.display_name,
          ogType: "article",
        };
      },
    },
    {
      path: "/profile/:username",
      resolve(req) {
        const profile = db.prepare("SELECT display_name,bio FROM users WHERE username=?").get(String(req.params.username || "").toLowerCase());
        if (!profile) return null;
        return {
          title: `${profile.display_name} Profile`,
          desc: (profile.bio || `${profile.display_name} on ${SITE_NAME}`).slice(0, 200),
          ogType: "profile",
        };
      },
    },
    {
      path: "/source-texts/:identifier",
      resolve(req) {
        const raw = String(req.params.identifier || "").trim();
        const entry = db.prepare(`
          SELECT title, author, slug
          FROM source_texts
          WHERE slug=? COLLATE NOCASE OR tcp_id=? COLLATE NOCASE
          LIMIT 1
        `).get(raw.toLowerCase(), raw.toUpperCase());
        if (!entry) return null;
        return {
          title: entry.title,
          desc: `${entry.title} on Codex Lector's Bookshelf, available as an EEBO-TCP source text.${entry.author ? ` ${entry.author}.` : ""}`,
          author: entry.author || "EEBO-TCP source text",
          ogType: "article",
        };
      },
    },
  ];

  Object.entries(STATIC_META_PAGES).forEach(([routePath, page]) => {
    app.get(routePath, (req, res) => sendMetaPage(res, `${SITE_URL}${routePath}`, page));
  });

  DYNAMIC_META_PAGES.forEach(({ path: routePath, resolve }) => {
    app.get(routePath, (req, res) => {
      const url = `${SITE_URL}${req.path}`;
      let page = null;
      try {
        page = resolve(req);
      } catch (err) {
        console.error(`Meta resolve failed for ${routePath}:`, err);
      }
      if (!page) return res.send(renderHtml(defaultMeta(url)));
      sendMetaPage(res, url, page);
    });
  });

  // All other routes — serve SPA
  app.get("*", (req, res) => res.send(renderHtml(defaultMeta(`${SITE_URL}${req.path}`))));
}

app.use((err,req,res,next) => { console.error(err); res.status(500).json({ error:"Server error." }); });

console.log("\n  Codex Lector");
console.log("  ────────────");
initBackupScheduler();
app.listen(PORT, () => console.log(`  → http://localhost:${PORT}\n`));
