function ensureSourceTextSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_texts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT DEFAULT '',
      tcp_id TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      date_label TEXT DEFAULT '',
      publication TEXT DEFAULT '',
      language TEXT DEFAULT '',
      xml TEXT NOT NULL,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_source_texts_source_id
      ON source_texts(source_id);
    CREATE INDEX IF NOT EXISTS idx_source_texts_title
      ON source_texts(title);
  `);
}

function decodeEntities(str) {
  return String(str || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function stripTags(xmlSnippet) {
  return decodeEntities(String(xmlSnippet || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function matchAllStrings(text, pattern) {
  return Array.from(String(text || "").matchAll(pattern))
    .map((match) => stripTags(match[1] || ""))
    .filter(Boolean);
}

function buildSourceTextSlug(tcpId) {
  return String(tcpId || "")
    .trim()
    .toLowerCase();
}

function extractSourceTextMetadata(xml, fallbackTcpId = "") {
  const fileDescMatch = String(xml || "").match(/<fileDesc>([\s\S]*?)<\/fileDesc>/i);
  const fileDesc = fileDescMatch ? fileDescMatch[1] : String(xml || "");
  const titleStmtMatch = fileDesc.match(/<titleStmt>([\s\S]*?)<\/titleStmt>/i);
  const titleStmt = titleStmtMatch ? titleStmtMatch[1] : fileDesc;
  const publicationMatches = Array.from(fileDesc.matchAll(/<publicationStmt>([\s\S]*?)<\/publicationStmt>/gi));
  const publicationStmt = publicationMatches.length
    ? publicationMatches[publicationMatches.length - 1][1]
    : fileDesc;
  const langMatch = String(xml || "").match(/<language[^>]*ident="([^"]+)"/i);
  const tcpMatch = String(xml || "").match(/<idno[^>]*type="DLPS"[^>]*>([^<]+)<\/idno>/i);
  const titles = matchAllStrings(titleStmt, /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/gi);
  const authors = [...new Set(matchAllStrings(titleStmt, /<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/gi))];
  const publisher = matchAllStrings(publicationStmt, /<publisher(?:\s[^>]*)?>([\s\S]*?)<\/publisher>/gi)[0] || "";
  const pubPlace = matchAllStrings(publicationStmt, /<pubPlace(?:\s[^>]*)?>([\s\S]*?)<\/pubPlace>/gi)[0] || "";
  const dateMatch = publicationStmt.match(/<date(?:\s[^>]*)?>([\s\S]*?)<\/date>/i);
  const dateWhenMatch = publicationStmt.match(/<date[^>]*when="([^"]+)"/i);
  const publicationBits = [publisher, pubPlace].filter(Boolean);
  return {
    tcpId: (stripTags(tcpMatch?.[1] || "") || String(fallbackTcpId || "").trim()).toUpperCase(),
    title: titles[0] || String(fallbackTcpId || "").trim(),
    author: authors.slice(0, 3).join("; "),
    dateLabel: stripTags(dateMatch?.[1] || "") || stripTags(dateWhenMatch?.[1] || ""),
    publication: publicationBits.join(" · "),
    language: stripTags(langMatch?.[1] || ""),
  };
}

module.exports = {
  buildSourceTextSlug,
  ensureSourceTextSchema,
  extractSourceTextMetadata,
};
