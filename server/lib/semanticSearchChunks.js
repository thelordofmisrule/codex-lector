const { extractSearchLines } = require("./workSearch");

const MAX_SECTION_LINES = 24;
const MAX_SECTION_CHARS = 1600;
const PASSAGE_WINDOW_LINES = 6;
const PASSAGE_STRIDE_LINES = 4;
const SEMANTIC_SCAFFOLD_VERSION = "1";

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

function clipNodeText(text, maxChars = 2200) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function makeRangeLabel(first, last) {
  const start = first?.displayLineNumber || first?.lineNumber || 0;
  const end = last?.displayLineNumber || last?.lineNumber || start;
  if (!start) return "Passage";
  return start === end ? `Line ${start}` : `Lines ${start}-${end}`;
}

function splitSectionSegments(rows, work) {
  const sections = [];
  let current = [];
  let currentChars = 0;
  let segmentIndex = 0;
  let activeKey = "";

  function flush() {
    if (!current.length) return;
    const first = current[0];
    const last = current[current.length - 1];
    const sectionKey = `${activeKey}::${segmentIndex}`;
    sections.push({
      nodeType: "section",
      nodeKey: `section:${sectionKey}`,
      sectionKey,
      label: scopeLabelForRow(first, work.title),
      locationLabel: first.locationLabel || "",
      speaker: "",
      lineStart: first.lineNumber,
      lineEnd: last.lineNumber,
      displayLineStart: first.displayLineNumber || first.lineNumber,
      displayLineEnd: last.displayLineNumber || last.lineNumber,
      startLineKey: first.lineKey,
      endLineKey: last.lineKey,
      rows: current,
      chunkText: buildChunkText(current),
    });
    segmentIndex += 1;
    current = [];
    currentChars = 0;
  }

  rows.forEach((row) => {
    const key = scopeKeyForRow(row, work.slug);
    const projectedChars = currentChars + String(row.lineText || "").length + 1;
    const keyChanged = current.length > 0 && key !== activeKey;
    const tooLarge = current.length >= MAX_SECTION_LINES || projectedChars > MAX_SECTION_CHARS;

    if (keyChanged || tooLarge) flush();
    if (!current.length) activeKey = key;

    current.push(row);
    currentChars += String(row.lineText || "").length + 1;
  });

  flush();
  return sections;
}

function buildPassageNodes(section) {
  const passages = [];
  const rows = section.rows || [];
  if (!rows.length) return passages;

  const emitWindow = (windowRows, index) => {
    const first = windowRows[0];
    const last = windowRows[windowRows.length - 1];
    passages.push({
      nodeType: "passage",
      nodeKey: `${section.nodeKey}::passage:${index}`,
      parentNodeKey: section.nodeKey,
      sectionKey: section.sectionKey,
      label: makeRangeLabel(first, last),
      locationLabel: section.locationLabel || section.label || "",
      speaker: "",
      lineStart: first.lineNumber,
      lineEnd: last.lineNumber,
      displayLineStart: first.displayLineNumber || first.lineNumber,
      displayLineEnd: last.displayLineNumber || last.lineNumber,
      startLineKey: first.lineKey,
      endLineKey: last.lineKey,
      chunkText: buildChunkText(windowRows),
      rows: windowRows,
    });
  };

  if (rows.length <= PASSAGE_WINDOW_LINES) {
    emitWindow(rows, 0);
    return passages;
  }

  let passageIndex = 0;
  for (let index = 0; index < rows.length; index += PASSAGE_STRIDE_LINES) {
    const windowRows = rows.slice(index, index + PASSAGE_WINDOW_LINES);
    if (!windowRows.length) continue;
    emitWindow(windowRows, passageIndex);
    passageIndex += 1;
    if (index + PASSAGE_WINDOW_LINES >= rows.length) break;
  }

  return passages;
}

function buildSemanticScaffoldForWork(work) {
  const rows = extractSearchLines(work.content || "");
  if (!rows.length) return null;

  const sections = splitSectionSegments(rows, work).map((section) => ({
    ...section,
    chunkText: clipNodeText(section.chunkText),
    passages: buildPassageNodes(section).map((passage) => ({
      ...passage,
      chunkText: clipNodeText(passage.chunkText, 1600),
    })),
  }));

  const first = rows[0];
  const last = rows[rows.length - 1];
  return {
    root: {
      nodeType: "work",
      nodeKey: `work:${work.slug}`,
      label: work.title,
      locationLabel: work.title,
      speaker: "",
      lineStart: first.lineNumber,
      lineEnd: last.lineNumber,
      displayLineStart: first.displayLineNumber || first.lineNumber,
      displayLineEnd: last.displayLineNumber || last.lineNumber,
      startLineKey: first.lineKey,
      endLineKey: last.lineKey,
      chunkText: "",
    },
    sections,
  };
}

module.exports = {
  buildSemanticScaffoldForWork,
  SEMANTIC_SCAFFOLD_VERSION,
};
