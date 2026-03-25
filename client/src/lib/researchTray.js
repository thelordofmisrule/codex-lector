const RESEARCH_TRAY_STORAGE_KEY = "codex-research-tray-v1";
const RESEARCH_TRAY_LIMIT = 36;

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tray-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeItem(item) {
  const type = String(item?.type || "item").trim().toLowerCase();
  const dedupeKey = String(item?.dedupeKey || `${type}:${item?.href || item?.title || item?.lineId || ""}`).trim();
  return {
    id: String(item?.id || makeId()),
    dedupeKey,
    type,
    title: String(item?.title || "").trim(),
    subtitle: String(item?.subtitle || "").trim(),
    excerpt: String(item?.excerpt || "").trim(),
    href: String(item?.href || "").trim(),
    workSlug: String(item?.workSlug || "").trim(),
    workTitle: String(item?.workTitle || "").trim(),
    lineId: String(item?.lineId || "").trim(),
    lineNumber: Number(item?.lineNumber || 0) || 0,
    copyText: String(item?.copyText || item?.excerpt || item?.title || "").trim(),
    createdAt: String(item?.createdAt || new Date().toISOString()),
  };
}

export function loadResearchTray() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESEARCH_TRAY_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeItem).slice(0, RESEARCH_TRAY_LIMIT);
  } catch {
    return [];
  }
}

export function saveResearchTray(items) {
  const normalized = (Array.isArray(items) ? items : []).map(normalizeItem).slice(0, RESEARCH_TRAY_LIMIT);
  localStorage.setItem(RESEARCH_TRAY_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function upsertResearchTrayItem(items, item) {
  const nextItem = normalizeItem(item);
  const nextItems = [nextItem, ...(Array.isArray(items) ? items : []).filter((entry) => entry.dedupeKey !== nextItem.dedupeKey)];
  return nextItems.slice(0, RESEARCH_TRAY_LIMIT);
}

export function removeResearchTrayItem(items, itemId) {
  return (Array.isArray(items) ? items : []).filter((item) => item.id !== itemId);
}

export function clearResearchTray() {
  localStorage.removeItem(RESEARCH_TRAY_STORAGE_KEY);
  return [];
}
