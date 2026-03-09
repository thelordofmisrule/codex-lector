function decodeEntities(text) {
  return String(text || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

function cleanInlineXml(text) {
  return decodeEntities(String(text || "").replace(/<[^>]+>/g, " "))
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(text) {
  return cleanInlineXml(text)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttrs(tagText) {
  const attrs = {};
  const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = attrRe.exec(tagText))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function parseLineNumber(attrs) {
  const raw = attrs?.gn || attrs?.n;
  if (!raw) return null;
  const value = parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function normalizeSpeakerKey(text) {
  return cleanInlineXml(text).toUpperCase().replace(/\.$/, "").trim();
}

function buildSpeakerMap(xml) {
  const map = {};
  const roleRe = /<(role|persname)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = roleRe.exec(String(xml || "")))) {
    const attrs = parseAttrs(match[2] || "");
    const short = attrs.short ? normalizeSpeakerKey(attrs.short) : "";
    const long = cleanInlineXml(match[3]);
    if (short && long && !map[short]) map[short] = long;
  }
  return map;
}

function resolveSpeaker(attrs, text, speakerMap) {
  const explicitLong = cleanInlineXml(attrs?.long || "");
  if (explicitLong) return explicitLong;
  const shortText = cleanInlineXml(attrs?.short || text || "");
  if (!shortText) return "";
  const mapped = speakerMap[normalizeSpeakerKey(shortText)];
  return mapped || shortText;
}

function popCapture(captures, kind) {
  for (let i = captures.length - 1; i >= 0; i -= 1) {
    if (captures[i].kind === kind) return captures.splice(i, 1)[0];
  }
  return null;
}

function hasOpenTag(stack, tagName) {
  return stack.includes(tagName);
}

function makeLocationLabel(row) {
  if (row.sectionLabel) return row.sectionLabel;
  if (row.actLabel && row.sceneLabel) return `${row.actLabel}, ${row.sceneLabel}`;
  return row.actLabel || row.sceneLabel || "";
}

function extractSearchLines(xml) {
  const source = String(xml || "");
  if (!source.trim()) return [];

  const isPoetry = /<poem\b/i.test(source);
  const speakerMap = buildSpeakerMap(source);
  const tokenRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g;
  const stack = [];
  const captures = [];
  const rows = [];

  let visibleLineNumber = 0;
  let displayLineNumber = 0;
  let actLabel = "";
  let sceneLabel = "";
  let sectionLabel = "";
  let currentSpeaker = "";
  let actCounter = 0;
  let sceneCounter = 0;
  let stanzaCounter = 0;
  let sonnetCounter = 0;

  const tokens = source.match(tokenRe) || [];

  for (const token of tokens) {
    if (!token) continue;

    if (token.startsWith("<!--")) continue;

    if (token.startsWith("<![CDATA[")) {
      const cdataText = token.slice(9, -3);
      const activeCapture = captures[captures.length - 1];
      if (activeCapture) activeCapture.text += cdataText;
      continue;
    }

    if (token.startsWith("<")) {
      const isClosing = /^<\//.test(token);
      const selfClosing = /\/>$/.test(token);
      const nameMatch = token.match(/^<\/?\s*([A-Za-z_][\w:.-]*)/);
      if (!nameMatch) continue;
      const tagName = nameMatch[1].toLowerCase();

      if (isClosing) {
        if (tagName === "speaker") {
          const capture = popCapture(captures, "speaker");
          if (capture) currentSpeaker = resolveSpeaker(capture.attrs, capture.text, speakerMap);
        } else if (tagName === "acttitle") {
          const capture = popCapture(captures, "acttitle");
          if (capture?.text?.trim()) actLabel = cleanInlineXml(capture.text);
        } else if (tagName === "scenetitle") {
          const capture = popCapture(captures, "scenetitle");
          if (capture?.text?.trim()) sceneLabel = cleanInlineXml(capture.text);
        } else if (tagName === "stanzanum") {
          const capture = popCapture(captures, "stanzanum");
          if (capture?.text?.trim() && !hasOpenTag(stack, "sonnet")) {
            sectionLabel = `Stanza ${cleanInlineXml(capture.text)}`;
          }
        } else if (tagName === "l" || tagName === "line") {
          const capture = popCapture(captures, "line");
          const lineText = cleanInlineXml(capture?.text || "");
          if (lineText) {
            visibleLineNumber += 1;
            const xmlLineNumber = parseLineNumber(capture?.attrs);
            displayLineNumber = Number.isFinite(xmlLineNumber) ? xmlLineNumber : (displayLineNumber + 1);
            rows.push({
              lineNumber: visibleLineNumber,
              displayLineNumber,
              lineText,
              normalizedText: normalizeSearchText(lineText),
              speaker: cleanInlineXml(currentSpeaker),
              actLabel: cleanInlineXml(actLabel),
              sceneLabel: cleanInlineXml(sceneLabel),
              sectionLabel: cleanInlineXml(sectionLabel),
            });
          }
        } else if (tagName === "sp" || tagName === "speech" || tagName === "song") {
          currentSpeaker = "";
        } else if (tagName === "scene" || tagName === "sceneref" || tagName === "prologue" || tagName === "epilogue") {
          currentSpeaker = "";
        } else if ((tagName === "stanza" || tagName === "stanzasmall") && !hasOpenTag(stack, "sonnet")) {
          sectionLabel = "";
        } else if (tagName === "sonnet") {
          sectionLabel = "";
        }

        for (let i = stack.length - 1; i >= 0; i -= 1) {
          if (stack[i] === tagName) {
            stack.splice(i, 1);
            break;
          }
        }
        continue;
      }

      const attrs = parseAttrs(token);
      stack.push(tagName);

      if (tagName === "act" || tagName === "actref") {
        actCounter += 1;
        sceneCounter = 0;
        actLabel = attrs.num ? `Act ${attrs.num}` : `Act ${actCounter}`;
      } else if (tagName === "scene" || tagName === "sceneref") {
        sceneCounter += 1;
        sceneLabel = attrs.num ? `Scene ${attrs.num}` : `Scene ${sceneCounter}`;
      } else if (tagName === "prologue") {
        sceneLabel = "Prologue";
      } else if (tagName === "epilogue") {
        sceneLabel = "Epilogue";
      } else if (tagName === "sonnet") {
        sonnetCounter += 1;
        stanzaCounter = 0;
        sectionLabel = `Sonnet ${attrs.num || sonnetCounter}`;
      } else if ((tagName === "stanza" || tagName === "stanzasmall") && isPoetry && !hasOpenTag(stack.slice(0, -1), "sonnet")) {
        stanzaCounter += 1;
        sectionLabel = attrs.num ? `Stanza ${attrs.num}` : `Stanza ${stanzaCounter}`;
      } else if (tagName === "speaker") {
        if (selfClosing) currentSpeaker = resolveSpeaker(attrs, "", speakerMap);
        else captures.push({ kind: "speaker", attrs, text: "" });
      } else if (tagName === "acttitle") {
        captures.push({ kind: "acttitle", attrs, text: "" });
      } else if (tagName === "scenetitle") {
        captures.push({ kind: "scenetitle", attrs, text: "" });
      } else if (tagName === "stanzanum") {
        captures.push({ kind: "stanzanum", attrs, text: "" });
      } else if (tagName === "l" || tagName === "line") {
        captures.push({ kind: "line", attrs, text: "" });
      }

      if (selfClosing) {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          if (stack[i] === tagName) {
            stack.splice(i, 1);
            break;
          }
        }
      }
      continue;
    }

    const activeCapture = captures[captures.length - 1];
    if (activeCapture) activeCapture.text += token;
  }

  return rows.map((row, index, allRows) => ({
    ...row,
    prevText: index > 0 ? allRows[index - 1].lineText : "",
    nextText: index < allRows.length - 1 ? allRows[index + 1].lineText : "",
    locationLabel: makeLocationLabel(row),
  }));
}

function parseSearchQuery(query, options = {}) {
  const raw = String(query || "").trim();
  const normalized = normalizeSearchText(raw);
  const quoteMatches = Array.from(raw.matchAll(/"([^"]+)"/g))
    .map((match) => normalizeSearchText(match[1]))
    .filter(Boolean);
  const tokenSource = raw.replace(/"([^"]+)"/g, " ");
  const tokens = normalizeSearchText(tokenSource).split(" ").filter(Boolean);
  const phrases = new Set(quoteMatches);

  if (options.exact && normalized) phrases.add(normalized);
  if (!phrases.size && normalized && normalized.includes(" ")) phrases.add(normalized);

  return {
    raw,
    normalized,
    tokens: Array.from(new Set(tokens)),
    phrases: Array.from(phrases),
    exact: !!options.exact,
  };
}

function escapeFtsToken(token) {
  return String(token || "").replace(/"/g, '""');
}

function buildFtsQuery(parsed) {
  if (!parsed?.normalized) return "";
  if (parsed.exact) return `"${escapeFtsToken(parsed.normalized)}"`;

  const clauses = [];
  for (const phrase of parsed.phrases || []) {
    clauses.push(`"${escapeFtsToken(phrase)}"`);
  }
  if (parsed.tokens?.length) {
    clauses.push(parsed.tokens.map((token) => `${escapeFtsToken(token)}*`).join(" AND "));
  }
  if (!clauses.length) clauses.push(`"${escapeFtsToken(parsed.normalized)}"`);
  if (clauses.length === 1) return clauses[0];
  return `(${clauses.join(" OR ")})`;
}

function wordMatchesToken(word, token) {
  return word === token || word.startsWith(token);
}

function matchesParsedQuery(row, parsed) {
  const normalized = row?.normalizedText || normalizeSearchText(row?.lineText || "");
  if (!normalized) return false;
  if (parsed?.exact) return normalized.includes(parsed.normalized);
  const words = normalized.split(" ").filter(Boolean);
  if ((parsed?.phrases || []).some((phrase) => normalized.includes(phrase))) return true;
  if (!(parsed?.tokens || []).length) return normalized.includes(parsed.normalized);
  return parsed.tokens.every((token) => words.some((word) => wordMatchesToken(word, token)));
}

function computeSearchScore(row, parsed, rank = null) {
  const normalized = row?.normalizedText || normalizeSearchText(row?.lineText || "");
  const words = normalized.split(" ").filter(Boolean);
  const positions = [];
  let matchedTerms = 0;
  let score = 0;
  let exactPhrase = false;

  if (!normalized) return { score: 0, matchedTerms: 0, exactPhrase: false };

  if (parsed?.normalized && normalized.includes(parsed.normalized)) {
    exactPhrase = true;
    score += parsed.exact ? 1800 : 950;
  }

  for (const phrase of parsed?.phrases || []) {
    if (phrase && normalized.includes(phrase)) score += 520;
  }

  for (const token of parsed?.tokens || []) {
    const position = words.findIndex((word) => wordMatchesToken(word, token));
    if (position === -1) continue;
    matchedTerms += 1;
    positions.push(position);
    if (words[position] === token) score += 170;
    else score += 125;
  }

  if ((parsed?.tokens || []).length > 1 && positions.length === parsed.tokens.length) {
    const spread = Math.max(...positions) - Math.min(...positions);
    score += Math.max(30, 220 - (spread * 28));
  }

  if (row?.speaker && parsed?.tokens?.some((token) => normalizeSearchText(row.speaker).split(" ").some((word) => wordMatchesToken(word, token)))) {
    score += 20;
  }

  if (typeof rank === "number" && Number.isFinite(rank)) {
    score += Math.max(0, 240 - Math.min(240, Math.round(rank * 40)));
  }

  return { score, matchedTerms, exactPhrase };
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMatchIndex(lineText, parsed) {
  const raw = String(lineText || "");
  const lower = raw.toLowerCase();
  const phraseCandidates = [parsed?.raw, parsed?.normalized, ...(parsed?.phrases || [])].filter(Boolean);
  for (const phrase of phraseCandidates) {
    const idx = lower.indexOf(String(phrase).toLowerCase());
    if (idx !== -1) return idx;
  }
  for (const token of parsed?.tokens || []) {
    const re = new RegExp(`\\b${escapeRegex(token)}`, "i");
    const match = raw.match(re);
    if (match?.index != null) return match.index;
  }
  return -1;
}

function buildSearchSnippet(lineText, parsed, maxLength = 160) {
  const raw = cleanInlineXml(lineText);
  if (!raw || raw.length <= maxLength) return raw;
  const idx = findMatchIndex(raw, parsed);
  if (idx === -1) return `${raw.slice(0, maxLength - 1).trimEnd()}...`;
  const start = Math.max(0, idx - 54);
  const end = Math.min(raw.length, idx + maxLength - 54);
  let snippet = raw.slice(start, end).trim();
  if (start > 0) snippet = `...${snippet}`;
  if (end < raw.length) snippet = `${snippet}...`;
  return snippet;
}

module.exports = {
  buildFtsQuery,
  buildSearchSnippet,
  cleanInlineXml,
  computeSearchScore,
  decodeEntities,
  extractSearchLines,
  makeLocationLabel,
  matchesParsedQuery,
  normalizeSearchText,
  parseSearchQuery,
};
