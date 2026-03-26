const { extractSearchLines } = require("./workSearch");

const MAX_SCOPE_LINES = 24;
const MAX_SCOPE_CHARS = 1600;
const PASSAGE_WINDOW_LINES = 6;
const PASSAGE_STRIDE_LINES = 4;

function formatLineForChunk(row, previousSpeaker = "") {
  const speaker = String(row.speaker || "").trim();
  const text = String(row.lineText || "").trim();
  if (!text) return { text: "", nextSpeaker: previousSpeaker };
  if (speaker && speaker !== previousSpeaker) {
    return {
      text: `${speaker}: ${text}`,
      nextSpeaker: speaker,
    };
  }
  return {
    text,
    nextSpeaker: speaker || previousSpeaker,
  };
}

function buildChunkText(rows) {
  const parts = [];
  let previousSpeaker = "";
  rows.forEach((row) => {
    const formatted = formatLineForChunk(row, previousSpeaker);
    if (formatted.text) parts.push(formatted.text);
    previousSpeaker = formatted.nextSpeaker;
  });
  return parts.join("\n");
}

function scopeLabelForRow(row, workTitle) {
  return row.sectionLabel || row.locationLabel || workTitle || "Work";
}

function scopeKeyForRow(row, workSlug) {
  return [
    workSlug,
    row.sectionLabel || "",
    row.actLabel || "",
    row.sceneLabel || "",
    row.locationLabel || "",
  ].join("::");
}

function splitScopeSegments(rows, work) {
  const segments = [];
  let current = [];
  let currentChars = 0;
  let segmentIndex = 0;
  let activeKey = "";

  function flush() {
    if (!current.length) return;
    const first = current[0];
    const last = current[current.length - 1];
    segments.push({
      chunkType: "scope",
      scopeKey: `${activeKey}::${segmentIndex}`,
      label: scopeLabelForRow(first, work.title),
      locationLabel: first.locationLabel || "",
      speaker: "",
      lineStart: first.lineNumber,
      lineEnd: last.lineNumber,
      displayLineStart: first.displayLineNumber || first.lineNumber,
      displayLineEnd: last.displayLineNumber || last.lineNumber,
      rows: current,
      text: buildChunkText(current),
    });
    segmentIndex += 1;
    current = [];
    currentChars = 0;
  }

  rows.forEach((row) => {
    const key = scopeKeyForRow(row, work.slug);
    const projectedChars = currentChars + String(row.lineText || "").length + 1;
    const keyChanged = current.length > 0 && key !== activeKey;
    const tooLarge = current.length >= MAX_SCOPE_LINES || projectedChars > MAX_SCOPE_CHARS;

    if (keyChanged || tooLarge) flush();
    if (!current.length) activeKey = key;

    current.push(row);
    currentChars += String(row.lineText || "").length + 1;
  });

  flush();
  return segments;
}

function buildPassageChunks(scope, work) {
  const chunks = [];
  const rows = scope.rows || [];
  if (!rows.length) return chunks;

  if (rows.length <= PASSAGE_WINDOW_LINES) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    chunks.push({
      chunkType: "passage",
      scopeKey: scope.scopeKey,
      label: scope.label,
      locationLabel: scope.locationLabel || "",
      speaker: "",
      lineStart: first.lineNumber,
      lineEnd: last.lineNumber,
      displayLineStart: first.displayLineNumber || first.lineNumber,
      displayLineEnd: last.displayLineNumber || last.lineNumber,
      text: buildChunkText(rows),
    });
    return chunks;
  }

  for (let index = 0; index < rows.length; index += PASSAGE_STRIDE_LINES) {
    const window = rows.slice(index, index + PASSAGE_WINDOW_LINES);
    if (!window.length) continue;
    const first = window[0];
    const last = window[window.length - 1];
    chunks.push({
      chunkType: "passage",
      scopeKey: scope.scopeKey,
      label: scope.label,
      locationLabel: scope.locationLabel || "",
      speaker: "",
      lineStart: first.lineNumber,
      lineEnd: last.lineNumber,
      displayLineStart: first.displayLineNumber || first.lineNumber,
      displayLineEnd: last.displayLineNumber || last.lineNumber,
      text: buildChunkText(window),
    });
    if (index + PASSAGE_WINDOW_LINES >= rows.length) break;
  }

  return chunks;
}

function buildSemanticChunksForWork(work) {
  const rows = extractSearchLines(work.content || "");
  if (!rows.length) return [];

  const scopeSegments = splitScopeSegments(rows, work);
  const chunks = [];

  scopeSegments.forEach((scope) => {
    chunks.push({
      workId: work.id,
      workSlug: work.slug,
      workTitle: work.title,
      category: work.category,
      variant: work.variant || "ps",
      ...scope,
    });
    buildPassageChunks(scope, work).forEach((chunk) => {
      chunks.push({
        workId: work.id,
        workSlug: work.slug,
        workTitle: work.title,
        category: work.category,
        variant: work.variant || "ps",
        ...chunk,
      });
    });
  });

  return chunks.filter((chunk) => String(chunk.text || "").trim());
}

module.exports = {
  buildSemanticChunksForWork,
};
