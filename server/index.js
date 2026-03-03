// Load environment variables before anything else
try { require("dotenv").config(); } catch {}

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const { optionalAuth } = require("./auth");
const { passport } = require("./passport");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;
const SITE_URL = process.env.SITE_URL || process.env.BASE_URL || "http://localhost:3001";
const SITE_NAME = "Codex Lector";
const SITE_DESC = "Annotated Shakespeare — read, discuss, and explore the works with scholarly annotations.";

/* ── Middleware ── */
app.use(express.json({ limit:"50mb" }));
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
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 600000 },
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
app.use("/api/layers", require("./routes/layers"));
app.use("/api/progress", require("./routes/progress"));
app.use("/api/words", require("./routes/words"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/analytics", require("./routes/analytics"));
app.get("/api/health", (req,res) => res.json({ status:"ok" }));
app.use("/media", express.static(path.join(__dirname, "..", "data", "media")));

/* ── RSS Feed ── */
function esc(str) { return (str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

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

  const urls = [
    `<url><loc>${SITE_URL}/</loc><priority>1.0</priority></url>`,
    `<url><loc>${SITE_URL}/forum</loc><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/blog</loc><priority>0.8</priority></url>`,
    ...works.map(w => `<url><loc>${SITE_URL}/read/${w.slug}</loc><priority>0.9</priority></url>`),
    ...posts.map(p => `<url><loc>${SITE_URL}/blog/${p.id}</loc><lastmod>${p.created_at}</lastmod><priority>0.6</priority></url>`),
    ...threads.map(t => `<url><loc>${SITE_URL}/forum/${t.id}</loc><priority>0.5</priority></url>`),
  ];

  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`);
});

/* ── Production static serving with OG meta injection ── */
if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "client", "dist");
  const indexHtml = fs.readFileSync(path.join(dist, "index.html"), "utf-8");
  app.use(express.static(dist));

  // Inject OG meta tags for blog posts (for Twitter/social embeds)
  app.get("/blog/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.send(indexHtml);
    const post = db.prepare("SELECT p.title,p.body,p.header_image,u.display_name FROM blog_posts p JOIN users u ON p.user_id=u.id WHERE p.id=?").get(id);
    if (!post) return res.send(indexHtml);

    const title = esc(post.title);
    const desc = esc(post.body.replace(/[#*_`\[\]]/g,"").slice(0,200));
    const author = esc(post.display_name);
    const url = `${SITE_URL}/blog/${id}`;
    const imageUrl = post.header_image
      ? (post.header_image.startsWith("http") ? post.header_image : `${SITE_URL}${post.header_image}`)
      : "";

    const meta = `
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    ${imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}" />` : ""}
    <meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />
    ${imageUrl ? `<meta name="twitter:image" content="${esc(imageUrl)}" />` : ""}
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="author" content="${author}" />
    <title>${title} — ${SITE_NAME}</title>`;

    res.send(indexHtml.replace("</head>", `${meta}\n</head>`));
  });

  // OG meta for works
  app.get("/read/:slug", (req, res) => {
    const work = db.prepare("SELECT title,authors FROM works WHERE slug=?").get(req.params.slug);
    if (!work) return res.send(indexHtml);
    const title = esc(work.title);
    const author = esc(work.authors || "William Shakespeare");

    const meta = `
    <meta property="og:type" content="book" />
    <meta property="og:title" content="${title} — ${SITE_NAME}" />
    <meta property="og:description" content="Read ${title} by ${author} with scholarly annotations." />
    <meta property="og:url" content="${SITE_URL}/read/${req.params.slug}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="Read ${title} with annotations on ${SITE_NAME}" />
    <title>${title} — ${SITE_NAME}</title>`;

    res.send(indexHtml.replace("</head>", `${meta}\n</head>`));
  });

  // All other routes — serve SPA
  app.get("*", (req, res) => res.send(indexHtml));
}

app.use((err,req,res,next) => { console.error(err); res.status(500).json({ error:"Server error." }); });

console.log("\n  Codex Lector");
console.log("  ────────────");
app.listen(PORT, () => console.log(`  → http://localhost:${PORT}\n`));
