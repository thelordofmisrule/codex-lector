import calendarCsv from "../data/year_of_shakespeare_2026_2027_daily.csv?raw";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (ch === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (ch === "\"") {
        inQuotes = false;
      } else {
        value += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(value);
      value = "";
      continue;
    }
    if (ch === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    if (ch === "\r") continue;
    value += ch;
  }

  row.push(value);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

export function parseCalendarRows(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => String(header || "").trim().toLowerCase());
  const idx = (name) => headers.indexOf(name.toLowerCase());
  const dateIdx = idx("date");
  const worksIdx = idx("work(s)");
  const kindIdx = idx("kind");
  const arcIdx = idx("seasonal arc");
  const anchorIdx = idx("anchor");
  const reasonIdx = idx("reason");

  return rows.slice(1).map((row, index) => {
    const isoDate = String(row[dateIdx] || "").trim();
    if (!isoDate) return null;
    const dateObj = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(dateObj.getTime())) return null;
    return {
      id: `${isoDate}-${index}`,
      date: isoDate,
      dateObj,
      works: String(row[worksIdx] || "").trim(),
      kind: String(row[kindIdx] || "").trim(),
      seasonalArc: String(row[arcIdx] || "").trim(),
      anchor: String(row[anchorIdx] || "").trim(),
      reason: String(row[reasonIdx] || "").trim(),
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

export const YEAR_OF_SHAKESPEARE_ROWS = parseCalendarRows(calendarCsv);

export function toMonthKey(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function longDateLabel(dateObj) {
  return dateObj.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function normalizeTitleKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function candidateTitleKeys(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  const keys = new Set();

  const add = (candidate) => {
    const normalized = normalizeTitleKey(candidate);
    if (normalized) keys.add(normalized);
  };

  add(raw);
  add(raw.replace(/,\s*part\s+(\d+)/i, " Part $1"));
  add(raw.replace(/\s+part\s+(\d+)/i, ", Part $1"));

  if (lower.startsWith("the ")) add(raw.replace(/^the\s+/i, ""));
  else add(`The ${raw}`);

  if (lower.startsWith("sonnets")) add("Sonnets");

  return [...keys];
}

export function resolveWorkLinks(workLabel, kind, workLookup) {
  const candidates = candidateTitleKeys(workLabel);
  let found = null;
  for (const key of candidates) {
    if (workLookup[key]) {
      found = workLookup[key];
      break;
    }
  }

  if (!found && candidates.length) {
    const target = candidates[0];
    let best = null;
    let bestScore = -1;
    Object.entries(workLookup).forEach(([key, value]) => {
      if (!key || (!key.includes(target) && !target.includes(key))) return;
      const score = Math.min(key.length, target.length);
      if (score > bestScore) {
        bestScore = score;
        best = value;
      }
    });
    found = best;
  }

  const base = found || { modernSlug: "", firstFolioSlug: "", anySlug: "" };
  const lowerKind = String(kind || "").toLowerCase();
  const isPlay = lowerKind.includes("play");

  if (isPlay) {
    const actions = [];
    const modernSlug = base.modernSlug || base.anySlug;
    if (modernSlug) actions.push({ label: "Modern", slug: modernSlug });
    if (base.firstFolioSlug) actions.push({ label: "First Folio", slug: base.firstFolioSlug });
    if (!actions.length && base.anySlug) actions.push({ label: "Open Work", slug: base.anySlug });
    return actions;
  }

  const poemSlug = base.modernSlug || base.anySlug || base.firstFolioSlug;
  return poemSlug ? [{ label: "Open Work", slug: poemSlug }] : [];
}

export function getCalendarRowsForWork(workTitle, rows = YEAR_OF_SHAKESPEARE_ROWS) {
  const workKeys = new Set(candidateTitleKeys(workTitle));
  if (!workKeys.size) return [];

  return rows.filter((row) => {
    const rowKeys = candidateTitleKeys(row.works);
    return rowKeys.some((key) => workKeys.has(key));
  });
}

function shortMonthDay(dateObj) {
  return dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function buildReadingWaypoints(totalLines, rows) {
  if (!totalLines || totalLines < 2 || !rows?.length || rows.length < 2) return [];

  const markers = [];
  const usedLineIndexes = new Set();

  rows.slice(0, -1).forEach((row, index) => {
    const lineIndex = Math.min(totalLines, Math.max(1, Math.ceil(totalLines * ((index + 1) / rows.length))));
    if (usedLineIndexes.has(lineIndex)) return;
    usedLineIndexes.add(lineIndex);

    const nextRow = rows[index + 1];
    markers.push({
      lineIndex,
      label: `Read to here on ${shortMonthDay(row.dateObj)}`,
      nextLabel: nextRow ? `Resume on ${shortMonthDay(nextRow.dateObj)}` : "",
      date: row.date,
    });
  });

  return markers;
}
