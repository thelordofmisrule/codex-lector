const https = require("https");

const SITE_URL = process.env.SITE_URL || process.env.BASE_URL || "";
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "";

function submitIndexNow(paths) {
  if (!INDEXNOW_KEY || !SITE_URL) return;
  const urlList = (paths || [])
    .filter(Boolean)
    .map((p) => `${SITE_URL.replace(/\/$/, "")}${p.startsWith("/") ? p : `/${p}`}`);

  if (!urlList.length) return;

  const body = JSON.stringify({
    host: new URL(SITE_URL).hostname,
    key: INDEXNOW_KEY,
    urlList,
  });

  const req = https.request("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
    },
  }, (res) => {
    if (res.statusCode && res.statusCode >= 400) {
      console.warn(`IndexNow submit returned ${res.statusCode}`);
    }
    res.resume();
  });

  req.on("error", (err) => {
    console.warn(`IndexNow submit failed: ${err.message}`);
  });

  req.write(body);
  req.end();
}

module.exports = { submitIndexNow, INDEXNOW_KEY };
