const QUOTE_CARD_WIDTH = 1600;
const QUOTE_CARD_HEIGHT = 900;

export const QUOTE_CAPTURE_THEMES = [
  {
    id: "classical",
    label: "Classical",
    background: "#f2e7d1",
    panel: "#fbf6ea",
    border: "#d6c2a7",
    accent: "#7a1e2e",
    accentSoft: "#efe0d4",
    text: "#2b231e",
    muted: "#6f5f53",
    quoteMark: "#c6ae8e",
    titleFont: "Arial, sans-serif",
    quoteFont: "Georgia, 'Times New Roman', serif",
    metaFont: "Arial, sans-serif",
  },
  {
    id: "midnight",
    label: "Midnight",
    background: "#121826",
    panel: "#1b2233",
    border: "#36415b",
    accent: "#d4b06a",
    accentSoft: "#273148",
    text: "#f4ead7",
    muted: "#b8af9f",
    quoteMark: "#5e6b85",
    titleFont: "Arial, sans-serif",
    quoteFont: "Georgia, 'Times New Roman', serif",
    metaFont: "Arial, sans-serif",
  },
  {
    id: "signal",
    label: "Signal",
    background: "#131814",
    panel: "#1c241c",
    border: "#3f5134",
    accent: "#c4dc46",
    accentSoft: "#26301f",
    text: "#eef5d2",
    muted: "#a6b28a",
    quoteMark: "#435535",
    titleFont: "Arial, sans-serif",
    quoteFont: "'Trebuchet MS', Arial, sans-serif",
    metaFont: "'Courier New', monospace",
  },
];

function getTheme(themeId) {
  return QUOTE_CAPTURE_THEMES.find((theme) => theme.id === themeId) || QUOTE_CAPTURE_THEMES[0];
}

function clampOpacity(value, fallback = 0.36) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(0.85, Math.max(0, n));
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function normalizeQuoteText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, lines) => line || (lines[index - 1] && lines[index + 1]))
    .join("\n")
    .trim();
}

function wrapParagraph(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function wrapQuoteLines(text, maxChars) {
  const paragraphs = normalizeQuoteText(text).split("\n");
  const lines = [];
  paragraphs.forEach((paragraph, index) => {
    if (!paragraph) return;
    lines.push(...wrapParagraph(paragraph, maxChars));
    if (index < paragraphs.length - 1) lines.push("");
  });
  return lines;
}

function resolveQuoteSizing(text) {
  const length = normalizeQuoteText(text).length;
  if (length <= 120) return { fontSize: 68, lineHeight: 84, maxChars: 34 };
  if (length <= 220) return { fontSize: 58, lineHeight: 72, maxChars: 40 };
  if (length <= 320) return { fontSize: 48, lineHeight: 62, maxChars: 48 };
  return { fontSize: 40, lineHeight: 54, maxChars: 56 };
}

export function quoteCapturePlainText({ text, title, citation, author = "William Shakespeare" }) {
  const clean = normalizeQuoteText(text);
  const parts = [`"${clean}"`, author];
  if (title) parts.push(title);
  if (citation) parts.push(citation);
  return `${parts.shift()} - ${parts.join(", ")}`;
}

export function getQuoteCapturePreviewStyle(themeId) {
  const theme = getTheme(themeId);
  return {
    background: `linear-gradient(145deg, ${theme.panel}, ${theme.background})`,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    accent: theme.accent,
    muted: theme.muted,
    quoteMark: theme.quoteMark,
    quoteFont: theme.quoteFont,
    titleFont: theme.titleFont,
    metaFont: theme.metaFont,
  };
}

export function buildQuoteCardSvg({
  text,
  title,
  citation,
  author = "William Shakespeare",
  themeId = "classical",
  siteLabel = "Codex Lector",
  backgroundImageHref = "",
  backgroundImageUrl = "",
  backgroundOpacity = 0.36,
}) {
  const theme = getTheme(themeId);
  const resolvedBackgroundHref = String(backgroundImageHref || backgroundImageUrl || "").trim();
  const resolvedBackgroundOpacity = clampOpacity(backgroundOpacity, 0.36);
  const sizing = resolveQuoteSizing(text);
  const lines = wrapQuoteLines(text, sizing.maxChars);
  const quoteStartY = 270;
  const quoteEndY = 640;
  const lineCount = Math.max(lines.filter(Boolean).length, 1);
  const availableHeight = quoteEndY - quoteStartY;
  const fittedLineHeight = Math.min(sizing.lineHeight, Math.floor(availableHeight / lineCount));
  const fontSize = Math.max(34, Math.min(sizing.fontSize, fittedLineHeight - 8));
  const lineHeight = Math.max(fontSize + 10, fittedLineHeight);

  let currentY = quoteStartY;
  const quoteLines = lines.map((line) => {
    if (!line) {
      currentY += Math.round(lineHeight * 0.5);
      return "";
    }
    const node = `<text x="210" y="${currentY}" font-family="${escapeXml(theme.quoteFont)}" font-size="${fontSize}" fill="${theme.text}">${escapeXml(line)}</text>`;
    currentY += lineHeight;
    return node;
  }).filter(Boolean).join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${QUOTE_CARD_WIDTH}" height="${QUOTE_CARD_HEIGHT}" viewBox="0 0 ${QUOTE_CARD_WIDTH} ${QUOTE_CARD_HEIGHT}">
  <rect width="${QUOTE_CARD_WIDTH}" height="${QUOTE_CARD_HEIGHT}" fill="${theme.background}" />
  ${resolvedBackgroundHref ? `<image x="52" y="52" width="1496" height="796" preserveAspectRatio="xMidYMid slice" href="${escapeXml(resolvedBackgroundHref)}" opacity="${resolvedBackgroundOpacity}" />` : ""}
  ${resolvedBackgroundHref ? `<rect x="52" y="52" width="1496" height="796" rx="36" fill="${theme.background}" opacity="0.1" />` : ""}
  <rect x="52" y="52" width="1496" height="796" rx="36" fill="${theme.panel}" fill-opacity="${resolvedBackgroundHref ? "0.7" : "1"}" stroke="${theme.border}" stroke-width="2" />
  <rect x="104" y="104" width="192" height="34" rx="17" fill="${theme.accentSoft}" />
  <text x="200" y="126" text-anchor="middle" font-family="${escapeXml(theme.metaFont)}" font-size="18" letter-spacing="3" fill="${theme.accent}">QUOTE CAPTURE</text>
  <text x="116" y="232" font-family="${escapeXml(theme.quoteFont)}" font-size="180" fill="${theme.quoteMark}" opacity="0.45">&#8220;</text>
  ${quoteLines}
  <line x1="210" x2="1390" y1="700" y2="700" stroke="${theme.border}" stroke-width="2" />
  <text x="210" y="758" font-family="${escapeXml(theme.titleFont)}" font-size="26" letter-spacing="2.4" fill="${theme.accent}">${escapeXml(title || author)}</text>
  <text x="210" y="798" font-family="${escapeXml(theme.metaFont)}" font-size="24" fill="${theme.muted}">${escapeXml([author, citation].filter(Boolean).join(" - "))}</text>
  <text x="1392" y="798" text-anchor="end" font-family="${escapeXml(theme.metaFont)}" font-size="22" letter-spacing="3" fill="${theme.muted}">${escapeXml(siteLabel)}</text>
</svg>`.trim();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image data."));
    reader.readAsDataURL(blob);
  });
}

async function embedBackgroundImage(payload) {
  const imageUrl = String(payload?.backgroundImageUrl || "").trim();
  if (!imageUrl) return payload;

  try {
    const response = await fetch(imageUrl, { mode: "cors" });
    if (!response.ok) return payload;
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    return {
      ...payload,
      backgroundImageHref: dataUrl,
    };
  } catch {
    return payload;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadQuoteCardSvg(payload, filename = "codex-lector-quote.svg") {
  const preparedPayload = await embedBackgroundImage(payload);
  const svg = buildQuoteCardSvg(preparedPayload);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

export async function downloadQuoteCardPng(payload, filename = "codex-lector-quote.png") {
  const preparedPayload = await embedBackgroundImage(payload);
  const svg = buildQuoteCardSvg(preparedPayload);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = QUOTE_CARD_WIDTH;
        canvas.height = QUOTE_CARD_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not create drawing context."));
          return;
        }
        context.drawImage(image, 0, 0, QUOTE_CARD_WIDTH, QUOTE_CARD_HEIGHT);
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error("Could not export PNG."));
            return;
          }
          downloadBlob(pngBlob, filename);
          resolve();
        }, "image/png");
      };
      image.onerror = () => reject(new Error("Could not render quote card."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
